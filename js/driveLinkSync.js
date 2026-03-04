/**
 * driveLinkSync.js
 * 
 * Módulo de conexión para el frontend. 
 * Maneja el ciclo de vida del Web Worker y lee desde las 3 bases de datos (Inventario, Historial, Eventos)
 * almacenadas en IndexedDB.
 */

// Pega aquí los links que correspondan a cada pestaña
// Pega aquí los links que correspondan a cada pestaña
const DRIVE_LINKS = {
    inventario: [
        "https://docs.google.com/spreadsheets/d/12RufVKNKNtGH7dEhDvYbc0fmFX6EyVyh/edit?usp=sharing", // AUDIO
        "https://docs.google.com/spreadsheets/d/1WnwXnaTyn7ZLro9TAwEjEvw21ZqrlNU0/edit?usp=sharing", // BODEGA
        "https://docs.google.com/spreadsheets/d/1rH6Ama5o--rRxvtcRonsAFIfjdYWo-og/edit?usp=sharing", // ILUMINACION
        "https://docs.google.com/spreadsheets/d/15th4w8laxjLniH-qE0tXrHk9avvE7-Dp/edit?usp=sharing", // RIGGING
        "https://docs.google.com/spreadsheets/d/1i_5-NkV0oWA7incDhTx8wHb9t9oEYROe/edit?usp=sharing"  // VIDEO
    ],
    eventos: "",
    historial: ""
};

class DriveLinkSyncService {
    constructor() {
        this.worker = null;
        this.db = null;
        this.initLocalDB();
        this.initWorker();
    }

    async initLocalDB() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open('InventoryDB_Pro', 5);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;

                // Si venimos de una versión anterior o errónea, eliminamos las tablas viejas
                if (db.objectStoreNames.contains('Inventory_Items')) db.deleteObjectStore('Inventory_Items');
                if (db.objectStoreNames.contains('History_Items')) db.deleteObjectStore('History_Items');
                if (db.objectStoreNames.contains('Events_Items')) db.deleteObjectStore('Events_Items');

                // Creamos desde cero con la nueva Primary Key adaptada
                db.createObjectStore('Inventory_Items', { keyPath: 'id_pk' });
                db.createObjectStore('History_Items', { keyPath: 'id_pk' });
                db.createObjectStore('Events_Items', { keyPath: 'id_pk' });
            };
            req.onsuccess = (e) => {
                this.db = e.target.result;
                resolve();
            };
            req.onerror = () => reject(req.error);
        });
    }

    initWorker() {
        if (!window.Worker) {
            console.error("Web Workers no soportados.");
            return;
        }

        this.worker = new Worker('js/syncWorker.js');

        this.worker.addEventListener('message', (e) => {
            const data = e.data;

            if (data.status === 'syncing' || data.status === 'progress') {
                this._updateVisualState('syncing', data.progress);
            } else if (data.status === 'success') {
                this._updateVisualState('synced');
                console.log(`[DriveLinkSync] Éxito: Sincronización multi-link terminada. (${data.total} filas)`);

                // Dispara el repintado de TODA la UI localmente
                window.dispatchEvent(new CustomEvent('data-updated', { detail: { action: 'getInventory' } }));
                window.dispatchEvent(new CustomEvent('data-updated', { detail: { action: 'getEvents' } }));
                window.dispatchEvent(new CustomEvent('data-updated', { detail: { action: 'getHistory' } }));
            } else if (data.status === 'error') {
                this._updateVisualState('error', data.error);
                console.error("[DriveLinkSync] Fallo en el Worker:", data.error);
            }
        });

        // Lanzar la sincronización tras 2 segundos para priorizar animaciones UI
        setTimeout(() => this.triggerBackgroundSync(), 2000);
    }

    triggerBackgroundSync() {
        if (!this.worker) return;
        this.worker.postMessage({ type: 'START_SYNC', links: DRIVE_LINKS });
    }

    /**
     * Extrae data local de IndexedDB al instante sin red.
     * @param {string} storeName - Nombre de la tabla a consultar
     */
    async getFromLocalDB(storeName) {
        if (!this.db) await this.initLocalDB();

        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const req = store.getAll();

            req.onsuccess = () => resolve({ success: true, items: req.result });
            req.onerror = () => reject({ success: false, error: req.error });
        });
    }

    _updateVisualState(state, detail = null) {
        const indicator = document.getElementById('sync-status');
        if (!indicator) return;

        indicator.classList.remove('offline', 'synced', 'syncing', 'error');
        indicator.classList.add(state === 'error' ? 'error' : state);

        const icon = indicator.querySelector('i');
        const text = indicator.querySelector('span');

        if (state === 'syncing') {
            icon.innerText = 'sync';
            icon.classList.add('spin-animation');
            text.innerText = detail ? `Sincronizando... ${detail}%` : `Sincronizando...`;
        } else if (state === 'synced') {
            icon.innerText = 'cloud_done';
            icon.classList.remove('spin-animation');
            text.innerText = 'App Actualizada';
            indicator.classList.remove('bg-red-500'); // Remove tailwind red if any
            setTimeout(() => { text.innerText = 'Al día'; }, 3000);
        } else if (state === 'error') {
            icon.innerText = 'cloud_off';
            icon.classList.remove('spin-animation');
            text.innerText = detail || 'Error de sincronización';
            setTimeout(() => { text.innerText = 'Sin conexión'; indicator.classList.add('offline'); }, 5000);
        }
    }
}

// Singleton global
const LocalDriveSync = new DriveLinkSyncService();
