/**
 * syncWorker.js
 * 
 * Web Worker dedicado a descargar nativamente archivos .xlsx de Google Drive 
 * (usando SheetJS y un proxy CORS), parsearlos a JSON por bloques (chunks) 
 * y guardarlos en IndexedDB.
 */

importScripts("https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js");

const DB_NAME = 'InventoryDB_Pro';
const DB_VERSION = 5; // Bumping for multi-link inventory wipe

// Proxies de CORS gratuitos para saltar bloqueos de Google Drive
const PROXIES = [
    // Usamos el backend Vercel propio para proxy 100% confiable
    (url) => `/api/proxy-csv?url=${encodeURIComponent(url)}`,
    (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}` // Backup
];

// Helper para extraer el ID y convertir a formato CSV directo de Google Sheets
function getBaseDriveDownloadUrl(genericLink) {
    if (!genericLink) return null;
    const match = genericLink.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (!match || !match[1]) throw new Error("Link de Drive inválido.");
    // Usamos el export nativo de Sheets a CSV, que es mucho más rápido y suele tener menos problemas de CORS
    return `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv`;
}

// Conexión a IndexedDB desde el Worker
function openDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;

            // Borrar tablas viejas
            if (db.objectStoreNames.contains('Inventory_Items')) db.deleteObjectStore('Inventory_Items');
            if (db.objectStoreNames.contains('History_Items')) db.deleteObjectStore('History_Items');
            if (db.objectStoreNames.contains('Events_Items')) db.deleteObjectStore('Events_Items');

            // Re-crear con la llave 'id_pk'
            db.createObjectStore('Inventory_Items', { keyPath: 'id_pk' });
            db.createObjectStore('History_Items', { keyPath: 'id_pk' });
            db.createObjectStore('Events_Items', { keyPath: 'id_pk' });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function saveChunkToIndexedDB(db, storeName, objects) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        objects.forEach(obj => store.put(obj));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

async function processSingleLink(link, storeName, db) {
    if (!link) return { processed: 0, status: 'skipped' };

    const baseDownloadUrl = getBaseDriveDownloadUrl(link);
    let lastError = null;

    // Intentamos con varios proxies por si uno está caído o bloqueado
    for (const proxyFn of PROXIES) {
        const targetUrl = proxyFn(baseDownloadUrl);
        try {
            console.log(`[Worker] Intentando descargar ${storeName} vía proxy...`);

            // Timeout de 15 segundos nativo
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);

            const response = await fetch(targetUrl, { signal: controller.signal });
            clearTimeout(timeoutId);

            if (!response.ok) {
                console.warn(`[Worker] Proxy falló (${response.status}). Probando siguiente...`);
                continue;
            }

            const arrayBuffer = await response.arrayBuffer();

            if (arrayBuffer.byteLength < 500) {
                // Probablemente un error del proxy devuelto como HTML
                console.warn(`[Worker] El proxy devolvió data insuficiente. Probando siguiente...`);
                continue;
            }

            // Si llegamos aquí, tenemos el buffer
            return await parseAndSaveExcel(arrayBuffer, storeName, db);

        } catch (err) {
            lastError = err;
            console.warn(`[Worker] Error de red con el proxy o timeout: ${err.message}. Intentando otro...`);
        }
    }

    throw new Error(`Fallback proxies fallaron. Revise su conexión a Internet o los permisos de lectura pública del Google Sheet.`);
}

async function parseAndSaveExcel(arrayBuffer, storeName, db) {
    try {
        // En lugar de leer como XLSX binario, leemos como texto (CSV)
        const decoder = new TextDecoder('utf-8');
        const csvText = decoder.decode(arrayBuffer);

        // Parsear el CSV crudo extrayendo las líneas.
        // Implementación ultra ligera de parseo CSV (asumiendo formato estándar de Google Sheets)
        const lines = csvText.split(/\r?\n/);
        if (lines.length < 2) return { processed: 0, status: 'empty' };

        // Parse headers (primera línea)
        const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim());
        const jsonData = [];

        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue; // saltar líneas vacías

            // Regex para separar comas respetando comillas
            const values = lines[i].match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || lines[i].split(',');

            const rowObj = {};
            let hasData = false;
            headers.forEach((header, index) => {
                let val = values[index] ? values[index].replace(/^"|"$/g, '').trim() : '';
                rowObj[header] = val;
                if (val !== '') hasData = true;
            });

            if (hasData) jsonData.push(rowObj);
        }

        if (jsonData.length === 0) return { processed: 0, status: 'empty' };

        const CHUNK_SIZE = 50;
        let processed = 0;

        for (let i = 0; i < jsonData.length; i += CHUNK_SIZE) {
            const chunkObjects = jsonData.slice(i, i + CHUNK_SIZE);

            for (let idx = 0; idx < chunkObjects.length; idx++) {
                const obj = chunkObjects[idx];
                // Google Sheets CSV Export devuelve los campos exactamente como las cabeceras
                obj.id_pk = obj.ACTIVO || obj.Codigo || `generated_${storeName}_${i + idx}`;
            }

            await saveChunkToIndexedDB(db, storeName, chunkObjects);
            processed += chunkObjects.length;
        }

        return { processed, status: 'success' };
    } catch (err) {
        throw new Error(`Error parseando el archivo CSV de ${storeName}: ${err.message}`);
    }
}

// Escuchar mensajes del hilo principal
self.addEventListener('message', async (e) => {
    const { type, links } = e.data;

    if (type === 'START_SYNC') {
        try {
            self.postMessage({ status: 'syncing', progress: 10 });

            const db = await openDB();
            let totalProcessed = 0;

            // Procesamiento en serie para no ahogar la RAM de móviles gama baja
            if (links.inventario) {
                const invLinks = Array.isArray(links.inventario) ? links.inventario : [links.inventario];
                for (let i = 0; i < invLinks.length; i++) {
                    const l = invLinks[i];
                    self.postMessage({ status: 'progress', progress: Math.floor(10 + (i / invLinks.length) * 30) });
                    const res = await processSingleLink(l, 'Inventory_Items', db);
                    totalProcessed += res.processed;
                }
            }

            if (links.eventos) {
                const res = await processSingleLink(links.eventos, 'Events_Items', db);
                totalProcessed += res.processed;
                self.postMessage({ status: 'progress', progress: 70 });
            }

            if (links.historial) {
                const res = await processSingleLink(links.historial, 'History_Items', db);
                totalProcessed += res.processed;
                self.postMessage({ status: 'progress', progress: 95 });
            }

            self.postMessage({ status: 'success', message: 'Sincronización multi-link completada', total: totalProcessed });
        } catch (error) {
            self.postMessage({ status: 'error', error: error.message });
        }
    }
});
