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
    document.getElementById('search-inventory')?.addEventListener('input', debouncedApplyFilters);
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
        case 'admin':
            if (isAdmin()) await loadAdminPanel();
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

                    if (document.getElementById('stat-total-equipos')) document.getElementById('stat-total-equipos').innerText = (items.length || 0).toLocaleString();
                    if (document.getElementById('stat-prestamo')) document.getElementById('stat-prestamo').innerText = prestados;
                    if (document.getElementById('stat-disponibles')) document.getElementById('stat-disponibles').innerText = items.length - prestados;

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

// Add Debounce Utility
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Envuelto para el uso en el search
const debouncedApplyFilters = debounce(function () {
    applyInventoryFilters();
}, 300);

let currentInventoryRenderLimit = 100;

function applyInventoryFilters() {
    if (!window.currentInventoryData) return;

    // Helper para quitar acentos y hacer case-insensitive
    const normalizeString = (str) => String(str).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();

    const rawSearch = document.getElementById('search-inventory')?.value || '';
    const searchTerm = normalizeString(rawSearch);
    const filterArea = normalizeString(window.currentInventoryFilter || 'all');

    const filtered = window.currentInventoryData.filter(item => {
        // Permitir que si searchTerm está vacío, matchSearch sea automáticamente true
        const matchSearch = searchTerm === '' ? true : (
            (item.ARTICULO && normalizeString(item.ARTICULO).includes(searchTerm)) ||
            (item.ACTIVO && normalizeString(item.ACTIVO).includes(searchTerm))
        );

        // El CSV tiene espacios finales en el Área a veces o nombres exactos como 'AUDIO'
        const matchArea = filterArea === 'ALL' || (item.AREA && normalizeString(item.AREA) === filterArea);

        return matchSearch && matchArea;
    });

    // Reset pagination on new filter
    currentInventoryRenderLimit = 100;
    renderInventory(filtered);
}

