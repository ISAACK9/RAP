/**
 * api.js (Refactored to OfflineSyncService)
 * 
 * Handles:
 * 1. Asynchronous fetch to Node.js backend (or GAS as fallback).
 * 2. Local caching of GET requests for instant load.
 * 3. Pending Queue for offline POST requests (Optimistic UI).
 * 4. Background Sync polling.
 */

// Detectar automáticamente si estamos en Vercel (producción) o en local
const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:';
const API_URL = isLocalhost ? "http://localhost:3000/api/action" : "/api/action";

const CACHE_KEY = "inventory_data_cache";
const QUEUE_KEY = "inventory_sync_queue";
const SYNC_INTERVAL_MS = 10000; // Check queue every 10 seconds

class OfflineSyncService {
    constructor() {
        this.cache = JSON.parse(localStorage.getItem(CACHE_KEY)) || {
            dashboard: null,
            inventory: null,
            history: null,
            events: null,
            lastUpdated: null
        };

        this.syncQueue = JSON.parse(localStorage.getItem(QUEUE_KEY)) || [];
        this.isSyncing = false;

        // Start background worker
        setInterval(() => this.processQueue(), SYNC_INTERVAL_MS);
        window.addEventListener('online', () => this.processQueue());
        window.addEventListener('offline', () => this.updateSyncStatusIndicator('offline'));
    }

