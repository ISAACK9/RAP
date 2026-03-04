// App.js - Core application logic and routing

document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    bindMainEvents();
    loadDashboard(); // Load initial view
});

function bindMainEvents() {
    // Manual Sync Button
    const syncBtn = document.getElementById('btn-sync-inventory');
    if (syncBtn) {
        syncBtn.addEventListener('click', () => {
            UI.showToast("Sincronizando con Google Drive...", "info");
            LocalDriveSync.triggerBackgroundSync();
        });
    }

    // Basic search functionality for inventory
    document.getElementById('search-inventory')?.addEventListener('input', applyInventoryFilters);
}

// Listen for background updates purely driven by DB service
window.addEventListener('data-updated', (e) => {
    const { action } = e.detail;
    // Sliently re-render if we are on that screen
    if (action === 'getInventory' && !document.getElementById('view-inventory').classList.contains('hidden')) {
        loadInventory();
    }
});

// App State for Filtering
window.currentInventoryFilter = 'all';

// Listen for instant Optimistic UI updates (no network await required)
window.addEventListener('optimistic-update', () => {
    if (!document.getElementById('view-inventory').classList.contains('hidden')) loadInventory();
    if (!document.getElementById('view-home').classList.contains('hidden')) loadDashboard();
});

/**
 * SPA Navigation Logic
 */
function initNavigation() {
    const navLinks = document.querySelectorAll('.nav-links a');
    const views = document.querySelectorAll('.view');

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();

            // Remove active from all links and views
            navLinks.forEach(l => l.classList.remove('active'));
            views.forEach(v => v.classList.add('hidden', 'active')); // Active class has fadeIn animation

            // Add active to clicked link
            link.classList.add('active');

            // Hide target view immediately, remove active then trigger fadeIn
            const targetRoute = link.getAttribute('data-route');
            const targetView = document.getElementById(`view-${targetRoute}`);
            if (targetView) {
                targetView.classList.remove('hidden');

                // Allow CSS transition to trigger by delaying active class slightly
                requestAnimationFrame(() => {
                    targetView.classList.add('active');
                });

                loadViewData(targetRoute);
            }
        });
    });
}

/**
 * Route Handler to load data asynchronously
 */
async function loadViewData(route) {
    switch (route) {
        case 'home':
            await loadDashboard();
            break;
        case 'inventory':
            await loadInventory();
            break;
        case 'events':
            await loadEvents();
            break;
        case 'history':
            await loadHistory();
            break;
    }
}

/**
 * Load Dashboard (Home) Data
 */
async function loadDashboard() {
    try {
        // Simulating skeletons while fetching
        document.getElementById('recent-movements-list').innerHTML = `
            <li class="skeleton-item animate-pulse h-12 bg-gray-200 rounded-lg mb-2"></li>
            <li class="skeleton-item animate-pulse h-12 bg-gray-200 rounded-lg mb-2"></li>
            <li class="skeleton-item animate-pulse h-12 bg-gray-200 rounded-lg mb-2"></li>
        `;

        // 1. Usa SWR para la lectura de Dashboard (Inventory + History)
        window.fetchWithSWR('dashboardData',
            () => Promise.all([
                LocalDriveSync.getFromLocalDB('Inventory_Items'),
                LocalDriveSync.getFromLocalDB('History_Items')
            ]),
            ([response, historyRes]) => {
                if (response && response.success) {
                    const items = response.items || [];
                    const prestados = items.filter(i => i.Estado && i.Estado.toLowerCase() === 'en préstamo').length;

                    document.getElementById('stat-total-equipos').innerText = items.length || 0;
                    document.getElementById('stat-prestamo').innerText = prestados;
                    document.getElementById('stat-disponibles').innerText = items.length - prestados;

                    // Render Recents from History Table
                    const list = document.getElementById('recent-movements-list');
                    list.innerHTML = '';

                    const recents = (historyRes.items || []).slice(0, 3); // Top 3

                    if (!recents || recents.length === 0) {
                        list.innerHTML = '<li>No hay movimientos recientes o la base de datos está vacía.</li>';
                        return;
                    }

                    recents.forEach(item => {
                        const li = document.createElement('li');
                        li.style.padding = "1rem";
                        li.style.borderBottom = "1px solid var(--border-glass)";

                        const icon = item.Accion === 'SALIDA' ? 'logout' : 'login';
                        const color = item.Accion === 'SALIDA' ? 'var(--warning)' : 'var(--success)';

                        li.innerHTML = `
                            <div style="display:flex; align-items:center; gap: 1rem;">
                                <i class="material-icons-round" style="color: ${color}">${icon}</i>
                                <div style="flex:1">
                                    <p style="font-weight: 600; margin-bottom: 0.2rem;">${item.Equipo || 'Equipo'} - ${item.Accion}</p>
                                    <span style="font-size: 0.8rem; color: var(--text-secondary)">Por: ${item.Usuario} | ${new Date(item.Fecha).toLocaleString()}</span>
                                </div>
                            </div>
                        `;
                        list.appendChild(li);
                    });
                }
            }
        ).catch(e => {
            console.error("Dashboard SWR error:", e);
            UI.showToast("Error consultando caché del dashboard", "error");
        });
    } catch (error) {
        console.error("Dashboard error:", error);
        UI.showToast("Error crítico cargando el dashboard", "error");
    } finally {
        UI.hideLoader();
    }
}