function renderInventory(items) {
    const list = document.getElementById('inventory-list');
    list.innerHTML = '';

    if (items.length === 0) {
        list.innerHTML = '<li class="text-center py-10 text-gray-500 font-medium bg-white rounded-3xl border border-dashed border-gray-200">No hay equipos en el inventario que coincidan con la búsqueda.</li>';
        return;
    }

    // Optimization: Render items up to the limit
    const itemsToRender = items.slice(0, currentInventoryRenderLimit);

    itemsToRender.forEach(item => {
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

    // Check if we need to show a "Load More" button
    if (items.length > currentInventoryRenderLimit) {
        const loadMoreLi = document.createElement('li');
        loadMoreLi.className = "text-center py-4 bg-gray-50 rounded-2xl border border-gray-200 cursor-pointer hover:bg-gray-100 transition-colors";
        loadMoreLi.innerHTML = `<span class="text-blue-600 font-bold text-sm">Mostrando ${currentInventoryRenderLimit} de ${items.length}. Cargar más equipos...</span>`;
        loadMoreLi.onclick = () => {
            currentInventoryRenderLimit += 100;
            renderInventory(items); // re-render with new limit
        };
        list.appendChild(loadMoreLi);
    }
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


// ==========================================
// ADMIN PANEL (USER MANAGEMENT)
// ==========================================
async function loadAdminPanel() {
    try {
        const tbody = document.getElementById('users-table-body');
        if (!tbody) return;

        // Mostrar estado de carga (Skeletons minimalistas)
        tbody.innerHTML = `
            <tr><td colspan="3" class="px-4 py-4"><div class="animate-pulse h-4 bg-gray-200 rounded w-full"></div></td></tr>
            <tr><td colspan="3" class="px-4 py-4"><div class="animate-pulse h-4 bg-gray-200 rounded w-full"></div></td></tr>
        `;

        // Llamar al backend
        const response = await DB.query('getUsers');

        if (!response || !response.success) {
            tbody.innerHTML = `<tr><td colspan="3" class="px-4 py-4 text-center text-red-500">Error cargando usuarios: ${response?.error || 'Desconocido'}</td></tr>`;
            return;
        }

        const users = response.items || [];

        if (users.length === 0) {
            tbody.innerHTML = `<tr><td colspan="3" class="px-4 py-4 text-center text-gray-500">No hay usuarios registrados.</td></tr>`;
            return;
        }

        tbody.innerHTML = '';
        users.forEach(user => {
            const role = user.Rol || 'Usuario';
            // Prevenir auto-bloqueo: si es el Admin actual en pantalla, deshabilitar cambio
            const isSelf = user.Username === AuthState.user?.username;

            const tr = document.createElement('tr');
            tr.className = "hover:bg-gray-50 transition-colors";
            tr.innerHTML = `
                <td class="px-4 py-3 whitespace-nowrap">
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-sm">
                            ${(user.Username || '?').charAt(0).toUpperCase()}
                        </div>
                        <span class="font-medium text-gray-900">${user.Username}</span>
                    </div>
                </td>
                <td class="px-4 py-3 whitespace-nowrap">
                    <span class="px-3 py-1 rounded-full text-xs font-semibold ${role === 'Administrador' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}">
                        ${role}
                    </span>
                </td>
                <td class="px-4 py-3 whitespace-nowrap">
                    <select class="role-select bg-white border border-gray-300 text-gray-700 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2 disabled:bg-gray-100 disabled:text-gray-400" 
                            data-username="${user.Username}" ${isSelf ? 'disabled' : ''}>
                        <option value="Usuario" ${role !== 'Administrador' ? 'selected' : ''}>Usuario Regular</option>
                        <option value="Administrador" ${role === 'Administrador' ? 'selected' : ''}>Administrador</option>
                    </select>
                </td>
            `;
            tbody.appendChild(tr);
        });

        // Bind events for role changes
        document.querySelectorAll('.role-select').forEach(select => {
            select.addEventListener('change', async (e) => {
                const username = e.target.getAttribute('data-username');
                const nuevoRol = e.target.value;
                const previousRole = nuevoRol === 'Administrador' ? 'Usuario' : 'Administrador';

                // Optimizar UX: deshabilitar el select mientras carga
                e.target.disabled = true;
                e.target.classList.add('animate-pulse');

                try {
                    const res = await fetch(API_URL.replace('/action', '/users/role'), {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ username, nuevoRol })
                    });

                    const data = await res.json();
                    if (data.success) {
                        UI.showToast(`Rol de ${username} actualizado a ${nuevoRol}`);
                        // Refrescar tabla visualmente
                        await loadAdminPanel();
                    } else {
                        throw new Error(data.error || 'Server error');
                    }
                } catch (error) {
                    UI.showToast(`Error al actualizar rol: ${error.message}`, 'error');
                    e.target.value = previousRole; // Revertir visualmente
                } finally {
                    e.target.disabled = false;
                    e.target.classList.remove('animate-pulse');
                }
            });
        });

    } catch (e) {
        console.error("Error in loadAdminPanel", e);
    }
}

// Bind admin refresh button
document.getElementById('btn-refresh-users')?.addEventListener('click', () => {
    loadAdminPanel();
});


// ==========================================
// NUEVO EVENTO LOGIC (Modulo de Asignación)
// ==========================================
let currentEventSelection = new Set();
let allAvailableEquipment = [];
let currentEquipFilter = 'ALL';

// Abrir Modal de Nuevo Evento
document.querySelector('#view-events header button')?.addEventListener('click', async () => {
    const modal = document.getElementById('modal-evento');
    if (!modal) return;

    // Reset Form & Selections
    document.getElementById('form-nuevo-evento').reset();
    currentEventSelection.clear();
    currentEquipFilter = 'ALL';
    document.getElementById('evento-selected-count').innerText = '0';
    document.getElementById('search-equip-modal').value = '';

    // Load fresh DB inventory
    modal.classList.remove('hidden');
    await loadAvailableEquipmentForModal();
});

let currentModalRenderLimit = 100;

// Helper for filtering tabs
window.setEquipDept = function (deptLabel, btnElement) {
    document.querySelectorAll('.dept-tab').forEach(b => b.classList.remove('active'));
    if (btnElement) btnElement.classList.add('active');

    currentEquipFilter = deptLabel;
    currentModalRenderLimit = 100; // Reset limite
    renderEquipModalList();
};

window.filterEquipModal = debounce(function () {
    currentModalRenderLimit = 100; // Reset limite
    renderEquipModalList();
}, 300);

async function loadAvailableEquipmentForModal() {
    const container = document.getElementById('equip-modal-list');
    container.innerHTML = '<div class="p-8 text-center text-gray-500 text-sm"><div class="animate-pulse">Cargando inventario disponible...</div></div>';

    try {
        const response = await LocalDriveSync.getFromLocalDB('Inventory_Items');
        if (response && response.success) {
            // Guardamos solo los disponibles
            allAvailableEquipment = response.items.filter(item => {
                const estado = String(item.Estado || 'Disponible').trim().toLowerCase();
                return estado === 'disponible' || estado === '';
            });
            updateEquipCounters();
            renderEquipModalList();
        } else {
            container.innerHTML = '<div class="p-8 text-center text-red-500 text-sm">Error al cargar la base de datos local. Sincronice primero.</div>';
        }
    } catch (e) {
        console.error("Load Modal Error:", e);
        container.innerHTML = '<div class="p-8 text-center text-red-500 text-sm">Error interno de BD.</div>';
    }
}

function updateEquipCounters() {
    const normalize = str => String(str).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();

    const count = { ALL: allAvailableEquipment.length, AUDIO: 0, ILUMINACION: 0, VIDEO: 0, RIGGING: 0, BODEGA: 0 };

    allAvailableEquipment.forEach(item => {
        const d = normalize(item.AREA || '');
        if (count[d] !== undefined) count[d]++;
    });

    document.getElementById('count-all').innerText = `(${count.ALL})`;
    document.getElementById('count-audio').innerText = `(${count.AUDIO})`;
    document.getElementById('count-iluminacion').innerText = `(${count.ILUMINACION})`;
    document.getElementById('count-video').innerText = `(${count.VIDEO})`;
    document.getElementById('count-rigging').innerText = `(${count.RIGGING})`;
    document.getElementById('count-bodega').innerText = `(${count.BODEGA})`;
}

function renderEquipModalList() {
    const container = document.getElementById('equip-modal-list');
    const normalize = str => String(str).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();

    const searchTerm = normalize(document.getElementById('search-equip-modal')?.value || '');

    const filtered = allAvailableEquipment.filter(item => {
        const matchDept = currentEquipFilter === 'ALL' || normalize(item.AREA || '') === currentEquipFilter;
        const matchSearch = searchTerm === '' || normalize(item.ARTICULO || '').includes(searchTerm) || normalize(item.ACTIVO || '').includes(searchTerm);
        return matchDept && matchSearch;
    });

    if (filtered.length === 0) {
        container.innerHTML = `<div class="p-8 text-center text-gray-500 text-sm">No se encontraron equipos disponibles en ${currentEquipFilter}</div>`;
        return;
    }

    container.innerHTML = '';

    // Optimization: limit DOM creation
    const itemsToRender = filtered.slice(0, currentModalRenderLimit);

    itemsToRender.forEach(item => {
        const isChecked = currentEventSelection.has(item.ACTIVO);

        const row = document.createElement('label');
        row.className = 'equip-item-row';
        row.innerHTML = `
            <input type="checkbox" class="equip-checkbox" value="${item.ACTIVO}" ${isChecked ? 'checked' : ''}>
            <div class="equip-details">
                <div class="equip-name">${item.ARTICULO || 'Sin Nombre'}</div>
                <div class="equip-meta">#${item.ACTIVO} • ${item.MARCA || ''} ${item.MODELO || ''}</div>
            </div>
        `;

        const cb = row.querySelector('.equip-checkbox');
        cb.addEventListener('change', (e) => {
            if (e.target.checked) {
                currentEventSelection.add(item.ACTIVO);
            } else {
                currentEventSelection.delete(item.ACTIVO);
            }
            document.getElementById('evento-selected-count').innerText = currentEventSelection.size;
        });

        container.appendChild(row);
    });

    // Check if we need to show a "Load More" button in modal
    if (filtered.length > currentModalRenderLimit) {
        const loadMoreRow = document.createElement('div');
        loadMoreRow.className = "p-4 mt-2 text-center text-blue-500 font-bold text-sm cursor-pointer hover:bg-gray-800 rounded-lg transition-colors border border-gray-700";
        loadMoreRow.innerHTML = `Mostrando ${currentModalRenderLimit} de ${filtered.length}. Cargar más...`;
        loadMoreRow.onclick = () => {
            currentModalRenderLimit += 100;
            renderEquipModalList();
        };
        container.appendChild(loadMoreRow);
    }
}

window.guardarEvento = async function () {
    if (currentEventSelection.size === 0) {
        UI.showToast("Debes seleccionar al menos 1 equipo para el evento", "error");
        return;
    }

    const eventData = {
        nombre: document.getElementById('ev-nombre').value.trim(),
        cliente: document.getElementById('ev-cliente').value.trim(),
        fechaInicio: document.getElementById('ev-fecha-inicio').value,
        fechaFin: document.getElementById('ev-fecha-fin').value,
        responsables: {
            audio: document.getElementById('ev-resp-audio').value.trim(),
            iluminacion: document.getElementById('ev-resp-ilum').value.trim(),
            video: document.getElementById('ev-resp-video').value.trim(),
            rigging: document.getElementById('ev-resp-rigging').value.trim(),
            bodega: document.getElementById('ev-resp-bodega').value.trim()
        },
        equiposAsignados: Array.from(currentEventSelection) // Arreglo de Códigos ACTIVOS
    };

    console.log("Saving Event Data:", eventData);

    // TODO: Send to backend /api/action -> processEventCreation
    // For now simulate logic...
    const btnSubmit = document.getElementById('btn-submit-evento');
    const originalText = btnSubmit.innerHTML;
    btnSubmit.innerHTML = `<i class="material-icons-round spin-animation">sync</i> Guardando...`;
    btnSubmit.disabled = true;

    try {
        const username = AuthState?.user?.username || 'UsuarioLocal';
        const payload = { action: 'createEvent', username: username, ...eventData };

        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (data.success) {
            UI.showToast(data.message || "Evento guardado con éxito", "success");
            // Limpiar Modal
            document.getElementById('modal-evento').classList.add('hidden');
            // Cargar nueva lista de eventos si estuviéramos en la vista
            if (typeof loadEvents === 'function') loadEvents();
        } else {
            throw new Error(data.error || 'Server error');
        }

    } catch (e) {
        console.error("Save Event Error:", e);
        UI.showToast(`Error al guardar evento: ${e.message}`, "error");
    } finally {
        btnSubmit.innerHTML = originalText;
        btnSubmit.disabled = false;
    }
};

// ==========================================
// AETHER PRIME DASHBOARD LOGIC
// ==========================================
window.navigateFromHome = function (viewId) {
    if (viewId === 'view-admin' && AuthState.user?.rol !== 'Administrador') {
        UI.showToast("No tienes permisos de Administrador para ver esta sección", "error");
        return;
    }

    document.querySelectorAll('.nav-links a').forEach(el => {
        if (el.getAttribute('data-view') === viewId) el.click();
    });
};

document.getElementById('btn-master-sync')?.addEventListener('click', async () => {
    if (AuthState.user?.rol !== 'Administrador') {
        UI.showToast("Prohibido: Sólo Administradores pueden realizar Master Sync", "warning");
        return;
    }
    await LocalDriveSync.syncAll();
});

document.getElementById('btn-sincronizar-drive-home')?.addEventListener('click', async () => {
    if (AuthState.user?.rol !== 'Administrador') {
        UI.showToast("Prohibido: Sólo Administradores pueden sincronizar el Drive", "warning");
        return;
    }
    await LocalDriveSync.syncAll();
});