    /**
     * Internal generic fetch logic. NEVER blocks the UI.
     */
    async _networkFetch(payload) {
        if (!navigator.onLine) throw new Error("Offline");
        // Si no se ha encendido el servidor o algo falla al inicio, mantenemos un fallback visual
        if (API_URL === "SU_URL_DE_GAS_AQUI") return this._mockFetch(payload);

        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                mode: 'cors',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                // Si el server de Node no está corriendo (ERR_CONNECTION_REFUSED)
                // caerá en el catch y simulará fetch local para desarrollo
                throw new Error(`HTTP ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.warn("Fallo de red hacia el servidor Node.js. Intentando fallback local...");
            return this._mockFetch(payload);
        }
    }

    /**
     * Reads Data: Returns CACHE INSTANTLY, then fetches in background.
     * @param {string} action - e.g., 'getInventory'
     * @param {object} params - like pagination {offset: 0, limit: 50}
     */
    async query(action, params = {}) {
        const cacheMap = {
            'getDashboardStats': 'dashboard',
            'getInventory': 'inventory',
            'getHistory': 'history',
            'getEvents': 'events'
        };

        const cacheKey = cacheMap[action];
        let localData = cacheKey ? this.cache[cacheKey] : null;

        // Trigger background fetch
        this._networkFetch({ action, params }).then(serverData => {
            if (serverData.success && cacheKey) {
                // Determine if we are replacing or appending (lazy load)
                if (params.offset > 0 && Array.isArray(localData?.items)) {
                    serverData.items = [...localData.items, ...serverData.items];
                }

                this.cache[cacheKey] = serverData;
                this.cache.lastUpdated = Date.now();
                this._saveCache();

                // Dispatch event so UI can quietly re-render if it changed
                window.dispatchEvent(new CustomEvent('data-updated', { detail: { action, data: serverData } }));
            }
        }).catch(e => { /* Silently fail on background read */ });

        // Optimistically return local cache instantly to avoid freezing UI
        if (localData) return localData;

        // Only array-wait if Cache is strictly empty
        try {
            this.updateSyncStatusIndicator('syncing');
            const data = await this._networkFetch({ action, params });
            if (data.success && cacheKey) {
                this.cache[cacheKey] = data;
                this._saveCache();
            }
            this.updateSyncStatusIndicator('synced');
            return data;
        } catch (e) {
            this.updateSyncStatusIndicator('offline');
            return { success: false, items: [], error: e.message };
        }
    }

    /**
     * Modifies Data (Optimistic UI): Saves to IndexedDB instantly, queues for network.
     * @param {string} action - e.g., 'processScan'
     * @param {object} data - payload data
     */
    async mutate(action, data) {
        const transactionId = Date.now() + Math.random().toString(36).substring(7);
        const payload = { id: transactionId, action, data, retries: 0 };

        // 1. Optimistic Updates in Local DB (IndexedDB)
        if (action === 'processScan') {
            await this._optimisticScanUpdate(data);
        }

        // 2. Add to Queue
        this.syncQueue.push(payload);
        this._saveQueue();

        // 3. Try to process queue immediately without awaiting
        this.processQueue();

        return { success: true, message: "Movimiento registrado (Sincronizando...)" };
    }

    /**
     * Modifies IndexedDB instantly so UI reflects the movement
     */
    async _optimisticScanUpdate(scanData) {
        if (!LocalDriveSync || !LocalDriveSync.db) return;

        const { code, type, user, timestamp, equipoNombre } = scanData;
        const newStatus = type === 'salida' ? 'En Préstamo' : 'Disponible';

        return new Promise((resolve, reject) => {
            // Update Inventory Cache in IndexedDB
            const tx = LocalDriveSync.db.transaction(['Inventory_Items', 'History_Items'], 'readwrite');
            const invStore = tx.objectStore('Inventory_Items');
            const histStore = tx.objectStore('History_Items');

            // 1. Get current item to update its status
            const getReq = invStore.get(code); // Asumiendo que Primary Key es id_pk (que ahora será ACTIVO)
            getReq.onsuccess = () => {
                const item = getReq.result;
                if (item) {
                    item.Estado = newStatus;
                    invStore.put(item);
                }
            };

            // 2. Append new history record
            const newHistoryRecord = {
                id_pk: `optimistic_${Date.now()}`,
                Fecha: timestamp,
                Codigo: code, // Manteniendo Codigo en el historial como alias del activo escaneado
                Equipo: equipoNombre || item?.ARTICULO || item?.Nombre || 'Desconocido',
                Accion: type.toUpperCase(),
                Usuario: user
            };
            histStore.put(newHistoryRecord);

            tx.oncomplete = () => {
                // Force UI re-render on current view without loader
                window.dispatchEvent(new CustomEvent('optimistic-update'));
                resolve();
            };
            tx.onerror = reject;
        });
    }

    async processQueue() {
        if (this.isSyncing || this.syncQueue.length === 0 || !navigator.onLine) {
            if (!navigator.onLine && this.syncQueue.length > 0) this.updateSyncStatusIndicator('offline');
            return;
        }

        this.isSyncing = true;
        this.updateSyncStatusIndicator('syncing');

        const pending = [...this.syncQueue];

        for (let task of pending) {
            try {
                const response = await this._networkFetch({ action: task.action, data: task.data });
                if (response.success) {
                    // Remove from queue on success
                    this.syncQueue = this.syncQueue.filter(t => t.id !== task.id);
                    this._saveQueue();
                } else {
                    throw new Error("Server rejected operation");
                }
            } catch (error) {
                console.error(`Sync failed for task ${task.id}`, error);
                task.retries++;
                this._saveQueue();
                // Break loop on network failure to retry all later
                break;
            }
        }

        this.isSyncing = false;
        if (this.syncQueue.length === 0) {
            this.updateSyncStatusIndicator('synced');
        } else {
            this.updateSyncStatusIndicator('offline');
        }
    }

    _saveCache() { localStorage.setItem(CACHE_KEY, JSON.stringify(this.cache)); }
    _saveQueue() { localStorage.setItem(QUEUE_KEY, JSON.stringify(this.syncQueue)); }

    updateSyncStatusIndicator(status) {
        const indicator = document.getElementById('sync-status');
        if (!indicator) return;

        indicator.classList.remove('offline', 'synced', 'syncing');
        indicator.classList.add(status);

        const icon = indicator.querySelector('i');
        const text = indicator.querySelector('span');

        if (status === 'syncing') {
            icon.innerText = 'sync';
            icon.classList.add('spin-animation');
            text.innerText = this.syncQueue.length > 0 ? `Sincronizando (${this.syncQueue.length})` : 'Conectando...';
        } else if (status === 'offline') {
            icon.innerText = 'cloud_off';
            icon.classList.remove('spin-animation');
            text.innerText = this.syncQueue.length > 0 ? `Pendientes (${this.syncQueue.length})` : 'Sin conexión';
        } else if (status === 'synced') {
            icon.innerText = 'cloud_done';
            icon.classList.remove('spin-animation');
            text.innerText = 'Al día';
        }
    }

    // --- Mock Fetch for UI Testing ---
    _mockFetch(payload) {
        return new Promise(resolve => {
            setTimeout(() => {
                if (payload.action === 'getDashboardStats') {
                    resolve({
                        success: true,
                        stats: { total: 120, prestamos: 20, disponibles: 100 },
                        recents: [{ Fecha: new Date().toISOString(), Codigo: 'EQ-001', Equipo: 'Mock Laptop', Accion: 'ENTRADA', Usuario: 'Tester' }]
                    });
                } else if (payload.action === 'getInventory') {
                    // Simulating pagination lazy load
                    const limit = payload.params?.limit || 50;
                    const offset = payload.params?.offset || 0;
                    const items = [];
                    for (let i = 1; i <= limit; i++) {
                        items.push({ Codigo: `MOCK-${offset + i}`, Nombre: `Herramienta ${offset + i}`, Categoria: 'Mock', Estado: 'Disponible' });
                    }
                    resolve({ success: true, items });
                } else if (payload.action === 'getHistory') {
                    const limit = payload.params?.limit || 50;
                    const items = [];
                    for (let i = 1; i <= 3; i++) {
                        items.push({ Fecha: new Date().toISOString(), Codigo: `MOCK-${i}`, Equipo: `Mock ${i}`, Accion: 'SALIDA', Usuario: 'Prueba' });
                    }
                    resolve({ success: true, items });
                } else if (payload.action === 'getEvents') {
                    resolve({
                        success: true,
                        items: [
                            { Fecha: new Date().toISOString(), Titulo: 'Auditoría', Descripcion: 'Revisión semestral', Autor: 'Admin' }
                        ]
                    });
                } else if (payload.action === 'processScan') {
                    resolve({ success: true });
                }
            }, 500); // simulate latency
        });
    }
}

// Global UI state managers
const UI = {
    // We keep these, but they will be barely used thanks to Optimistic UI
    showLoader: (text) => { /* Only for critical blocks, e.g. login */ },
    hideLoader: () => { /* ... */ },
    showToast: (message, type = 'success') => {
        const container = document.getElementById('toast-container');
        if (!container) return;

        // Aplica estilos al container absoluto si no los tiene en CSS
        if (!container.className.includes('fixed')) {
            container.className = "fixed bottom-5 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 z-50 pointer-events-none";
        }

        const toast = document.createElement('div');
        const isSuccess = type === 'success';
        const bgColor = isSuccess ? 'bg-gray-900 border-gray-800 text-white' : 'bg-red-500 border-red-600 text-white';
        const iconColor = isSuccess ? 'text-green-400' : 'text-white';
        const icon = isSuccess ? 'check_circle' : 'error_outline';

        toast.className = `flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl shadow-black/10 border ${bgColor} transform transition-all duration-300 translate-y-4 opacity-0`;

        toast.innerHTML = `<i class="material-icons-round ${iconColor}">${icon}</i> <span class="text-sm font-medium tracking-wide">${message}</span>`;
        container.appendChild(toast);

        // Animación de entrada
        requestAnimationFrame(() => {
            toast.classList.remove('translate-y-4', 'opacity-0');
        });

        setTimeout(() => {
            toast.classList.add('translate-y-4', 'opacity-0');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
};

// Singleton Instance
const DB = new OfflineSyncService();

// Implementación ligera de SWR (Stale-While-Revalidate) para Vanilla JS
window.cacheSWR = new Map();
const CACHE_TTL_MS = 60000; // 1 minuto de vigencia del caché

window.fetchWithSWR = async function (key, fetcherFunction, onDataChange) {
    const now = Date.now();
    const cached = window.cacheSWR.get(key);

    // 1. STALE: Si hay caché (incluso si está expirado), devuélvelo INMEDIATAMENTE al callback
    if (cached && cached.data) {
        onDataChange(cached.data);
    }

    // 2. VALIDACIÓN: Si no hay caché o ya caducó (TTL), vamos a "Revalidar" en el fondo
    if (!cached || (now - cached.timestamp > CACHE_TTL_MS)) {
        try {
            const freshData = await fetcherFunction();

            // Comparamos si la data nueva es diferente a la cacheadada
            const isDifferent = JSON.stringify(freshData) !== JSON.stringify(cached?.data);

            if (isDifferent || !cached) {
                window.cacheSWR.set(key, { data: freshData, timestamp: Date.now() });
                onDataChange(freshData);
            }
        } catch (error) {
            console.error(`SWR Error revalidando [${key}]:`, error);
        }
    }
};