/**
 * Load Inventory Data
 */
async function loadInventory() {
    try {
        const list = document.getElementById('inventory-list');
        // Skeletons visual inmediatos
        if (!window.currentInventoryData) {
            list.innerHTML = `
                <li class="skeleton-item animate-pulse h-24 bg-gray-200 rounded-xl mb-3"></li>
                <li class="skeleton-item animate-pulse h-24 bg-gray-200 rounded-xl mb-3"></li>
                <li class="skeleton-item animate-pulse h-24 bg-gray-200 rounded-xl mb-3"></li>
            `;
        }

        // Lectura usando SWR
        window.fetchWithSWR('inventoryData',
            () => LocalDriveSync.getFromLocalDB('Inventory_Items'),
            (response) => {
                if (response && response.success) {
                    window.currentInventoryData = response.items || [];
                    applyInventoryFilters();
                }
            }
        ).catch(e => {
            console.error("Inventory SWR error:", e);
            UI.showToast("Error verificando inventario en caché", "error");
        });
    } catch (error) {
        console.error("Inventory error:", error);
        UI.showToast("Error cargando inventario", "error");
    }
}

function applyInventoryFilters() {
    if (!window.currentInventoryData) return;

    const searchTerm = (document.getElementById('search-inventory')?.value || '').toLowerCase();
    const filterArea = window.currentInventoryFilter;

    const filtered = window.currentInventoryData.filter(item => {
        const matchSearch = (item.ARTICULO && item.ARTICULO.toLowerCase().includes(searchTerm)) ||
            (item.ACTIVO && String(item.ACTIVO).toLowerCase().includes(searchTerm));
        const matchArea = filterArea === 'all' || (item.AREA && item.AREA === filterArea);

        return matchSearch && matchArea;
    });

    renderInventory(filtered);
}

function renderInventory(items) {
    const list = document.getElementById('inventory-list');
    list.innerHTML = '';

    if (items.length === 0) {
        list.innerHTML = '<li class="text-center py-10 text-gray-500 font-medium bg-white rounded-3xl border border-dashed border-gray-200">No hay equipos en el inventario que coincidan con la búsqueda.</li>';
        return;
    }

    items.forEach(item => {
        const li = document.createElement('li');
        li.className = "bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex flex-col sm:flex-row sm:justify-between sm:align-start gap-4 hover:shadow-md transition-all hover:-translate-y-0.5 cursor-pointer relative overflow-hidden";

        const estadoActual = item.Estado || 'Disponible';
        const isDisponible = estadoActual === 'Disponible';
        const statusColorCls = isDisponible ? 'text-green-700 bg-green-100' : 'text-amber-700 bg-amber-100';

        li.innerHTML = `
            <div class="flex-1">
                <div class="flex items-start gap-2 mb-1">
                    <h3 class="text-base font-bold text-gray-900 leading-tight">${item.ARTICULO || 'Sin nombre'}</h3>
                    <span class="text-xs font-mono text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-md">#${item.ACTIVO || ''}</span>
                </div>
                <p class="text-sm text-gray-500 flex items-center gap-2">
                    <span class="inline-flex items-center gap-1"><i class="material-icons-round text-sm">home_work</i> ${item.AREA || 'N/A'}</span>
                    <span>&bull;</span>
                    <span class="inline-flex items-center gap-1"><i class="material-icons-round text-sm">label</i> ${item.MARCA || 'N/A'}</span>
                </p>
            </div>
            <div class="shrink-0 flex sm:flex-col sm:items-end items-center justify-between">
                <span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${statusColorCls}">
                    ${isDisponible ? '<span class="w-1.5 h-1.5 bg-green-500 rounded-full mr-1.5"></span>' : '<span class="w-1.5 h-1.5 bg-amber-500 rounded-full mr-1.5 animate-pulse"></span>'}
                    ${estadoActual}
                </span>
            </div>
        `;
        list.appendChild(li);
    });
}

// Basic search functionality for inventory logic moved to bindMainEvents
// document.getElementById('search-inventory')?.addEventListener('input', applyInventoryFilters);

// Filter chips functionality
document.querySelectorAll('.filter-chips .chip').forEach(chip => {
    chip.addEventListener('click', (e) => {
        // Remove active class from all
        document.querySelectorAll('.filter-chips .chip').forEach(c => c.classList.remove('active'));
        // Add to clicked
        e.target.classList.add('active');

        window.currentInventoryFilter = e.target.getAttribute('data-filter');
        applyInventoryFilters();
    });
});

// Manual Sync Button logic moved to bindMainEvents
// document.getElementById('btn-sync-inventory')?.addEventListener('click', () => { ... });

// Eventos and Historial logic
async function loadEvents() {
    try {
        const list = document.getElementById('events-list');
        if (!window.currentEventsData) {
            list.innerHTML = `<li class="skeleton-item animate-pulse h-24 bg-gray-200 rounded-xl mb-3"></li>`;
        }

        window.fetchWithSWR('eventsData',
            () => LocalDriveSync.getFromLocalDB('Events_Items'),
            (response) => {
                if (response && response.success) {
                    window.currentEventsData = response.items || [];
                    renderEvents(window.currentEventsData);
                }
            }
        ).catch(e => console.error("Events SWR error:", e));
    } catch (error) {
        console.error("Events error:", error);
    }
}

function renderEvents(items) {
    const list = document.getElementById('events-list');
    list.innerHTML = '';

    if (items.length === 0) {
        list.innerHTML = '<li class="text-center py-8 text-gray-500 font-medium">No hay eventos registrados.</li>';
        return;
    }

    items.forEach(item => {
        const li = document.createElement('li');
        li.className = "bg-gray-50 rounded-2xl p-4 border border-gray-100";

        li.innerHTML = `
            <div class="flex justify-between items-start mb-2">
                <h3 class="font-bold text-gray-900">${item.Titulo || 'Evento'}</h3>
                <span class="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded-md font-semibold">${new Date(item.Fecha).toLocaleDateString()}</span>
            </div>
            <p class="text-sm text-gray-600 mb-3">${item.Descripcion || ''}</p>
            <p class="text-xs text-gray-400 font-medium">Organizador: ${item.Autor || 'N/A'}</p>
        `;
        list.appendChild(li);
    });
}

async function loadHistory() {
    try {
        const list = document.getElementById('history-list');
        if (!window.currentHistoryData) {
            list.innerHTML = `
                <li class="skeleton-item animate-pulse h-16 bg-gray-200 rounded-lg mb-2"></li>
                <li class="skeleton-item animate-pulse h-16 bg-gray-200 rounded-lg mb-2"></li>
            `;
        }

        window.fetchWithSWR('historyData',
            () => LocalDriveSync.getFromLocalDB('History_Items'),
            (response) => {
                if (response && response.success) {
                    window.currentHistoryData = response.items || [];
                    renderHistory(window.currentHistoryData);
                }
            }
        ).catch(e => console.error("History SWR error:", e));
    } catch (error) {
        console.error("History error:", error);
    }
}

function renderHistory(items) {
    const list = document.getElementById('history-list');
    list.innerHTML = '';

    if (items.length === 0) {
        list.innerHTML = '<li class="text-center py-10 text-gray-500 font-medium">El historial está vacío.</li>';
        return;
    }

    items.forEach(item => {
        const li = document.createElement('li');
        li.className = "p-4 hover:bg-gray-50 transition-colors";

        const icon = item.Accion === 'SALIDA' ? 'logout' : 'login';
        const colorCls = item.Accion === 'SALIDA' ? 'text-amber-500 bg-amber-50' : 'text-green-500 bg-green-50';
        const actionCls = item.Accion === 'SALIDA' ? 'text-amber-600' : 'text-green-600';

        li.innerHTML = `
            <div class="flex items-center gap-4">
                <div class="${colorCls} p-3 rounded-xl shrink-0">
                    <i class="material-icons-round">${icon}</i>
                </div>
                <div class="flex-1 min-w-0">
                    <p class="font-bold text-gray-900 truncate mb-0.5">${item.Equipo || 'Equipo'} 
                        <span class="text-xs font-mono text-gray-400 font-normal">#${item.Codigo}</span>
                    </p>
                    <p class="text-sm text-gray-600 mb-0.5"><strong class="${actionCls} font-bold tracking-wide">${item.Accion}</strong> - Por: ${item.Usuario}</p>
                    <span class="text-xs text-gray-400">${new Date(item.Fecha).toLocaleString()}</span>
                </div>
            </div>
        `;
        list.appendChild(li);
    });
}

// Refresh history button listener
document.getElementById('btn-refresh-history')?.addEventListener('click', loadHistory);
