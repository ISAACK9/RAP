console.log("RAP_ENGINE_LOADED_V22_PRODUCTION");
// === DATABASE CONNECTION (IndexedDB & Google Apps Script) ===
const API_URL = "https://script.google.com/macros/s/AKfycbzT7OIAlgLhved2naO9FKz4PiBn_2VSl9CK7epvZc8mr3hWcJpo4i77Kt3Mmr6kJ1V6eQ/exec";
const API_TOKEN = "RAP_SECURE_TOKEN_2026_V1_ISAAC";

// === USER MANAGEMENT SYSTEM (localStorage) ===
const SECTIONS = ['inventario', 'escaneo', 'eventos', 'eventos_edit', 'movimientos', 'estadisticas'];
const SECTION_LABELS = {
  inventario: 'Inventario', escaneo: 'Escaneo', eventos: 'Ver Eventos', eventos_edit: 'Crear/Editar Eventos',
  movimientos: 'Historial', estadisticas: 'Estadísticas'
};

// === GLOBAL STATE VARIABLES ===
let checkData = JSON.parse(localStorage.getItem('rap_events_v1') || '{}');
let archivedEvents = JSON.parse(localStorage.getItem('rap_archived_v1') || '{}');
let equipos = window.equipos || [];
let movimientos = JSON.parse(localStorage.getItem('rap_movimientos_v1') || '[]');

// === DATA FETCH HELPER (CORS Bypass via JSONP) ===
function callApi(params) {
  return new Promise((resolve) => {
    const cb = 'api_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    params.callback = cb;
    params.token = API_TOKEN;

    // Diagnóstico proactivo: Si en 10s no responde, probablemente sea por permisos en Google
    const timeout = setTimeout(() => {
      if (window[cb]) {
        delete window[cb];
        if (sc.parentNode) sc.parentNode.removeChild(sc);
        resolve({
          success: false,
          error: 'Tiempo excedido. Verifica que el script de Google esté desplegado como "Cualquier persona" (Anyone).',
          isDeploymentIssue: true
        });
      }
    }, 10000);

    window[cb] = (res) => {
      clearTimeout(timeout);
      delete window[cb];
      if (sc.parentNode) sc.parentNode.removeChild(sc);
      resolve(res);
    };

    const query = Object.entries(params)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');

    const sc = document.createElement('script');
    sc.src = `${API_URL}?${query}`;
    sc.onerror = () => {
      clearTimeout(timeout);
      if (window[cb]) delete window[cb];
      if (sc.parentNode) sc.parentNode.removeChild(sc);
      resolve({
        success: false,
        error: 'Error de red: El script de Google no pudo cargarse. Revisa la configuración de acceso público.',
        isDeploymentIssue: true
      });
    };
    document.body.appendChild(sc);
  });
}

function saveMovimientos(data) {
  localStorage.setItem('rap_movimientos_v1', JSON.stringify(data));
}

async function pullUsers() {
  try {
    const result = await callApi({ action: 'pullUsers' });
    if (result.success && Array.isArray(result.data)) {
      localStorage.setItem('rap_users_v2', JSON.stringify(result.data));
      return result.data;
    }
  } catch (e) {
    console.error("Error pulling users:", e);
  }
  return getUsers();
}

async function pushUsers(users) {
  const current = getCurrentUser();
  if (!current || current.role !== 'admin') {
    showToast('Solo administradores pueden sincronizar usuarios');
    return;
  }
  try {
    await fetch(API_URL, {
      method: 'POST',
      body: JSON.stringify({
        action: 'pushUsers',
        token: API_TOKEN,
        adminRole: current.role,
        users: users || getUsers()
      })
    });
  } catch (e) {
    console.error("Error pushing users:", e);
  }
}

function initUsers() {
  const raw = localStorage.getItem('rap_users_v2');
  if (!raw || raw === '[]') {
    const adminUser = {
      id: 'admin-001',
      name: 'Isaac Contreras',
      username: 'ISAAC',
      email: 'isaac@rap.mx',
      phone: '',
      cargo: 'Administrador',
      password: 'CONTRERAS9',
      role: 'admin',
      status: 'active',
      permissions: SECTIONS.slice(),
      createdAt: new Date().toISOString()
    };
    localStorage.setItem('rap_users_v2', JSON.stringify([adminUser]));
    // Tentatively push this first admin if possible (handled in DOMContentLoaded)
  }
}
initUsers();

// ONE-TIME CLEANUP (User Request: Remove all except ISAAC)
(function () {
  if (localStorage.getItem('rap_users_cleanup_v1')) return;
  const allUsers = getUsers();
  const filtered = allUsers.filter(u => u.username.toUpperCase() === 'ISAAC');
  if (allUsers.length !== filtered.length) {
    console.warn("Cleanup: Removing", allUsers.length - filtered.length, "users.");
    saveUsers(filtered);
  }
  localStorage.setItem('rap_users_cleanup_v1', 'done');
})();

// PRODUCTION: CHECK SESSION ON LOAD
document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  initNavigation();

  const currentUser = getCurrentUser();
  const authScreen = document.getElementById('authScreen');

  if (currentUser) {
    // Session exists, proceed normally
    if (authScreen) authScreen.style.display = 'none';
    applyUserSession(currentUser);

    // AUTOMATIC SYNC ON ENTRY
    try {
      await pullUsers(); // Get global users first
      await pullSharedData(); // Get global events and movements
      await syncInventoryToIndexedDB();
    } catch (e) {
      console.error("Auto-sync failed on entry:", e);
    }

    renderDashboardCharts();
    renderScanEventOptions();
  } else {
    // No session, ensure auth screen is visible
    if (authScreen) authScreen.style.display = 'flex';
    // Still try to pull users to have the latest list for login
    await pullUsers();
  }
});

function getUsers() {
  try {
    const data = JSON.parse(localStorage.getItem('rap_users_v2') || '[]');
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.error("Error parsing users:", e);
    return [];
  }
}
function saveUsers(users) { localStorage.setItem('rap_users_v2', JSON.stringify(users)); }
function getCurrentUser() {
  let sid = sessionStorage.getItem('rap_current_user');
  if (!sid) {
    sid = localStorage.getItem('rap_persistent_user');
  }
  if (!sid) return null;
  return getUsers().find(u => u.id === sid) || null;
}

// === THEME SYSTEM ===
function toggleTheme() {
  const isLight = document.body.classList.toggle('light-mode');
  localStorage.setItem('rap_theme', isLight ? 'light' : 'dark');
  updateThemeUI(isLight);
}

function initTheme() {
  const saved = localStorage.getItem('rap_theme') || 'dark';
  if (saved === 'light') {
    document.body.classList.add('light-mode');
    updateThemeUI(true);
  } else {
    document.body.classList.remove('light-mode');
    updateThemeUI(false);
  }
}

function updateThemeUI(isLight) {
  const moon = document.querySelector('.moon-icon');
  const sun = document.querySelector('.sun-icon');
  if (moon && sun) {
    moon.style.display = isLight ? 'none' : 'block';
    sun.style.display = isLight ? 'block' : 'none';
  }
  // Re-render charts to match new theme if needed
  if (window._donutChart) renderDashboardCharts();
}

// Auth Screen
function toggleAuth(mode) {
  document.getElementById('loginForm').style.display = mode === 'login' ? 'block' : 'none';
  document.getElementById('signupForm').style.display = mode === 'signup' ? 'block' : 'none';
  document.getElementById('signupSuccess').style.display = mode === 'success' ? 'block' : 'none';
  if (document.getElementById('signupError')) document.getElementById('signupError').textContent = '';
  if (document.getElementById('loginError')) document.getElementById('loginError').textContent = '';
}

async function doLogin() {
  const username = (document.getElementById('loginUser').value || '').trim();
  const password = (document.getElementById('loginPass').value || '').trim();
  if (!username || !password) { showToast('Ingresa usuario y contraseña'); return; }

  const btn = (typeof event !== 'undefined' && event) ? event.target : { textContent: '', style: {} };
  const oldText = btn.textContent;
  btn.textContent = 'Verificando...';
  btn.disabled = true;

  try {
    let result = await callApi({ action: 'login', username, password });

    // --- FALLBACK LOGIC: Check local cache if API fails ---
    if (!result.success || result.isDeploymentIssue) {
      console.warn("API Login failed, checking local fallback...", result.error);
      const localUsers = getUsers();
      const localUser = localUsers.find(u =>
        u.username.toLowerCase() === username.toLowerCase() &&
        u.password === password
      );

      if (localUser) {
        console.log("Local fallback success for:", username);
        result = { success: true, data: localUser, isFallback: true };
      } else if (result.isDeploymentIssue) {
        // Still show the deployment error if no local fallback was possible
        let finalError = '⚠️ CONFIGURACIÓN REQUERIDA: ' + result.error;
        showToast(finalError);
        btn.textContent = oldText;
        btn.disabled = false;
        return;
      }
    }

    if (!result.success) {
      let finalError = result.error || 'Credenciales inválidas';
      showToast(finalError);
      btn.textContent = oldText;
      btn.disabled = false;
      return;
    }

    const user = result.data;
    if (user.status === 'pending') {
      showToast('Tu cuenta está pendiente de aprobación');
      btn.textContent = oldText;
      btn.disabled = false;
      return;
    }

    // Login success
    sessionStorage.setItem('rap_current_user', user.id);
    applyUserSession(user); // Force UI update immediately

    if (result.isFallback) {
      showToast('Entrando en modo recuperación (Local)');
    }

    // Remember User
    const rememberObj = document.getElementById('loginRemember');
    if (rememberObj && rememberObj.checked) {
      localStorage.setItem('rap_saved_user', username);
      localStorage.setItem('rap_persistent_user', user.id);
    } else {
      localStorage.removeItem('rap_saved_user');
      localStorage.removeItem('rap_persistent_user');
    }

    // Registrar login en movimientos globales si lo requiere
    const timeStr = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    movimientos.unshift({
      equip: 'Sistema', id: 'N/A', evento: 'Inicio de Sesión',
      tipo: 'Auditoría', time: 'Hoy ' + timeStr, resp: user.username
    });
    saveMovimientos(movimientos);

    // Actualizar botón a estado de carga final
    if (typeof btn !== 'undefined' && btn.textContent !== undefined) {
      btn.textContent = 'Cargando...';
      btn.style.opacity = '.7';
    }

    // Apply session UI first
    applyUserSession(user);

    // Check if we need to sync DB or just show dashboard
    setTimeout(async () => {
      document.getElementById('authScreen').classList.add('hidden');

      // FULL SYNC ON LOGIN
      try {
        await pullUsers();
        await pullSharedData();
        await syncInventoryToIndexedDB();
      } catch (e) {
        console.warn("Initial sync failed:", e);
      }

      setTimeout(() => {
        document.getElementById('authScreen').style.display = 'none';
        renderDashboardCharts();
        renderScanEventOptions();
      }, 500);
    }, 600);
  } catch (e) {
    showToast('Error de conexión con el servidor: ' + e.message);
    console.error("Login Error:", e);

    // Recovery: ensure button is restored
    if (typeof btn !== 'undefined' && btn.style) {
      btn.textContent = (typeof oldText !== 'undefined') ? oldText : 'ENTRAR';
      btn.disabled = false;
    }
  }
}

// Simple XSS Protection Helper
function sanitize(str) {
  if (typeof str !== 'string') return str;
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
const STORE_NAME = 'equipos';
const DB_VERSION = 1;

// Tiempo máximo de espera para el fetch (30 segundos)
const FETCH_TIMEOUT_MS = 30000;

// Función helper para fetch con timeout
async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

// Función para sincronizar manualmente (botón en la UI)
function manualSync() {
  syncInventoryToIndexedDB().then(() => {
    renderInventory && renderInventory();
    renderDashboardCharts && renderDashboardCharts();
  });
}

// Vanilla JS IndexedDB Promisification wrapper
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = (e) => reject('IndexedDB error: ' + e.target.error);
    request.onsuccess = (e) => resolve(e.target.result);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        // Create store with 'id' as the primary key
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
}

// Helper to save array of items into IndexedDB
async function saveItemsToDB(items) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    // Clear existing cache first to avoid ghost items if deleted from Drive
    store.clear();

    let processed = 0;
    items.forEach(item => {
      store.put(item);
      processed++;
    });

    tx.oncomplete = () => resolve(processed);
    tx.onerror = (e) => reject(e.target.error);
  });
}

// Helper to get all items from IndexedDB
async function getAllItemsFromDB() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

// Función GVIZ Fetcher (Soporta JSONP real invulnerable al CORS de Drive Workspace)
function fetchGvizJSONP(url) {
  return new Promise((resolve, reject) => {
    const cbId = 'gviz_' + Math.round(Math.random() * 10000000);

    // Interceptor global de Google Visualization (si responseHandler falla o es ignorado)
    if (!window.google) window.google = {};
    if (!window.google.visualization) window.google.visualization = {};
    if (!window.google.visualization.Query) window.google.visualization.Query = {};

    // Guardamos el handler anterior por si acaso
    const oldHandler = window.google.visualization.Query.setResponse;

    window.google.visualization.Query.setResponse = function (data) {
      // Restauramos el handler original
      window.google.visualization.Query.setResponse = oldHandler;

      // Limpiamos el script
      const el = document.getElementById(cbId);
      if (el) el.remove();

      resolve(data);
    };

    // También definimos el callback específico por si Google sí hace caso a responseHandler
    window[cbId] = function (data) {
      delete window[cbId];
      const el = document.getElementById(cbId);
      if (el) el.remove();
      resolve(data);
    };

    const script = document.createElement('script');
    script.id = cbId;
    // Intentamos forzar el handler pero el interceptor nos protege si falla
    script.src = url + '&tqx=responseHandler:' + cbId;

    const timer = setTimeout(() => {
      if (window[cbId]) delete window[cbId];
      if (script) script.remove();
      reject(new Error('timeout'));
    }, 20000);

    script.onerror = () => {
      clearTimeout(timer);
      if (window[cbId]) delete window[cbId];
      if (script) script.remove();
      reject(new Error('network_error'));
    };
    script.onload = () => clearTimeout(timer);
    document.body.appendChild(script);
  });
}

// Mapeo seguro de iconografía por categoría
function getIconCls(cat) {
  const norm = String(cat).trim().toLowerCase();
  if (norm.includes('audio')) return 'audio';
  if (norm.includes('ilu')) return 'ilu';
  if (norm.includes('video')) return 'video';
  if (norm.includes('est')) return 'est';
  if (norm.includes('rig')) return 'rig';
  if (norm.includes('bod')) return 'bod';
  return 'audio'; // Default
}

async function syncInventoryToIndexedDB() {
  const overlay = document.getElementById('syncOverlay');
  const bar = document.getElementById('syncProgressBar');
  const txtStat = document.getElementById('syncStatusText');
  const txtPct = document.getElementById('syncPercentageText');

  if (overlay) overlay.style.display = 'flex';

  try {
    // --- PASO 1: Verificar si el API_URL ya fue configurado ---
    const isPlaceholder = API_URL.includes('TU_URL_REAL_AQUI') || API_URL.includes('XXXXXXXXXXXX');

    if (isPlaceholder) {
      // Sin URL real configurada ? usar caché local o datos en memoria
      console.warn('?? API_URL no configurado. Usando datos en memoria.');
      if (txtStat) txtStat.textContent = 'Modo local (sin Drive configurado)';
      if (bar) bar.style.width = '100%';
      if (txtPct) txtPct.textContent = '100%';

      // Intentar cargar desde IndexedDB primero
      const cached = await getAllItemsFromDB();
      if (cached && cached.length > 0) {
        equipos = cached;
        window.equipos = equipos;
      }
      // Si no hay caché, los datos en memoria (window.equipos) ya están cargados

      setTimeout(() => {
        if (overlay) overlay.style.display = 'none';
        showToast('Modo local — configura Google Drive para sincronización');
      }, 800);
      return;
    }

    // --- PASO 2: Leer los archivos Excel (CSV) directamente desde Google Docs públicos ---
    if (bar) bar.style.width = '15%';
    if (txtPct) txtPct.textContent = '15%';
    if (txtStat) txtStat.textContent = 'Conectando con Google Drive...';

    // Lista de URLs GVIZ a descargar (Inmune a CORS sin autenticación)
    const gvizUrls = [
      "https://docs.google.com/spreadsheets/d/12RufVKNKNtGH7dEhDvYbc0fmFX6EyVyh/gviz/tq?gid=1216759170",
      "https://docs.google.com/spreadsheets/d/1WnwXnaTyn7ZLro9TAwEjEvw21ZqrlNU0/gviz/tq?gid=1103092065",
      "https://docs.google.com/spreadsheets/d/1rH6Ama5o--rRxvtcRonsAFIfjdYWo-og/gviz/tq?gid=1722271535",
      "https://docs.google.com/spreadsheets/d/15th4w8laxjLniH-qE0tXrHk9avvE7-Dp/gviz/tq?gid=207960625",
      "https://docs.google.com/spreadsheets/d/1i_5-NkV0oWA7incDhTx8wHb9t9oEYROe/gviz/tq?gid=431028817"
    ];

    let allDriveData = [];
    let erroresArchivos = 0;

    // Lista de categorías correspondientes a cada URL
    const categoriesMap = ['Audio', 'Bodega', 'Iluminación', 'Rigging', 'Video'];

    for (let i = 0; i < gvizUrls.length; i++) {
      const url = gvizUrls[i];
      const currentCat = categoriesMap[i] || 'Audio'; // Asignar categoría fija por archivo

      try {
        const data = await fetchGvizJSONP(url);
        if (!data || !data.table || !data.table.rows) continue;

        const rows = data.table.rows;
        for (let r = 0; r < rows.length; r++) {
          const rowInfo = rows[r].c;
          if (!rowInfo || !rowInfo[0] || !rowInfo[0].v) continue;

          const colStr = (idx) => {
            return rowInfo[idx] && rowInfo[idx].v ? String(rowInfo[idx].v).trim() : '';
          };

          const idStr = colStr(0);
          if (idStr.toLowerCase() === 'id' || idStr.toLowerCase().includes('código')) continue;

          let estadoBruto = colStr(4).toLowerCase();
          let st = 'Disponible';
          if (estadoBruto.includes('evento') || estadoBruto.includes('renta')) st = 'En Evento';
          if (estadoBruto.includes('mant') || estadoBruto.includes('taller')) st = 'Mantenimiento';

          allDriveData.push({
            id: idStr,
            nombre: colStr(2), // Ajustado: la columna 2 es el Nombre según el curl
            cat: currentCat, // Usar la categoría fija del archivo
            marca: colStr(3),
            estado: st,
            serie: colStr(5),
            descripcion: colStr(4), // Ajustado: el modelo está en col 4
            iconCls: getIconCls(currentCat)
          });
        }
      } catch (e) {
        console.error(`Error leyendo hoja ${currentCat} (${i + 1}):`, e);
        erroresArchivos++;
      }
    }

    if (allDriveData.length === 0) {
      throw new Error(`Los archivos de Drive están vacíos o protejidos. (Fallaron ${erroresArchivos})`);
    }

    if (bar) bar.style.width = '60%';
    if (txtPct) txtPct.textContent = '60%';
    if (txtStat) txtStat.textContent = `${allDriveData.length} equipos recibidos — guardando caché...`;

    // --- PASO 3: Guardar en IndexedDB local ---
    await saveItemsToDB(allDriveData);

    if (bar) bar.style.width = '100%';
    if (txtPct) txtPct.textContent = '100%';
    if (txtStat) txtStat.textContent = `? ${allDriveData.length} equipos sincronizados desde Drive`;

    // Actualizar la variable global en memoria
    equipos = allDriveData;
    window.equipos = equipos;

    // Guardar timestamp de última sincronización
    localStorage.setItem('rap_last_sync', new Date().toISOString());

    setTimeout(() => {
      if (overlay) overlay.style.display = 'none';
      const lastSync = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
      let msgAdicional = erroresArchivos > 0 ? ` (?? ${erroresArchivos} archivo no cargó)` : '';
      showToast(`? Drive sincronizado — ${allDriveData.length} equipos (${lastSync})${msgAdicional}`);
      // Refrescar vistas
      if (typeof currentFilteredEquipos !== 'undefined') {
        // Forzar refresco a la categoría actual o 'Todos'
        const currentTab = document.querySelector('.chip.active');
        const catToShow = currentTab ? currentTab.dataset.cat : 'Todos';
        renderEquipos(catToShow);
      }
    }, 600);

  } catch (error) {
    console.error('Sync fallido:', error);

    const isNetwork = error.message && error.message.toLowerCase().includes('fetch');
    let errMsg = 'Falló la sincronización con Drive.';
    if (isNetwork) errMsg = 'Sin conexión a internet (CORS/Network Error).';

    showToast(errMsg + ' Usando versión local (Caché).');
    if (bar) bar.style.width = '100%';
    if (overlay) overlay.style.display = 'none';

    // --- FALLBACK: Intentar cargar desde IndexedDB local ---
    try {
      const cached = await getAllItemsFromDB();
      if (cached && cached.length > 0) {
        equipos = cached;
        window.equipos = equipos;
        const lastSync = localStorage.getItem('rap_last_sync');
        const syncStr = lastSync ? ' (últ. sync: ' + new Date(lastSync).toLocaleDateString('es-MX') + ')' : '';
        showToast('🕒 Usando datos en caché' + syncStr);
        if (typeof renderEquipPicker === 'function') renderEquipPicker();
      }
    } catch (e) {
      console.error('Error cargando caché:', e);
    }
  }
}

async function doSignup() {
  const name = (document.getElementById('signupName').value || '').trim();
  const username = (document.getElementById('signupUser').value || '').trim();
  const email = (document.getElementById('signupEmail').value || '').trim();
  const phone = (document.getElementById('signupPhone').value || '').trim();
  const cargo = (document.getElementById('signupCargo').value || '').trim();
  const password = (document.getElementById('signupPass').value || '').trim();
  const errEl = document.getElementById('signupError');

  if (!name || !username || !password || !cargo) {
    errEl.textContent = 'Nombre, usuario, cargo y contraseña son obligatorios';
    return;
  }

  // Pull latest users to check if username exists
  const users = await pullUsers();
  if (users.find(u => u.username.toLowerCase() === username.toLowerCase())) {
    errEl.textContent = 'Ese nombre de usuario ya existe';
    return;
  }

  const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  const newUser = {
    id: 'user-' + Date.now(),
    name, username, email, phone, cargo, password,
    role: 'staff',
    status: 'active', // Fast Access Enabled
    permissions: ['inventario', 'eventos', 'movimientos'], // Restricted view access
    createdAt: new Date().toISOString()
  };

  // Push to cloud instantly
  try {
    const result = await callApi({ action: 'signup', user: JSON.stringify(newUser) });

    if (!result.success) {
      // In signup, any backend failure (isDeploymentIssue or specific error) 
      // is a reason to use Local Fallback to let the user in immediately.
      console.warn("Cloud signup failed, falling back to local save...", result.error);
      const localUsers = getUsers();
      localUsers.push(newUser);
      saveUsers(localUsers);
      showToast('⚠️ REGISTRADO EN MODO LOCAL (Servidor no disponible)', 5000);
    } else {
      // After success, we should probably pull users again to update local cache
      try {
        await pullUsers();
      } catch (e) {
        console.warn("Post-signup pullUsers failed (safe to ignore):", e);
      }
    }

    // Added notification for admin locally (will be synced if admin refreshes)
    addNotif(`Nuevo usuario registrado: ${name} (${cargo})`);

    // Clear form
    ['signupName', 'signupUser', 'signupEmail', 'signupPhone', 'signupCargo', 'signupPass'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    if (errEl) errEl.textContent = '';

    toggleAuth('success');
  } catch (e) {
    console.error("Signup exception (Failed to fetch or similar):", e);
    // Even on serious catch error, try local fallback as last resort
    const localUsers = getUsers();
    localUsers.push(newUser);
    saveUsers(localUsers);
    showToast('Registrado localmente (Error de conexión)');
    toggleAuth('success');
  }
}

// === TOGGLE PASSWORD VISIBILITY ===
function togglePassword(inputId, btnEl) {
  const input = document.getElementById(inputId);
  const showIcon = btnEl.querySelector('.pwd-eye-show');
  const hideIcon = btnEl.querySelector('.pwd-eye-hide');

  if (input.type === 'password') {
    input.type = 'text';
    showIcon.style.display = 'none';
    hideIcon.style.display = 'block';
  } else {
    input.type = 'password';
    showIcon.style.display = 'block';
    hideIcon.style.display = 'none';
  }
}

function applyUserSession(user) {
  const initials = user.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  document.getElementById('avatarEl').textContent = initials;
  document.getElementById('profileName').textContent = user.name;
  document.getElementById('profileEmail').textContent = user.email || 'Sin correo';
  const badge = document.getElementById('roleBadge');
  badge.textContent = user.role === 'admin' ? 'Admin' : user.cargo || 'Staff';
  badge.className = 'role-badge' + (user.role === 'admin' ? '' : ' staff-role');

  // Sidebar user
  const sidebarUser = document.querySelector('.sidebar-user span');
  if (sidebarUser) sidebarUser.textContent = user.name.split(' ')[0] + ' ' + (user.name.split(' ')[1] || '')[0] + '.';
  const sidebarAvatar = document.querySelector('.sidebar-avatar');
  if (sidebarAvatar) sidebarAvatar.textContent = initials;

  // Bottom nav user  
  const profileShort = document.getElementById('profileNameShort');
  if (profileShort) profileShort.textContent = `${user.name} • ${user.role === 'admin' ? 'Admin' : user.cargo || 'Staff'}`;

  // Show/hide admin features
  const bellEl = document.getElementById('notifBell');
  const premiumBadge = document.getElementById('premiumHealthBadge');
  if (user.role === 'admin') {
    if (bellEl) bellEl.style.display = 'flex';
    if (premiumBadge) premiumBadge.style.display = 'flex';
    updateNotifBadge();
  } else {
    if (bellEl) bellEl.style.display = 'none';
    if (premiumBadge) premiumBadge.style.display = 'none';
  }

  // Enforce permissions — hide/show sidebar & nav buttons
  enforceSectionPermissions(user);

  // Show permissions in profile modal
  renderProfilePerms(user);
}

function enforceSectionPermissions(user) {
  const pageMap = {
    'inventario': 'pg-inventario',
    'escaneo': 'pg-scan',
    'eventos': 'pg-eventos',
    'movimientos': 'pg-movimientos',
    'estadisticas': 'pg-stats'
  };

  SECTIONS.forEach(sec => {
    if (sec === 'eventos_edit') return; // Not a page
    const pageId = pageMap[sec];
    const hasAccess = user.role === 'admin' || user.permissions.includes(sec);

    // Sidebar buttons
    const sideBtn = document.querySelector(`.sidebar-btn[data-page="${pageId}"]`);
    if (sideBtn) sideBtn.style.display = hasAccess ? 'flex' : 'none';

    // Bottom nav buttons
    const navBtn = document.querySelector(`.nav-btn[data-page="${pageId}"]`);
    if (navBtn) navBtn.style.display = hasAccess ? 'flex' : 'none';
  });

  // Action Buttons Overrides
  const addBtn = document.getElementById('addEventBtn');
  if (addBtn) {
    const canEdit = user.role === 'admin' || user.permissions.includes('eventos_edit');
    addBtn.style.display = canEdit ? 'block' : 'none';
  }
}

function renderProfilePerms(user) {
  const grid = document.getElementById('permsGrid');
  if (!grid) return;
  const svgChk = '<svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg>';
  const svgBlk = '<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8 0-1.85.63-3.55 1.69-4.9L16.9 18.31A7.9 7.9 0 0112 20zm6.31-3.1L7.1 5.69A7.9 7.9 0 0112 4c4.42 0 8 3.58 8 8 0 1.85-.63 3.55-1.69 4.9z"/></svg>';

  if (user.role === 'admin') {
    grid.innerHTML = SECTIONS.map(sec =>
      `<div class="perm-tag allowed">${svgChk} ${SECTION_LABELS[sec]}</div>`
    ).join('') + `<div class="perm-tag allowed">${svgChk} Gestionar Usuarios</div>`;
  } else {
    grid.innerHTML = SECTIONS.map(sec => {
      const has = user.permissions.includes(sec);
      return `<div class="perm-tag ${has ? 'allowed' : 'denied'}">${has ? svgChk : svgBlk} ${SECTION_LABELS[sec]}</div>`;
    }).join('');
  }
}

function updateNotifBadge() {
  const pending = getUsers().filter(u => u.status === 'pending').length;
  const unreadNotifs = getNotifs().filter(n => !n.read).length;
  const totalNotifs = pending + unreadNotifs;

  const badge = document.getElementById('notifBadge');
  if (badge) {
    badge.textContent = totalNotifs;
    badge.style.display = totalNotifs > 0 ? 'flex' : 'none';
  }
}

// === NOTIFICATIONS LOGIC ===
function getNotifs() {
  return JSON.parse(localStorage.getItem('rap_notifs') || '[]');
}

function saveNotifs(notifs) {
  localStorage.setItem('rap_notifs', JSON.stringify(notifs));
  updateNotifBadge();
}

function addNotif(msg) {
  const notifs = getNotifs();
  notifs.unshift({ id: Date.now(), msg, date: new Date().toISOString(), read: false });
  // Keep only last 50
  if (notifs.length > 50) notifs.length = 50;
  saveNotifs(notifs);
  pushSharedData(); // Sync instantly
}

function clearNotifs() {
  saveNotifs([]);
  pushSharedData(); // Sync instantly
  renderAdminPanel();
}

// === ADMIN PANEL ===
function renderAdminPanel() {
  const users = getUsers();
  const currentUser = getCurrentUser();
  if (!currentUser || currentUser.role !== 'admin') return;

  // Render Notifications
  const notifsList = document.getElementById('adminNotifsList');
  if (notifsList) {
    const notifs = getNotifs();
    if (notifs.length === 0) {
      notifsList.innerHTML = '<p style="color:var(--text2); font-size:13px; font-style:italic;">No hay notificaciones recientes.</p>';
    } else {
      notifsList.innerHTML = notifs.map(n => `
        <div style="background:var(--card); padding:12px; border-radius:8px; margin-bottom:8px; display:flex; gap:12px; align-items:flex-start; border-left: 3px solid ${n.read ? 'transparent' : 'var(--blue)'}">
          <svg style="min-width:20px; width:20px; height:20px; color:var(--blue);" viewBox="0 0 24 24" fill="currentColor"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/></svg>
          <div>
            <p style="font-size:14px; margin:0 0 4px 0;">${n.msg}</p>
            <p style="font-size:11px; color:var(--text2); margin:0;">${new Date(n.date).toLocaleString('es-MX')}</p>
          </div>
        </div>
      `).join('');
      // Mark all as read when viewed
      const unread = notifs.filter(n => !n.read);
      if (unread.length > 0) {
        notifs.forEach(n => n.read = true);
        saveNotifs(notifs);
      }
    }
  }

  // Pending users
  const pending = users.filter(u => u.status === 'pending');
  const pendingSection = document.getElementById('pendingUsersSection');

  if (pending.length > 0) {
    let html = `
      <div class="pending-alert">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
        <span><strong>${pending.length}</strong> solicitud${pending.length > 1 ? 'es' : ''} de registro pendiente${pending.length > 1 ? 's' : ''}</span>
      </div>
      <h2 class="section-title">Solicitudes Pendientes</h2>
    `;
    pending.forEach(u => {
      const initials = u.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
      const date = new Date(u.createdAt).toLocaleDateString('es-MX');
      html += `
        <div class="user-card">
          <div class="user-card-header">
            <div class="user-card-avatar pending-av">${initials}</div>
            <div class="user-card-info">
              <div class="user-card-name">${u.name}</div>
              <div class="user-card-detail">Cargo reportado: ${u.cargo || 'N/A'} • Solicitó: ${date}</div>
            </div>
          </div>
          <p style="font-size:12px;color:var(--text2);margin-bottom:8px">Asignar Perfil Oficial:</p>
          <select class="input-field" id="roleSelect-${u.id}" style="margin-bottom: 12px; width: 100%;">
            <option value="" disabled selected>Seleccionar Perfil</option>
            <option value="Jefe de Almacén">Jefe de Almacén (Operativo Total)</option>
            <option value="Encargado de Áreas">Encargado de Áreas (Eventos y Escaneo)</option>
            <option value="Inventarios">Inventarios (Inventario y Movimientos)</option>
            <option value="Admin">Administrador (Control Total)</option>
          </select>
          <div class="user-card-actions">
            <button class="user-btn approve" onclick="approveUserRole('${u.id}')">? Aprobar</button>
            <button class="user-btn deny" onclick="denyUser('${u.id}')">? Rechazar</button>
          </div>
        </div>
      `;
    });
    pendingSection.innerHTML = html;
  } else {
    pendingSection.innerHTML = '<p style="text-align:center;color:var(--text2);padding:24px;background:var(--card);border-radius:16px;margin-bottom:24px">No hay solicitudes pendientes</p>';
  }

  // Active users
  const active = users.filter(u => u.status === 'active' && u.id !== currentUser.id);
  const activeList = document.getElementById('activeUsersList');
  let ahtml = '';
  active.forEach(u => {
    const initials = u.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    const isAdmin = u.role === 'admin';
    ahtml += `
      <div class="user-card">
        <div class="user-card-header">
          <div class="user-card-avatar active-av">${initials}</div>
          <div class="user-card-info">
            <div class="user-card-name">${u.name} ${isAdmin ? '<span class="role-badge" style="font-size:9px;padding:2px 6px;margin-left:4px">Admin</span>' : ''}</div>
            <div class="user-card-detail">${u.cargo || u.role} • ${u.email || 'Sin correo'} • @${u.username}</div>
          </div>
          <div class="user-card-status">
            <span class="status-dot active"></span>
          </div>
        </div>
        ${!isAdmin ? `
          <div class="perm-toggles">
            ${SECTIONS.map(sec => {
      const has = u.permissions.includes(sec);
      return `<button class="perm-toggle ${has ? 'on' : 'off'}" data-sec="${sec}" data-uid="${u.id}" onclick="toggleUserPerm(this)">${SECTION_LABELS[sec]}</button>`;
    }).join('')}
          </div>
        ` : '<div style="font-size:11px;color:var(--text2);margin-top:4px">Acceso completo a todas las secciones</div>'}
      </div>
    `;
  });
  activeList.innerHTML = ahtml || '<p style="color:var(--text2); font-size:13px">No hay usuarios activos.</p>';
}

function togglePendingPerm(btn) {
  btn.classList.toggle('on');
  btn.classList.toggle('off');
}

function approveUserRole(id) {
  const users = getUsers();
  const user = users.find(u => u.id === id);
  if (!user) return;

  const roleSelect = document.getElementById(`roleSelect-${id}`);
  if (!roleSelect || !roleSelect.value) {
    showToast('Selecciona un perfil para aprobar al usuario');
    return;
  }

  const cargo = roleSelect.value;
  user.cargo = cargo;
  user.status = 'active';

  // Apply RBAC permissions based on selection
  if (cargo === 'Admin') {
    user.role = 'admin';
    user.permissions = SECTIONS.slice();
  } else {
    user.role = 'staff';
    if (cargo === 'Jefe de Almacén') {
      user.permissions = ['inventario', 'escaneo', 'eventos', 'eventos_edit', 'movimientos', 'estadisticas'];
    } else if (cargo === 'Encargado de Áreas') {
      user.permissions = ['escaneo', 'eventos', 'eventos_edit'];
    } else if (cargo === 'Inventarios') {
      user.permissions = ['inventario', 'movimientos'];
    }
  }

  saveUsers(users);
  pushUsers(users); // Sync to cloud
  updateNotifBadge();
  renderAdminPanel();
  showToast(`? ${user.name} aprobado como ${cargo}`);
}

function denyUser(userId) {
  const users = getUsers();
  const idx = users.findIndex(u => u.id === userId);
  if (idx === -1) return;
  const name = users[idx].name;
  users.splice(idx, 1);
  saveUsers(users);
  pushUsers(users); // Sync to cloud
  updateNotifBadge();
  renderAdminPanel();
  showToast(`? Solicitud de ${name} rechazada`);
}

function toggleUserPerm(btn) {
  const userId = btn.dataset.uid;
  const sec = btn.dataset.sec;
  const users = getUsers();
  const user = users.find(u => u.id === userId);
  if (!user) return;

  const idx = user.permissions.indexOf(sec);
  if (idx >= 0) {
    user.permissions.splice(idx, 1);
    btn.classList.remove('on');
    btn.classList.add('off');
  } else {
    user.permissions.push(sec);
    btn.classList.remove('off');
    btn.classList.add('on');
  }
  saveUsers(users);

  // If editing the currently logged in user, re-enforce
  const current = getCurrentUser();
  if (current && current.id === userId) {
    enforceSectionPermissions(user);
  }
}

// === ADD EVENT ===
function openAddEvent() {
  const user = getCurrentUser();
  if (!user) { showToast('Debes iniciar sesión'); return; }

  const allowed = user.role === 'admin' || user.permissions.includes('eventos_edit');
  if (!allowed) {
    showToast('No tienes permiso para crear ni editar eventos');
    return;
  }

  // Reset form and state
  document.getElementById('newEvName').value = '';
  document.getElementById('newEvClient').value = '';
  document.getElementById('newEvStart').value = '';
  document.getElementById('newEvEnd').value = '';
  document.getElementById('equipSearch').value = '';
  document.getElementById('equipSelectedSummary').innerHTML = '';
  window._equipQty = {};
  window._editingEventKey = null;

  // Reset button to Create mode
  const btn = document.querySelector('#addEventModal .submit-btn');
  btn.textContent = 'CREAR EVENTO';
  btn.onclick = createEvent;

  renderEquipPicker();
  document.getElementById('addEventModal').classList.add('show');
}

function closeAddEventModal() {
  document.getElementById('addEventModal').classList.remove('show');
}

// Picker virtual scrolling state
const PICKER_ROW_HEIGHT = 80;
let pvViewport, pvInner;
let currentFilteredPickerGroups = [];
window._pickerGroups = []; // All selectable groups

function renderEquipPicker() {
  const currentSelections = window._equipQty || {}; // { groupIdx: qty }
  const groupsTemp = {};

  // 1. Create Groups from the global equipos array
  const sourceArray = (window.equipos && window.equipos.length > 0) ? window.equipos : (equipos || []);

  sourceArray.forEach((eq, idx) => {
    const groupKey = `${eq.cat}|${eq.nombre}|${eq.descripcion}|${eq.marca}`;
    if (!groupsTemp[groupKey]) {
      groupsTemp[groupKey] = {
        cat: eq.cat || 'Otros',
        nombre: eq.nombre || 'Sin nombre',
        descripcion: eq.descripcion || '',
        marca: eq.marca || '',
        availableIndices: [],
        totalAvailable: 0
      };
    }
    const normalizedStatus = (eq.estado || '').trim().toLowerCase();
    if (normalizedStatus === 'disponible' || normalizedStatus === 'available') {
      groupsTemp[groupKey].availableIndices.push(idx);
      groupsTemp[groupKey].totalAvailable++;
    }
  });

  window._pickerGroups = Object.values(groupsTemp).sort((a, b) => a.nombre.localeCompare(b.nombre));
  window._equipQty = currentSelections; // Persist across renders if possible

  // 2. Build Category Tabs (Departments)
  const deptTabs = document.getElementById('deptTabs');
  const depts = [...new Set(window._pickerGroups.map(g => g.cat))].sort();

  if (deptTabs) {
    deptTabs.innerHTML = `<button class="dept-tab active" onclick="setEquipDept('all')">Todos <span class="dept-count">(${window._pickerGroups.length})</span></button>` +
      depts.map(cat => {
        const count = window._pickerGroups.filter(g => g.cat === cat).length;
        return `<button class="dept-tab" onclick="setEquipDept('${cat}')">${cat} <span class="dept-count">(${count})</span></button>`;
      }).join('');
  }

  window._currentDept = 'all';

  // 3. Init virtual scroller
  if (!pvViewport) {
    pvViewport = document.getElementById('equipPicker');
    if (pvViewport) {
      pvViewport.innerHTML = '<div class="equip-pick-inner" id="equipPickInner"></div>';
      pvInner = document.getElementById('equipPickInner');
      pvViewport.addEventListener('scroll', renderPickerVirtualItems);
    }
  }

  renderEquipList();
}

function renderEquipList() {
  const searchInput = document.getElementById('equipSearch');
  const search = (searchInput ? searchInput.value : '').toLowerCase();
  const dept = window._currentDept || 'all';
  const currentQty = window._equipQty || {};

  // Filter groups
  currentFilteredPickerGroups = window._pickerGroups.map((g, idx) => ({ ...g, groupIdx: idx }))
    .filter(g => {
      // Must have availability OR be already selected
      if (g.totalAvailable === 0 && !(currentQty[g.groupIdx] > 0)) return false;
      // Dept filter
      if (dept !== 'all' && g.cat !== dept) return false;
      // Search filter
      if (search) {
        const matches = g.nombre.toLowerCase().includes(search) ||
          g.descripcion.toLowerCase().includes(search) ||
          g.marca.toLowerCase().includes(search);
        if (!matches) return false;
      }
      return true;
    });

  if (!pvInner) return;

  if (currentFilteredPickerGroups.length === 0) {
    pvInner.style.height = '0px';
    pvInner.innerHTML = '<div class="equip-pick-empty" style="padding:40px;text-align:center;color:var(--text2)">No se encontraron equipos disponibles</div>';
    return;
  }

  pvInner.style.height = (currentFilteredPickerGroups.length * PICKER_ROW_HEIGHT) + 'px';
  renderPickerVirtualItems();
}

function renderPickerVirtualItems() {
  if (!pvViewport || !pvInner) return;
  const scrollTop = pvViewport.scrollTop;
  const viewportHeight = pvViewport.clientHeight;

  const startIdx = Math.max(0, Math.floor(scrollTop / PICKER_ROW_HEIGHT) - OVERSCAN);
  const endIdx = Math.min(currentFilteredPickerGroups.length, Math.ceil((scrollTop + viewportHeight) / PICKER_ROW_HEIGHT) + OVERSCAN);

  const iconColors = { 'Audio': 'audio', 'Iluminación': 'ilu', 'Video': 'video', 'Rigging': 'rig', 'Bodega': 'bod' };
  const iconSvgs = {
    'Audio': '<svg viewBox="0 0 24 24" fill="var(--blue)"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0014 8.5v7a4.47 4.47 0 002.5-3.5z"/></svg>',
    'Iluminación': '<svg viewBox="0 0 24 24" fill="#a855f7"><path d="M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7z"/></svg>',
    'Video': '<svg viewBox="0 0 24 24" fill="#3b82f6"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>',
    'Rigging': '<svg viewBox="0 0 24 24" fill="#f97316"><path d="M17 12h-2v-2h-2v2h-2v2h2v2h2v-2h2v-2zM11 2H7C5.9 2 5 2.9 5 4v16c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V8l-6-6zm4 18H7V4h3.5v4.5H15V20z"/></svg>',
    'Bodega': '<svg viewBox="0 0 24 24" fill="#fbbf24"><path d="M19 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2m0 16H5V5h14v14M7 10h2v7H7v-7m4-3h2v10h-2V7m4 6h2v4h-2v-4z"/></svg>'
  };

  let html = '';
  const currentQty = window._equipQty || {};

  for (let i = startIdx; i < endIdx; i++) {
    const g = currentFilteredPickerGroups[i];
    const qty = currentQty[g.groupIdx] || 0;
    const iconCls = iconColors[g.cat] || 'audio';
    const top = i * PICKER_ROW_HEIGHT;

    html += `<div class="equip-pick-item" style="top:${top}px" data-gidx="${g.groupIdx}">
      <div class="ep-icon ${iconCls}">${iconSvgs[g.cat] || iconSvgs['Audio']}</div>
      <div class="ep-info">
        <span class="ep-name">${sanitize(g.nombre)} <span style="font-weight:400; opacity:0.7">${sanitize(g.descripcion || '')}</span></span>
        <span class="ep-meta">${sanitize(g.marca)}</span>
      </div>
      <span class="ep-status disp" style="min-width: 90px; text-align: center;">${g.totalAvailable} Disp.</span>
      <div class="qty-control">
        <button class="qty-btn" onclick="changeGroupQty(${g.groupIdx},-1)" ${qty <= 0 ? 'disabled' : ''}>-</button>
        <span class="qty-val qvg-${g.groupIdx} ${qty > 0 ? 'has-qty' : ''}">${qty}</span>
        <button class="qty-btn" onclick="changeGroupQty(${g.groupIdx},1)" ${qty >= g.totalAvailable ? 'disabled' : ''}>+</button>
      </div>
    </div>`;
  }
  pvInner.innerHTML = html;
}

function setEquipDept(dept) {
  window._currentDept = dept;
  document.querySelectorAll('.dept-tab').forEach(t => t.classList.remove('active'));
  event.target.closest('.dept-tab').classList.add('active');
  renderEquipList();
}

function filterEquipPicker() {
  renderEquipList();
}

function changeGroupQty(gIdx, delta) {
  const g = window._pickerGroups[gIdx];
  if (!g) return;
  if (!window._equipQty) window._equipQty = {};

  const current = window._equipQty[gIdx] || 0;
  const newVal = Math.max(0, Math.min(g.totalAvailable, current + delta));
  window._equipQty[gIdx] = newVal;

  const el = document.querySelector(`.qvg-${gIdx}`);
  if (el) {
    el.textContent = newVal;
    el.classList.toggle('has-qty', newVal > 0);
    const minusBtn = el.previousElementSibling;
    const plusBtn = el.nextElementSibling;
    if (minusBtn) minusBtn.disabled = (newVal <= 0);
    if (plusBtn) plusBtn.disabled = (newVal >= g.totalAvailable);
  }
  updateEquipSummary();
}

function updateEquipSummary() {
  const summary = document.getElementById('equipSelectedSummary');
  if (!summary) return;
  const selected = Object.entries(window._equipQty || {}).filter(([, q]) => q > 0);
  if (selected.length === 0) {
    summary.innerHTML = '';
    return;
  }
  const totalItems = selected.reduce((sum, [, q]) => sum + q, 0);
  summary.innerHTML = `<span style="color:var(--text2);margin-right:4px">${totalItems} equipo(s) seleccionados:</span>` +
    selected.map(([gIdx, qty]) => {
      const g = window._pickerGroups[parseInt(gIdx)];
      return `<span class="sel-chip"><span class="sel-qty">${qty}</span> ${sanitize(g.nombre)} <small style="opacity:0.8; margin-left:4px">${sanitize(g.descripcion)}</small></span>`;
    }).join('');
}

function createEvent() {
  const name = (document.getElementById('newEvName').value || '').trim();
  const client = (document.getElementById('newEvClient').value || '').trim();
  const start = document.getElementById('newEvStart').value;
  const end = document.getElementById('newEvEnd').value;
  const errEl = document.getElementById('addEvError');

  if (!name || !client || !start || !end) {
    errEl.textContent = 'Todos los campos marcados con * son obligatorios';
    return;
  }

  // Build categories from selected equipment groups
  const categories = {};
  Object.entries(window._equipQty || {}).forEach(([gIdx, qty]) => {
    if (qty > 0) {
      const g = window._pickerGroups[parseInt(gIdx)];
      if (g) {
        const cat = g.cat || 'Otros';
        if (!categories[cat]) categories[cat] = [];
        categories[cat].push({
          model: g.descripcion,
          name: g.nombre,
          marca: g.marca,
          qty: qty,
          doneCount: 0,
          scannedIds: []
        });
      }
    }
  });

  // Generate unique key
  const key = name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').slice(0, 20) + '_' + Date.now();

  // Capture responsibles
  const responsibles = {
    Audio: (document.getElementById('newRespAudio').value || '').trim() || 'Por asignar',
    Iluminación: (document.getElementById('newRespIlu').value || '').trim() || 'Por asignar',
    Video: (document.getElementById('newRespVideo').value || '').trim() || 'Por asignar',
    Rigging: (document.getElementById('newRespRig').value || '').trim() || 'Por asignar',
    Bodega: (document.getElementById('newRespBod').value || '').trim() || 'Por asignar'
  };

  // Add to checkData
  checkData[key] = {
    title: name,
    client: client,
    date: dateStr,
    categories: categories,
    responsibles: responsibles
  };


  saveEvents(checkData); // Persist change


  // Clear form and state
  document.getElementById('newEvName').value = '';
  document.getElementById('newEvClient').value = '';
  document.getElementById('newEvStart').value = '';
  document.getElementById('newEvEnd').value = '';
  document.getElementById('newRespAudio').value = '';
  document.getElementById('newRespIlu').value = '';
  document.getElementById('newRespVideo').value = '';
  document.getElementById('newRespRig').value = '';
  document.getElementById('newRespBod').value = '';
  document.getElementById('equipSearch').value = '';

  document.getElementById('equipSelectedSummary').innerHTML = '';
  window._equipQty = {};
  errEl.textContent = '';

  closeAddEventModal();
  renderScanEventOptions();
  showToast(`? Evento "${name}" creado exitosamente`);
  showPage('pg-eventos');
}

// === RENDER EVENT CARDS ===
function renderEventCards() {
  const salidaEl = document.getElementById('evGrupoSalida');
  const cursoEl = document.getElementById('evGrupoCurso');
  const finEl = document.getElementById('evGrupoFin');

  let salidaHTML = '';
  let cursoHTML = '';
  let finHTML = '';

  const editSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>';
  const deleteSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>';

  // Preload user once to avoid JSON parsing in loop
  const user = getCurrentUser();
  const canEdit = user && (user.role === 'admin' || user.permissions.includes('eventos_edit'));

  Object.entries(checkData).forEach(([key, ev]) => {
    // Calculate progress (optimized)
    let total = 0, done = 0;
    if (ev.categories) {
      for (const items of Object.values(ev.categories)) {
        for (const g of items) {
          total += (g.qty || 0);
          done += (g.doneCount || 0);
        }
      }
    }

    // Determine status for UI buckets
    const isReturningOrReturned = ev.fin === true;
    const isCompletamenteCargado = (!isReturningOrReturned && total > 0 && done === total);
    const isSaliendo = (!isReturningOrReturned && (total === 0 || done < total));

    let pct = 0;
    let displayDone = done;
    if (total > 0) {
      if (isReturningOrReturned) {
        pct = Math.round(((total - done) / total) * 100);
        displayDone = total - done;
      } else {
        pct = Math.round((done / total) * 100);
      }
    }

    // Badge visuals
    let badgeCls, badgeTxt, fillCls = 'progress-fill', txtStyle = '';

    if (isReturningOrReturned && done === 0) {
      badgeCls = 'complete'; badgeTxt = 'Devuelto';
      fillCls += ' complete-fill'; txtStyle = 'color:var(--green)';
    } else if (isReturningOrReturned && done > 0) {
      badgeCls = 'ret-pend'; badgeTxt = 'En Devolución';
      fillCls += ' ret-fill'; txtStyle = 'color:var(--orange)';
    } else if (isCompletamenteCargado) {
      badgeCls = 'active'; badgeTxt = 'Carga Lista';
      fillCls += ' complete-fill'; txtStyle = 'color:var(--green)';
    } else if (done > 0) {
      badgeCls = 'ret-pend'; badgeTxt = 'En Proceso';
      fillCls += ' ret-fill'; txtStyle = 'color:var(--orange)';
    } else {
      badgeCls = 'pending'; badgeTxt = 'Pendiente';
    }

    const editBtn = canEdit ? `<button class="ev-edit-btn" onclick="event.stopPropagation(); editEvent('${key}')" title="Modificar evento">${editSvg}</button>` : '';
    const deleteBtn = canEdit ? `<button class="ev-edit-btn" onclick="event.stopPropagation(); deleteEvent('${key}')" title="Eliminar evento" style="color: var(--red); margin-left: 8px;">${deleteSvg}</button>` : '';

    const card = `<div class="event-card" onclick="openEvent('${key}')">
      <div class="ev-top">
        <span class="ev-name">${sanitize(ev.title)}</span>
        <div class="ev-top-actions">
          ${editBtn}
          ${deleteBtn}
          <span class="ev-badge ${badgeCls}" style="margin-left: 8px;">${badgeTxt}</span>
        </div>
      </div>
      <p class="ev-client">${ev.client}</p>
      <p class="ev-date">${ev.date}</p>
      <div class="progress-row">
        <div class="progress-bar">
          <div class="${fillCls}" style="width:${pct}%"></div>
        </div><span class="progress-txt" ${txtStyle ? 'style="' + txtStyle + '"' : ''}>${displayDone}/${total}</span>
      </div>
    </div>`;

    if (isReturningOrReturned) {
      finHTML += card;
    } else if (isCompletamenteCargado) {
      cursoHTML += card;
      finHTML += card; // Dual Routing
    } else {
      salidaHTML += card;
    }
  });

  if (salidaEl) salidaEl.innerHTML = salidaHTML || '<p style="text-align:center;color:var(--text2);padding:24px;font-size:13px">No hay eventos en preparación (Salida)</p>';
  if (cursoEl) cursoEl.innerHTML = cursoHTML || '<p style="text-align:center;color:var(--text2);padding:24px;font-size:13px">No hay eventos activos en ruta (En Curso)</p>';

  // Add notice and input at top of finished group
  const finNotice = `<div class="fin-notice" style="flex-direction: column; gap: 12px;">
    <div style="display: flex; gap: 8px; align-items: flex-start;">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--orange)"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>
      <span>Escanea los equipos de regreso para verificar que todo volvió completo</span>
    </div>
    <div class="search-bar" style="width: 100%; background: rgba(255,255,255,0.05); border-color: rgba(212,175,55,0.3);">
      <svg class="search-icon" viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" /></svg>
      <input type="text" class="search-input" id="globalReturnScanInput" placeholder="Escanear equipo de regreso..." 
        onkeydown="if(event.key === 'Enter') handleGlobalReturnScan(this.value)">
    </div>
  </div>`;
  if (finEl) finEl.innerHTML = finHTML ? finNotice + finHTML : '<p style="text-align:center;color:var(--text2);padding:24px;font-size:13px">No hay eventos en etapa de devolución</p>';
}

// === DELETE EVENT ===
let currentDeleteKey = null;

function deleteEvent(key) {
  currentDeleteKey = key;
  const ev = checkData[key];
  if (!ev) return;
  document.getElementById('delModalEvName').textContent = '"' + ev.title + '"';
  document.getElementById('deleteModal').classList.add('show');
}

function closeDeleteModal() {
  currentDeleteKey = null;
  document.getElementById('deleteModal').classList.remove('show');
}

function confirmDeleteEvent() {
  if (currentDeleteKey && checkData[currentDeleteKey]) {
    const title = checkData[currentDeleteKey].title;
    delete checkData[currentDeleteKey];
    saveEvents(checkData); // Persist change
    renderEventCards();
    renderScanEventOptions(); // Actualizar selector de escaneo

    // Registrar Actividad
    const timeStr = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    const usr = getCurrentUser();
    movimientos.unshift({
      equip: 'N/A', id: 'N/A', evento: title,
      tipo: 'Evento Eliminado', time: 'Hoy ' + timeStr, resp: usr ? usr.username : 'Sistema'
    });
    saveMovimientos(movimientos);

    showToast('Evento eliminado exitosamente');
  }
  closeDeleteModal();
}

// === EDIT EVENT ===
function editEvent(key) {
  const ev = checkData[key];
  if (!ev) return;

  // Pre-fill basic fields
  document.getElementById('newEvName').value = ev.title;
  document.getElementById('newEvClient').value = ev.client;

  // Pre-fill responsibles
  const res = ev.responsibles || {};
  document.getElementById('newRespAudio').value = res.Audio === 'Por asignar' ? '' : (res.Audio || '');
  document.getElementById('newRespIlu').value = res.Iluminación === 'Por asignar' ? '' : (res.Iluminación || '');
  document.getElementById('newRespVideo').value = res.Video === 'Por asignar' ? '' : (res.Video || '');
  document.getElementById('newRespRig').value = res.Rigging === 'Por asignar' ? '' : (res.Rigging || '');
  document.getElementById('newRespBod').value = res.Bodega === 'Por asignar' ? '' : (res.Bodega || '');


  // Parse date string to fill date inputs (format: "15 Mar — 17 Mar 2026")
  // We'll leave dates empty since they're in display format, user can re-set them
  document.getElementById('newEvStart').value = '';
  document.getElementById('newEvEnd').value = '';

  // Pre-fill quantities from event categories
  window._equipQty = {};
  if (ev.categories) {
    // We need to map event category models back to our picker groups
    Object.entries(ev.categories).forEach(([cat, groups]) => {
      groups.forEach(g => {
        const pickerGIdx = window._pickerGroups.findIndex(pg =>
          pg.cat === cat && pg.descripcion === g.model && pg.marca === g.marca
        );
        if (pickerGIdx >= 0) {
          window._equipQty[pickerGIdx] = (window._equipQty[pickerGIdx] || 0) + g.qty;
        }
      });
    });
  }

  // Render picker and summary
  renderEquipPicker();
  updateEquipSummary();

  // Store edit key so createEvent knows to update instead of create
  window._editingEventKey = key;

  // Change button text
  const btn = document.querySelector('#addEventModal .submit-btn');
  btn.textContent = 'GUARDAR CAMBIOS';
  btn.onclick = function () { saveEditedEvent(key); };

  document.getElementById('addEventModal').classList.add('show');
}

function saveEditedEvent(key) {
  const name = (document.getElementById('newEvName').value || '').trim();
  const client = (document.getElementById('newEvClient').value || '').trim();
  const start = document.getElementById('newEvStart').value;
  const end = document.getElementById('newEvEnd').value;
  const errEl = document.getElementById('addEvError');

  if (!name || !client) {
    errEl.textContent = 'El nombre y el cliente son obligatorios';
    return;
  }

  // Build categories from selected equipment (GROUPED BY MODEL)
  const categories = {};
  Object.entries(window._equipQty || {}).forEach(([idx, qty]) => {
    if (qty > 0) {
      const eq = equipos[parseInt(idx)];
      if (eq) {
        const cat = eq.cat || 'Otros';
        if (!categories[cat]) categories[cat] = [];

        // Find if this model already exists
        let group = categories[cat].find(g => g.model === eq.descripcion);
        if (group) {
          group.qty += qty;
        } else {
          categories[cat].push({
            model: eq.descripcion,
            name: eq.nombre,
            marca: eq.marca,
            qty: qty,
            doneCount: 0,
            scannedIds: []
          });
        }
      }
    }
  });

  // Update dates if provided, otherwise keep old
  let dateStr = checkData[key].date;
  if (start && end) {
    const startDate = new Date(start);
    const endDate = new Date(end);
    const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    dateStr = `${startDate.getDate()} ${months[startDate.getMonth()]} — ${endDate.getDate()} ${months[endDate.getMonth()]} ${endDate.getFullYear()}`;
  }

  // Capture responsibles
  const responsibles = {
    Audio: (document.getElementById('newRespAudio').value || '').trim() || 'Por asignar',
    Iluminación: (document.getElementById('newRespIlu').value || '').trim() || 'Por asignar',
    Video: (document.getElementById('newRespVideo').value || '').trim() || 'Por asignar',
    Rigging: (document.getElementById('newRespRig').value || '').trim() || 'Por asignar',
    Bodega: (document.getElementById('newRespBod').value || '').trim() || 'Por asignar'
  };

  // Update event
  checkData[key].title = name;
  checkData[key].client = client;
  checkData[key].date = dateStr;
  checkData[key].responsibles = responsibles;

  saveEvents(checkData); // Persist change

  // Registrar Actividad
  const timeStr = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  const usr = getCurrentUser();
  movimientos.unshift({
    equip: 'Todos', id: 'N/A', evento: checkData[key].title,
    tipo: 'Evento Editado', time: 'Hoy ' + timeStr, resp: usr ? usr.username : 'Sistema'
  });
  saveMovimientos(movimientos);

  // Reset form state
  document.getElementById('newEvName').value = '';
  document.getElementById('newEvClient').value = '';
  document.getElementById('newEvStart').value = '';
  document.getElementById('newEvEnd').value = '';
  document.getElementById('newRespAudio').value = '';
  document.getElementById('newRespIlu').value = '';
  document.getElementById('newRespVideo').value = '';
  document.getElementById('newRespRig').value = '';
  document.getElementById('newRespBod').value = '';
  document.getElementById('equipSearch').value = '';
  document.getElementById('equipSelectedSummary').innerHTML = '';
  window._equipQty = {};
  window._editingEventKey = null;
  errEl.textContent = '';

  // Reset button
  const btn = document.querySelector('#addEventModal .submit-btn');
  btn.textContent = 'CREAR EVENTO';
  btn.onclick = createEvent;

  closeAddEventModal();
  renderScanEventOptions(); // Actualizar selector de escaneo
  showToast(`? Evento "${name}" modificado`);
  showPage('pg-eventos');
}
const svgIcons = {
  audio: '<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0014 8.5v7a4.47 4.47 0 002.5-3.5zM14 3.23v2.06a7 7 0 010 13.42v2.06A9 9 0 0014 3.23z"/></svg>',
  ilu: '<svg viewBox="0 0 24 24"><path d="M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7z"/></svg>',
  video: '<svg viewBox="0 0 24 24"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>',
  est: '<svg viewBox="0 0 24 24"><path d="M22 21H2V9l10-7 10 7v12zM12 4.5L4 9.8V19h16V9.8l-8-5.3z"/></svg>',
  rig: '<svg viewBox="0 0 24 24"><path d="M17 12h-2v-2h-2v2h-2v2h2v2h2v-2h2v-2zM11 2H7C5.9 2 5 2.9 5 4v16c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V8l-6-6zm4 18H7V4h3.5v4.5H15V20z"/></svg>',
  bod: '<svg viewBox="0 0 24 24"><path d="M19 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2m0 16H5V5h14v14M7 10h2v7H7v-7m4-3h2v10h-2V7m4 6h2v4h-2v-4z"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z"/></svg>',
  arrowUp: '<svg viewBox="0 0 24 24"><path d="M4 12l1.41 1.41L11 7.83V20h2V7.83l5.59 5.58L20 12l-8-8-8 8z"/></svg>',
  arrowDown: '<svg viewBox="0 0 24 24"><path d="M20 12l-1.41-1.41L13 16.17V4h-2v12.17l-5.59-5.58L4 12l8 8 8-8z"/></svg>',
  minus: '<svg viewBox="0 0 24 24"><path d="M19 13H5v-2h14v2z"/></svg>'
};

// === EVENT TABS & DROPDOWNS ===
function renderScanEventOptions() {
  const select = document.getElementById('scanEventSelect');
  if (!select) return;

  const currentValue = select.value;

  let html = '<option value="">Seleccionar Evento...</option>';
  Object.entries(checkData).forEach(([key, ev]) => {
    // Solo mostrar eventos que no estén totalmente finalizados si se prefiere, 
    // pero por ahora mostraremos todos los que están en checkData
    html += `<option value="${key}">${ev.title}</option>`;
  });
  select.innerHTML = html;

  if (currentValue && checkData[currentValue]) {
    select.value = currentValue;
  }
}

// === DATA PERSISTENCE HELPERS ===
function getStoredEvents() {
  try {
    return JSON.parse(localStorage.getItem('rap_events_v1') || '{}');
  } catch (e) {
    console.error("Error parsing events from localStorage:", e);
    return {};
  }
}

async function saveEvents(data) {
  localStorage.setItem('rap_events_v1', JSON.stringify(data));
  renderScanEventOptions();
  await pushSharedData(); // Sync to global
}

function getStoredMovimientos() {
  try {
    return JSON.parse(localStorage.getItem('rap_movimientos_v1') || '[]');
  } catch (e) {
    console.error("Error parsing movements from localStorage:", e);
    return [];
  }
}

async function saveMovimientos(data) {
  localStorage.setItem('rap_movimientos_v1', JSON.stringify(data));
  await pushSharedData();
}

async function pushSharedData() {
  const p = {
    action: 'push',
    token: API_TOKEN,
    events: getStoredEvents(),
    movements: getStoredMovimientos(),
    archivedEvents: JSON.parse(localStorage.getItem('rap_archived_v1') || '{}'),
    notifications: getNotifs()
  };
  try {
    await fetch(API_URL, { method: 'POST', body: JSON.stringify(p) });
  } catch (e) {
    console.warn("Push error:", e);
  }
}

async function pullSharedData() {
  return new Promise((resolve) => {
    const cb = 'pull_' + Date.now();
    window[cb] = (res) => {
      delete window[cb];
      document.body.removeChild(sc);
      if (res && res.success && res.data) {
        if (res.data.events) { checkData = res.data.events; localStorage.setItem('rap_events_v1', JSON.stringify(checkData)); }
        if (res.data.movements) { movimientos = res.data.movements; localStorage.setItem('rap_movimientos_v1', JSON.stringify(movements)); }
        if (res.data.archivedEvents) { archivedEvents = res.data.archivedEvents; localStorage.setItem('rap_archived_v1', JSON.stringify(archivedEvents)); }
        if (res.data.notifications) { saveNotifs(res.data.notifications); }
        renderScanEventOptions();
        resolve(true);
      }
      resolve(false);
    };
    const sc = document.createElement('script');
    sc.src = `${API_URL}?action=pull&token=${API_TOKEN}&callback=${cb}`;
    document.body.appendChild(sc);
  });
}


// === INITIALIZE DATA ===
checkData = getStoredEvents();
movimientos = getStoredMovimientos();

// === NAVIGATION ===
const navHistory = ['pg-dashboard'];
let currentOpenEventKey = null;

function showPage(id, skipHistory) {
  // Push to history (unless navigating back)
  if (!skipHistory) {
    const current = navHistory[navHistory.length - 1];
    if (current !== id) navHistory.push(id);
  }

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  // Sync bottom nav
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const navBtn = document.querySelector(`.nav-btn[data-page="${id}"]`);
  if (navBtn) navBtn.classList.add('active');
  // Sync sidebar
  document.querySelectorAll('.sidebar-btn').forEach(b => b.classList.remove('active'));
  const sideBtn = document.querySelector(`.sidebar-btn[data-page="${id}"]`);
  if (sideBtn) sideBtn.classList.add('active');
  // Render admin panel if navigating to it
  if (id === 'pg-admin') renderAdminPanel();
  // Render event cards dynamically
  if (id === 'pg-eventos') renderEventCards();
  // Render dashboard charts dynamically
  if (id === 'pg-dashboard') renderDashboardCharts();
  // Render scan options dynamically
  if (id === 'pg-scan') renderScanEventOptions();
  // Render historial de eventos finalizados
  if (id === 'pg-movimientos') renderMovimientos();

  // Show/hide back button based on history
  updateBackButton(id);

  // Focus global search input
  if (id === 'pg-search-global') {
    setTimeout(() => {
      const input = document.getElementById('globalSearchInput');
      if (input) {
        input.value = '';
        input.focus();
        handleGlobalSearch('');
      }
    }, 100);
  }
}

function initNavigation() {
  const buttons = document.querySelectorAll('.sidebar-btn, .nav-btn');
  buttons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      // Find the closest button element in case an inner SVG/span was clicked
      const targetBtn = e.target.closest('button');
      if (!targetBtn) return;

      const pageId = targetBtn.getAttribute('data-page');
      if (pageId) {
        showPage(pageId);
        targetBtn.blur(); // Remove browser focus ring
      }
    });
  });
}

function goBack() {
  if (navHistory.length > 1) {
    navHistory.pop(); // Remove current
    const prev = navHistory[navHistory.length - 1];
    showPage(prev, true);
  } else {
    showPage('pg-dashboard', true);
  }
}

function updateBackButton(pageId) {
  // Show/hide the global back arrow in topbar
  document.querySelectorAll('.topbar .global-back').forEach(btn => {
    btn.style.display = (navHistory.length > 1 && pageId !== 'pg-dashboard') ? 'inline-flex' : 'none';
  });
}

function renderStrategicInsights() {
  const container = document.getElementById('strategic-insight-container');
  if (!container || !window.equipos || equipos.length === 0) return;

  const total = equipos.length;
  const disp = equipos.filter(e => e.estado === 'Disponible').length;
  const mant = equipos.filter(e => e.estado === 'Mantenimiento').length;
  const evento = equipos.filter(e => e.estado === 'En Evento').length;
  const health = Math.round((disp / total) * 100);
  const utilization = Math.round((evento / total) * 100);

  // Sync Health check
  const lastSyncStr = localStorage.getItem('rap_last_sync');
  const lastSync = lastSyncStr ? new Date(lastSyncStr) : null;
  const hoursSinceSync = lastSync ? (new Date() - lastSync) / (1000 * 60 * 60) : 999;
  const syncWarning = hoursSinceSync > 24;

  // Update Health Badge Dot Color
  const badgeDot = document.querySelector('.badge-dot');
  if (badgeDot) {
    if (health > 95 && !syncWarning) badgeDot.style.background = 'var(--green)';
    else if (health > 80 || syncWarning) badgeDot.style.background = 'var(--orange)';
    else badgeDot.style.background = 'var(--red)';
  }

  // Identify Strategic Recommendation
  let recommendation = "Ecosistema estable. Parámetros de flujo dentro de los márgenes óptimos.";
  let statusColor = 'var(--green)';

  if (syncWarning) {
    recommendation = "Advertencia de desincronización detected. La latencia con Google Drive supera las 24 horas.";
    statusColor = 'var(--orange)';
  } else if (mant > total * 0.08) {
    recommendation = `Riesgo operativo detectado: ${mant} activos en mantenimiento (${Math.round((mant / total) * 100)}%). Priorizar desbloqueo de bodega.`;
    statusColor = 'var(--red)';
  } else if (utilization > 70) {
    recommendation = "Alta demanda detectada: 70% del inventario en tránsito. Sugerencia: Bloquear nuevas reservas para inspección de retorno.";
    statusColor = 'var(--blue)';
  }

  container.innerHTML = `
    <div class="insight-card">
      <div class="insight-header">
        <div class="insight-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/></svg>
          Omniscience Intelligence
        </div>
        <div class="metric-label" style="color: ${statusColor}">Active Monitoring</div>
      </div>
      <div class="insight-main">
        ${recommendation}
      </div>
      <div class="insight-footer">
        <div class="insight-metric">
          <span class="metric-val" style="color: var(--green)">${health}%</span>
          <span class="metric-label">Health</span>
        </div>
        <div class="insight-metric">
          <span class="metric-val" style="color: var(--blue)">${utilization}%</span>
          <span class="metric-label">Flow Rate</span>
        </div>
        <div class="insight-metric">
          <span class="metric-val">${total.toLocaleString()}</span>
          <span class="metric-label">Total Assets</span>
        </div>
        <button class="zero-g-btn" onclick="manualSync()">Execute Master Sync</button>
      </div>
    </div>
  `;
}

function renderDashboardCharts() {
  // Call strategic insights first
  renderStrategicInsights();

  const container = document.getElementById('dashboardCharts');
  // Wait until Chart is loaded or just return if no container
  if (!container || typeof Chart === 'undefined') return;
  container.style.display = 'flex';

  // Show Skeleton state first
  container.innerHTML = `
    <div style="background: var(--card); border-radius: 16px; height: 260px;" class="skeleton"></div>
    <div style="background: var(--card); border-radius: 16px; height: 260px;" class="skeleton"></div>
    <div style="background: var(--card); border-radius: 16px; height: 260px;" class="skeleton"></div>
  `;

  setTimeout(() => {
    // Restore structure after delay
    container.innerHTML = `
      <div class="chart-card" style="background: var(--card); border-radius: 16px; padding: 16px;">
        <h3 style="margin-bottom: 12px; font-size: 14px; font-weight: 600;">Ocupación Total</h3>
        <div style="position: relative; height: 200px; width: 100%;">
          <canvas id="donutChart"></canvas>
        </div>
      </div>
      
      <div class="chart-card" style="background: var(--card); border-radius: 16px; padding: 16px;">
        <h3 style="margin-bottom: 12px; font-size: 14px; font-weight: 600;">Ocupación por Departamento</h3>
        <div style="position: relative; height: 200px; width: 100%;">
          <canvas id="barChart"></canvas>
        </div>
      </div>

      <div class="chart-card" style="background: var(--card); border-radius: 16px; padding: 16px;">
        <h3 style="margin-bottom: 12px; font-size: 14px; font-weight: 600;">Top 5 Artículos más Rentados</h3>
        <div style="position: relative; height: 240px; width: 100%;">
          <canvas id="topUsageChart"></canvas>
        </div>
      </div>
    `;

    // 1. Ocupación Total (Donut)
    const disp = equipos.filter(e => e.estado === 'Disponible').length;
    const evento = equipos.filter(e => e.estado === 'En Evento').length;
    const mant = equipos.filter(e => e.estado === 'Mantenimiento').length;

    const donutCtx = document.getElementById('donutChart');
    if (donutCtx) {
      if (window._donutChart) window._donutChart.destroy();
      window._donutChart = new Chart(donutCtx, {
        type: 'doughnut',
        data: {
          labels: ['Disponible', 'En Evento', 'Mantenimiento'],
          datasets: [{
            data: [disp, evento, mant],
            backgroundColor: ['#7bc67e', '#D4AF37', '#c45c5c'],
            borderWidth: 2,
            borderColor: '#141414',
            hoverOffset: 6,
            borderRadius: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'bottom',
              labels: {
                color: '#8a8578',
                font: { family: 'Outfit', size: 13, weight: '500' },
                padding: 20,
                usePointStyle: true,
                pointStyle: 'circle'
              }
            },
            tooltip: {
              backgroundColor: 'rgba(30, 30, 30, 0.95)',
              titleFont: { family: 'Outfit', size: 14, weight: '700' },
              bodyFont: { family: 'Inter', size: 13 },
              padding: 12,
              cornerRadius: 12,
              borderColor: 'rgba(212, 175, 55, 0.2)',
              borderWidth: 1,
              callbacks: {
                label: function (context) {
                  let label = context.label || '';
                  if (label) label += ': ';
                  label += context.parsed + ' items';
                  return label;
                }
              }
            }
          },
          cutout: '75%'
        }
      });
    }

    // 2. Ocupación por Departamento (Bar Chart)
    const cats = [...new Set(equipos.map(e => e.cat))];
    const barData = cats.map(c => {
      return equipos.filter(e => e.cat === c && e.estado === 'En Evento').length;
    });

    const barCtx = document.getElementById('barChart');
    if (barCtx) {
      if (window._barChart) window._barChart.destroy();

      const ctx2d = barCtx.getContext('2d');
      const gradient = ctx2d.createLinearGradient(0, 0, 0, 200);
      gradient.addColorStop(0, '#D4AF37');
      gradient.addColorStop(1, '#A67B27');

      window._barChart = new Chart(barCtx, {
        type: 'bar',
        data: {
          labels: cats,
          datasets: [{
            label: 'En Evento',
            data: barData,
            backgroundColor: gradient,
            borderRadius: { topLeft: 8, topRight: 8, bottomLeft: 0, bottomRight: 0 },
            borderSkipped: false,
            barPercentage: 0.5,
            hoverBackgroundColor: '#E6C55C'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                color: '#8a8578',
                font: { family: 'Inter', size: 11 },
                padding: 8
              },
              border: { display: false },
              grid: {
                color: 'rgba(255,255,255,0.03)',
                drawBorder: false,
                tickLength: 0
              }
            },
            x: {
              ticks: {
                color: '#8a8578',
                font: { family: 'Inter', size: 12, weight: '500' },
                padding: 8
              },
              border: { display: false },
              grid: { display: false, drawBorder: false }
            }
          },
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: 'rgba(30, 30, 30, 0.95)',
              titleFont: { family: 'Outfit', size: 13 },
              bodyFont: { family: 'Inter', size: 14, weight: '700' },
              padding: 12,
              cornerRadius: 12,
              borderColor: 'rgba(212, 175, 55, 0.2)',
              borderWidth: 1,
              displayColors: false
            }
          }
        }
      });
    }

    // 3. Top 5 Más Usados (Horizontal Bar Chart)
    const usageCounts = {};
    Object.values(checkData).forEach(ev => {
      if (ev.categories) {
        Object.values(ev.categories).forEach(items => {
          items.forEach(item => {
            const label = item.name; // Use name for the chart labels
            usageCounts[label] = (usageCounts[label] || 0) + 1;
          });
        });
      }
    });

    const top5 = Object.entries(usageCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    const topLabels = top5.map(x => x[0]);
    const topData = top5.map(x => x[1]);

    const topCtx = document.getElementById('topUsageChart');
    if (topCtx) {
      if (window._topUsageChart) window._topUsageChart.destroy();
      const ctx3d = topCtx.getContext('2d');
      const gradH = ctx3d.createLinearGradient(0, 0, 400, 0);
      gradH.addColorStop(0, '#3b82f6');
      gradH.addColorStop(1, '#2563eb');

      window._topUsageChart = new Chart(topCtx, {
        type: 'bar',
        data: {
          labels: topLabels,
          datasets: [{
            label: 'Veces Rentado',
            data: topData,
            backgroundColor: gradH,
            borderRadius: 6,
            barPercentage: 0.6,
            hoverBackgroundColor: '#60a5fa'
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: {
              beginAtZero: true,
              ticks: { color: '#8a8578', font: { family: 'Inter', size: 11 } },
              grid: { color: 'rgba(255,255,255,0.03)' },
              border: { display: false }
            },
            y: {
              ticks: {
                color: '#fff',
                font: { family: 'Outfit', size: 12, weight: '500' },
                padding: 10
              },
              grid: { display: false },
              border: { display: false }
            }
          },
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: 'rgba(30, 30, 30, 0.95)',
              titleFont: { family: 'Outfit', size: 13 },
              bodyFont: { family: 'Inter', size: 14, weight: '700' },
              padding: 12,
              cornerRadius: 12,
              borderColor: 'rgba(59, 130, 246, 0.2)',
              borderWidth: 1,
              displayColors: false
            }
          }
        }
      });
    }
  }, 600); // 600ms fake load delay
}

// Bottom nav
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => showPage(btn.dataset.page));
});

// Sidebar nav
document.querySelectorAll('.sidebar-btn').forEach(btn => {
  btn.addEventListener('click', () => showPage(btn.dataset.page));
});

// === VIRTUAL SCROLLING FOR INVENTORY ===
let currentFilteredEquipos = [];
const ROW_HEIGHT = 110;
const OVERSCAN = 5;
let vsViewport, vsInner;
let isDataLoading = false;

function initVirtualScroller() {
  const container = document.getElementById('equipList');
  if (!container) return;

  // Wrap equipList contents in our virtual DOM structure
  container.innerHTML = `
    <div class="virtual-scroll-viewport" id="vsViewport">
      <div class="virtual-scroll-inner" id="vsInner"></div>
    </div>
  `;

  vsViewport = document.getElementById('vsViewport');
  vsInner = document.getElementById('vsInner');

  // Set fixed height for the container to enable scrolling
  // Adjusted to -310px to account for the new 32px margin-bottom added to the search bar and chips.
  vsViewport.style.height = 'calc(100vh - 310px)';

  vsViewport.addEventListener('scroll', () => {
    requestAnimationFrame(renderVirtualItems);
  });
}

function renderEquipos(cat) {
  if (!vsViewport || !vsInner) initVirtualScroller();

  // Reset scroll to top when category changes
  vsViewport.scrollTop = 0;
  isDataLoading = true;

  // Insert Skeletons
  let skeletonHtml = '';
  for (let i = 0; i < 8; i++) {
    skeletonHtml += `
      <div class="skeleton-card">
        <div class="skeleton-avatar skeleton"></div>
        <div class="skeleton-wrapper">
          <div class="skeleton-title skeleton"></div>
          <div class="skeleton-text skeleton" style="width: 40%"></div>
        </div>
      </div>
    `;
  }
  vsInner.innerHTML = skeletonHtml;
  vsInner.style.height = 'auto'; // allow natural height for skeletons

  // Fake network delay of 500ms
  setTimeout(() => {
    isDataLoading = false;
    currentFilteredEquipos = cat === 'Todos' ? equipos : equipos.filter(e => e.cat === cat);

    // Update inner height based on total items
    vsInner.style.height = `${currentFilteredEquipos.length * ROW_HEIGHT}px`;

    // Update dynamic count header
    const countEl = document.getElementById('invResultsCount');
    if (countEl) {
      countEl.innerHTML = `${currentFilteredEquipos.length} Artículos`;
    }

    renderVirtualItems();
  }, 500);
}

function renderVirtualItems() {
  if (isDataLoading) return; // Wait for skeleton to finish
  if (!currentFilteredEquipos.length) {
    vsInner.innerHTML = '<p style="color:var(--text2); font-size:13px; padding:16px">No hay equipos en esta categoría.</p>';
    return;
  }

  const scrollTop = vsViewport.scrollTop;
  const viewportHeight = vsViewport.clientHeight;

  // Calculate which items should be visible
  let startIndex = Math.floor(scrollTop / ROW_HEIGHT);
  let endIndex = Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT);

  // Add overscan
  startIndex = Math.max(0, startIndex - OVERSCAN);
  endIndex = Math.min(currentFilteredEquipos.length, endIndex + OVERSCAN);

  let html = '';
  // Loop through visible range
  for (let i = startIndex; i < endIndex; i++) {
    const e = currentFilteredEquipos[i];
    const topPos = i * ROW_HEIGHT;
    const stCls = e.estado === 'Disponible' ? 'disp' : e.estado === 'En Evento' ? 'evento' : 'mant';

    // We need original index from the main `equipos` array for the detail view
    const globalIdx = equipos.indexOf(e);

    html += `
      <div class="virtual-item" style="top: ${topPos}px; height: ${ROW_HEIGHT - 16}px; padding-bottom: 16px; box-sizing: border-box;">
        <div class="equip-card" onclick="openEquipDetail(${globalIdx})" style="height: 100%;">
          <div class="equip-icon ${e.iconCls}">${svgIcons[e.iconCls]}</div>
          <div class="equip-info"><div class="equip-name">${e.nombre}</div><div class="equip-id">${e.id} • ${e.cat}</div></div>
          <span class="equip-status ${stCls}">${e.estado}</span>
        </div>
      </div>
    `;
  }

  vsInner.innerHTML = html;
}

function openEquipDetail(idx) {
  const e = equipos[idx];
  const stCls = e.estado === 'Disponible' ? 'disp' : e.estado === 'En Evento' ? 'evento' : 'mant';

  // Build actions: A simple toggle for Maintenance if it's not currently in an event
  let actionsHTML = '';
  if (e.estado !== 'En Evento') {
    const nextSt = e.estado === 'Disponible' ? 'Mantenimiento' : 'Disponible';
    const btnCls = nextSt === 'Disponible' ? 'submit-btn' : 'btn-cancel';
    actionsHTML = `
      <div style="margin-top: 24px;">
        <button class="${btnCls}" style="width: 100%;" onclick="toggleEquipStatus(${idx}, '${nextSt}')">
          Marcar como ${nextSt}
        </button>
      </div>
    `;
  }

  document.getElementById('equipDetailContent').innerHTML = `
    <div class="ed-header">
      <div class="ed-icon ${e.iconCls}">${svgIcons[e.iconCls]}</div>
      <div><h2 class="ed-name">${e.nombre}</h2><span class="equip-status ${stCls}">${e.estado}</span></div>
    </div>
    
    <div class="ed-qr-container" style="display: flex; flex-direction: column; align-items: center; justify-content: center; margin: 24px 0; padding: 16px; background: rgba(0,0,0,0.2); border-radius: 12px;">
      <div id="qrCodeWrapper" style="background: white; padding: 12px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);"></div>
      <span style="margin-top: 12px; font-family: monospace; letter-spacing: 2px; font-size: 14px; color: var(--text);">${e.id}</span>
    </div>

    <div class="ed-grid">
      <div class="ed-field"><span class="ed-label">Activo</span><span class="ed-value">${e.id}</span></div>
      <div class="ed-field"><span class="ed-label">Marca</span><span class="ed-value">${e.marca}</span></div>
      <div class="ed-field"><span class="ed-label">Modelo</span><span class="ed-value">${e.modelo}</span></div>
      <div class="ed-field"><span class="ed-label">No. Serie</span><span class="ed-value">${e.serie}</span></div>
      <div class="ed-field"><span class="ed-label">Categoría</span><span class="ed-value">${e.cat}</span></div>
      <div class="ed-field"><span class="ed-label">Ubicación</span><span class="ed-value">${e.ubicacion}</span></div>
    </div>
    ${actionsHTML}
  `;

  document.getElementById('equipDetailPanel').classList.add('show');

  // Generate QR Code dynamically after DOM is ready
  setTimeout(() => {
    const qrWrap = document.getElementById("qrCodeWrapper");
    if (qrWrap) {
      qrWrap.innerHTML = ""; // Clear previous
      new QRCode(qrWrap, {
        text: e.id,
        width: 140,
        height: 140,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.H
      });
    }
  }, 50);
}

function closeEquipDetail() {
  document.getElementById('equipDetailPanel').classList.remove('show');
}

// SIMULATE NETWORK LOCK (Prevents collision)
async function verifyAssetLock(id) {
  // Simulate network delay
  await new Promise(r => setTimeout(r, 400 + Math.random() * 400));
  // Simulate a 10% chance that someone else just rented the same equipment
  if (Math.random() < 0.1) {
    throw new Error('Lock collision');
  }
  return true;
}

async function toggleEquipStatus(idx, newState) {
  const btn = event.currentTarget;
  const originalText = btn.innerHTML;

  // 1. Enter Loading State
  btn.innerHTML = `<svg style="animation: spin 1s linear infinite; width: 16px; height: 16px; flex-shrink: 0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.2)" stroke-width="3"></circle><path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" stroke-width="3"></path></svg> Validando...`;
  btn.style.opacity = '0.7';
  btn.style.pointerEvents = 'none';

  try {
    // 2. Wait for Cloud Lock validation
    await verifyAssetLock(equipos[idx].id);

    // 3. If lock acquired, proceed with update
    equipos[idx].estado = newState;

    // Update local cache to persist change
    // Note: We use saveItemsToDB(window.equipos) to sync full state since we just mutated memory
    await saveItemsToDB(window.equipos);

    // 4. Update UI
    const activeTab = document.querySelector('#catChips .chip.active').dataset.cat;
    renderEquipos(activeTab);
    openEquipDetail(idx); // re-render modal
    showToast(`Estado actualizado a ${newState}`);

  } catch (err) {
    // Lock failed! Someone else took it
    showToast('?? Equipo No Disponible: Modificado por otro usuario en la red.', 5000);
    // Reset button
    btn.innerHTML = originalText;
    btn.style.opacity = '1';
    btn.style.pointerEvents = 'auto';
  }
}

renderEquipos('Todos');
renderDashboardCharts(); // Initial render

// === INVENTORY SEARCH ===
async function searchInventory(query) {
  const q = query.toLowerCase().trim();
  const activeTabChip = document.querySelector('#catChips .chip.active');
  const activeTab = activeTabChip ? activeTabChip.dataset.cat : 'Todos';

  // Use cached memory array instead of querying IndexedDB on every keystroke
  let localData = window.equipos;
  if (!localData || localData.length === 0) {
    try {
      localData = await getAllItemsFromDB();
      window.equipos = localData;
    } catch (e) { }
  }

  const baseData = activeTab === 'Todos' ? localData : localData.filter(eq => eq.cat === activeTab);

  if (q.length < 2) {
    currentFilteredEquipos = baseData;
  } else {
    currentFilteredEquipos = baseData.filter(e =>
      (e.id && e.id.toLowerCase().includes(q)) ||
      (e.nombre && e.nombre.toLowerCase().includes(q)) ||
      (e.descripcion && e.descripcion.toLowerCase().includes(q)) ||
      (e.serie && e.serie.toLowerCase().includes(q)) ||
      (e.marca && e.marca.toLowerCase().includes(q)) ||
      (e.cat && e.cat.toLowerCase().includes(q)) ||
      (e.qr && e.qr.toLowerCase().includes(q))
    );

    // Auto-open if query is an EXACT match to an ID or QR
    const exactMatch = currentFilteredEquipos.find(e => e.id.toLowerCase() === q || (e.qr && e.qr.toLowerCase() === q));
    if (exactMatch) {
      openEquipDetail(equipos.indexOf(exactMatch));
    }
  }

  // Update count
  const countEl = document.getElementById('invResultsCount');
  if (countEl) countEl.innerHTML = `${currentFilteredEquipos.length} Artículos`;

  // Reset scroll and re-render
  if (vsViewport && vsInner) {
    vsViewport.scrollTop = 0;
    vsInner.style.height = `${currentFilteredEquipos.length * ROW_HEIGHT}px`;
    renderVirtualItems();
  }

  const container = document.getElementById('invSearchResults');
  if (container) {
    container.style.display = 'none';
  }
}

function selectInventoryAsset(idx) {
  document.getElementById('invSearchInput').value = '';
  document.getElementById('invSearchResults').style.display = 'none';
  openEquipDetail(idx);
}


document.getElementById('catChips').addEventListener('click', e => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  chip.classList.add('active');
  renderEquipos(chip.dataset.cat);
});

// === DYNAMIC EVENT DETAIL ===
function renderChecklist(catName, items, doneLabel, pendLabel, responsible) {
  let html = `<div class="cat-header-wrap" style="display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid var(--border); margin-top: 24px; padding-bottom: 8px; margin-bottom: 12px;">
                <h2 class="section-title" style="margin:0">${sanitize(catName)}</h2>
                <div style="text-align: right;">
                  <span style="font-size: 11px; color: var(--text2); display: block; text-transform: uppercase; letter-spacing: 0.5px;">Encargado de Área</span>
                  <span style="font-size: 13px; font-weight: 600; color: var(--gold);">${sanitize(responsible) || 'Por asignar'}</span>
                </div>
              </div>`;

  html += items.map(group => {
    const isFull = group.doneCount >= group.qty;
    const isPart = group.doneCount > 0 && group.doneCount < group.qty;

    let cls = 'pend';
    let label = pendLabel || 'Incompleto';
    let icon = svgIcons.close;

    if (isFull) {
      cls = 'done';
      label = doneLabel || 'Completo';
      icon = svgIcons.check;
    } else if (isPart) {
      cls = 'part';
      label = 'Parcial';
      icon = svgIcons.minus;
    }

    // Show real IDs scanned for this model
    const scannedList = group.scannedIds && group.scannedIds.length > 0 ?
      `<div class="scan-time">Escaneados: ${group.scannedIds.join(', ')}</div>` :
      `<div class="scan-time pend-txt">Sin escanear aún</div>`;

    return `<div class="check-item">
      <div class="check-icon ${cls}">${icon}</div>
      <div class="check-info">
        <div class="check-name" style="font-weight:700">${sanitize(group.model)} <span style="font-weight:400; opacity:0.7">(${sanitize(group.marca)})</span></div>
        <div class="check-id">${sanitize(group.name)} • <span style="color:var(--gold)">${group.doneCount}/${group.qty}</span> ${label}</div>
        ${scannedList}
      </div>
    </div>`;
  }).join('');
  return html;
}
function openEvent(key) {
  currentOpenEventKey = key;
  const ev = checkData[key];
  document.getElementById('detailTitle').textContent = ev.title;
  document.getElementById('detailClient').textContent = ev.client;
  document.getElementById('detailDate').textContent = ev.date;
  const allItems = Object.values(ev.categories).flat();
  const total = allItems.reduce((acc, g) => acc + (g.qty || 0), 0);
  const done = allItems.reduce((acc, g) => acc + (g.doneCount || 0), 0);

  // Si estamos devolviendo, 'done' es la cantidad de equipos que AÚN ESTÁN FUERA.
  // Por lo tanto, pend (pendientes por devolver) es 'done'.
  // Los devueltos reales son (total - done)
  const pend = ev.fin ? done : (total - done);
  let pct = 0;

  if (total > 0) {
    if (ev.fin) {
      pct = Math.round(((total - done) / total) * 100);
    } else {
      pct = Math.round((done / total) * 100);
    }
  }

  document.getElementById('circFill').setAttribute('stroke-dasharray', `${pct}, 100`);

  if (ev.fin) {
    document.getElementById('circText').textContent = `${total - done}/${total}`;
  } else {
    document.getElementById('circText').textContent = `${done}/${total}`;
  }

  document.getElementById('circText').style.color = pct > 50 ? 'var(--green)' : 'var(--orange)';
  document.getElementById('circFill').setAttribute('stroke', pct > 50 ? '#7bc67e' : '#d4a843');

  if (ev.fin) {
    document.getElementById('detailPend').textContent = pend > 0 ? `? ${pend} equipo${pend !== 1 ? 's' : ''} sin devolver` : '? Todo devuelto';
    document.getElementById('detailPend').style.color = pend > 0 ? 'var(--red)' : 'var(--green)';
  } else {
    document.getElementById('detailPend').textContent = `${pend} equipo${pend !== 1 ? 's' : ''} pendiente${pend !== 1 ? 's' : ''}`;
    document.getElementById('detailPend').style.color = 'var(--orange)';
  }

  let html = '';

  const isFullyLoaded = !ev.fin && total > 0 && done === total;
  const isFullyReturned = ev.fin && total > 0 && done === 0;

  if (isFullyLoaded || isFullyReturned) {
    const msg = isFullyReturned ? '¡DEVOLUCIÓN COMPLETA, FINALIZADO!' : '¡CARGA LISTA, EVENTO EN CURSO!';
    html += `
      <div style="background: rgba(37, 170, 67, 0.15); border: 1px solid var(--green); color: var(--green); padding: 12px; border-radius: 8px; text-align: center; margin-bottom: 24px; font-weight: 700; display: flex; align-items: center; justify-content: center; gap: 8px;">
        <span class="success-banner-icon">${svgIcons.check}</span>
        <span style="letter-spacing: 0.5px;">${msg}</span>
      </div>
    `;
  }

  const doneLabel = ev.fin ? 'Devuelto' : 'Cargado';
  const pendLabel = ev.fin ? 'Sin devolver' : 'Pendiente';
  const res = ev.responsibles || {};

  for (const [cat, items] of Object.entries(ev.categories)) {
    const areaResp = res[cat] || (cat === 'Bodega' ? res.Bodega : 'Por asignar');
    html += renderChecklist(cat, items, doneLabel, pendLabel, areaResp);
  }

  document.getElementById('eventChecklistArea').innerHTML = html;

  if (isFullyReturned) {
    const archiveBtn = `
      <div style="margin-top: 32px; padding: 0 4px;">
        <button class="submit-btn" onclick="finishAndArchiveEvent('${key}')" 
                style="background:rgba(216,30,30,0.1); color:var(--red); border:1px solid rgba(216,30,30,0.2); width:100%; font-weight:700;">
          TERMINAR Y ARCHIVAR EVENTO
        </button>
      </div>
    `;
    document.getElementById('eventChecklistArea').innerHTML += archiveBtn;
  }

  showPage('pg-event-detail');
}

function startEventScan(key) {
  const ev = checkData[key];
  if (!ev) return;

  // 1. Navegar a la página de escaneo
  showPage('pg-scan');

  // 2. Seleccionar el evento en el dropdown
  const select = document.getElementById('scanEventSelect');
  if (select) {
    select.value = key;
  }

  // 3. Configurar el tipo de movimiento (Salida/Entrada)
  // Si ev.fin es true, es una devolución (Entrada)
  const btnType = ev.fin ? document.querySelector('.toggle-btn.ent') : document.querySelector('.toggle-btn.sal');
  if (btnType) {
    setTipo(btnType, ev.fin ? 'Entrada' : 'Salida');
  }

  showToast(`Escanear para: ${ev.title}`);
}

// === PDF TICKET GENERATION ===
function generateEventPDF() {
  if (!currentOpenEventKey) return;
  const ev = checkData[currentOpenEventKey];
  if (!ev) return;

  showToast('Generando Ticket PDF...');

  let itemsHtml = '';
  const res = ev.responsibles || {};

  for (const [cat, items] of Object.entries(ev.categories)) {
    const areaResp = res[cat] || (cat === 'Bodega' ? res.Bodega : 'Por asignar');

    itemsHtml += `
      <div style="margin-top: 24px; page-break-inside: avoid;">
        <div style="display: flex; justify-content: space-between; border-bottom: 2px solid #eaebef; padding-bottom: 4px; margin-bottom: 12px;">
          <h3 style="color: #1c1c24; margin: 0; font-size: 16px;">${cat}</h3>
          <span style="font-size: 11px; color: #525364; font-weight: 600;">Encargado: ${areaResp}</span>
        </div>
        <table style="width: 100%; border-collapse: collapse; font-size: 12px; table-layout: fixed;">
          <thead>
            <tr style="text-align: left; background: #eaebef; color: #525364;">
              <th style="padding: 8px; width: 35%;">ID / Activo</th>
              <th style="padding: 8px; width: 30%;">Equipo</th>
              <th style="padding: 8px; width: 15%;">Estado</th>
              <th style="padding: 8px; width: 20%;">Hora y Responsable</th>
            </tr>
          </thead>
          <tbody>
    `;
    items.forEach(it => {
      const qtyText = `${it.doneCount} / ${it.qty}`;
      const isDone = it.doneCount === it.qty;
      const isPartial = it.doneCount > 0 && it.doneCount < it.qty;

      const statusColor = isDone ? '#25aa43' : (isPartial ? '#d4a843' : '#d81e1e');
      const statusLabel = isDone ? (ev.fin ? 'Devuelto' : 'Cargado') : (isPartial ? 'Parcial' : 'Pendiente');

      const idsReales = it.scannedIds && it.scannedIds.length > 0 ? it.scannedIds.join(', ') : 'Sin asignar';
      const scanInfo = it.doneCount > 0 ? `Cant: ${qtyText}` : '-';

      itemsHtml += `
        <tr style="border-bottom: 1px solid #eaebef; page-break-inside: avoid;">
          <td style="padding: 8px; font-weight: 600; word-wrap: break-word; overflow-wrap: break-word;">${idsReales}</td>
          <td style="padding: 8px; word-wrap: break-word;">${it.name} (${qtyText})</td>
          <td style="padding: 8px; color: ${statusColor}; font-weight: 600;">${statusLabel}</td>
          <td style="padding: 8px; color: #525364;">${scanInfo}</td>
        </tr>
      `;
    });
    itemsHtml += `</tbody></table></div>`;
  }

  const allItems = Object.values(ev.categories).flat();
  const total = allItems.reduce((acc, g) => acc + (g.qty || 0), 0);
  const done = allItems.reduce((acc, g) => acc + (g.doneCount || 0), 0);
  const d = new Date();

  const printedAt = d.toLocaleString('es-MX');

  const finalHtml = `
    <div style="background: #ffffff; width: 720px; box-sizing: border-box; overflow: hidden;">
      <div style="color: #1c1c24; padding: 20px 30px; font-family: 'Inter', sans-serif;">


      <div style="display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 4px solid #d4a843; padding-bottom: 16px; margin-bottom: 32px;">
        <div>
          <h1 style="margin: 0; font-size: 32px; color: #1c1c24;">RAP Ticket de Inventario</h1>
          <p style="margin: 4px 0 0 0; color: #525364; font-size: 14px;">Comprobante de Movimientos Oficiales</p>
        </div>
        <div style="text-align: right;">
          <h2 style="margin: 0; font-size: 20px; color: #1c1c24;">${ev.title}</h2>
          <p style="margin: 4px 0 0 0; font-weight: 600; color: #d4a843;">Folio: ${currentOpenEventKey.toUpperCase()}</p>
        </div>
      </div>
      
      <div style="display: flex; justify-content: space-between; background: #eaebef; padding: 16px; border-radius: 8px; margin-bottom: 24px;">
        <div>
          <p style="margin: 0 0 4px 0; font-size: 12px; color: #525364;">Cliente/Empresa</p>
          <p style="margin: 0; font-weight: 600; font-size: 14px;">${ev.client}</p>
        </div>
        <div>
          <p style="margin: 0 0 4px 0; font-size: 12px; color: #525364;">Fechas</p>
          <p style="margin: 0; font-weight: 600; font-size: 14px;">${ev.date}</p>
        </div>
        <div>
          <p style="margin: 0 0 4px 0; font-size: 12px; color: #525364;">Estado General</p>
          <p style="margin: 0; font-weight: 600; font-size: 14px; color: ${done === total ? '#25aa43' : '#d81e1e'}">${done}/${total} Procesados</p>
        </div>
        <div style="text-align: right;">
          <p style="margin: 0 0 4px 0; font-size: 12px; color: #525364;">Clasificación</p>
          <p style="margin: 0; font-weight: 600; font-size: 14px;">${ev.fin ? 'Devolución' : 'Salida de Bodega'}</p>
        </div>
      </div>
      
      <h2 style="font-size: 18px; margin-bottom: 0;">Resumen del Equipo</h2>
      ${itemsHtml}
      
      <div style="margin-top: 48px; display: flex; justify-content: space-between; text-align: center; page-break-inside: avoid;">
        <div style="width: 250px;">
          <div style="border-bottom: 1px solid #1c1c24; height: 40px; margin-bottom: 8px;"></div>
          <p style="margin: 0; font-size: 12px; font-weight: 600;">Firma de Conformidad (Cliente)</p>
        </div>
        <div style="width: 250px;">
          <div style="border-bottom: 1px solid #1c1c24; height: 40px; margin-bottom: 8px;"></div>
          <p style="margin: 0; font-size: 12px; font-weight: 600;">Encargado de RAP</p>
        </div>
      </div>
      
      <div style="margin-top: 32px; font-size: 10px; color: #8e8e99; text-align: center; page-break-inside: avoid;">
        Generado por la plataforma RAP el ${printedAt}. Documento para uso interno y cliente.
      </div>
      </div>
    </div>
  `;

  const opt = {
    margin: [0.4, 0.4, 0.4, 0.4],
    filename: `TICKET_RAP_${ev.title.replace(/\s+/g, '_')}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: {
      scale: 2,
      useCORS: true,
      letterRendering: true,
      scrollY: 0,
    },
    jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' },
    pagebreak: { mode: ['css', 'legacy'], avoid: 'tr' }
  };

  // Switch to .from(finalHtml) - the string method is more reliable for hidden rendering
  html2pdf().set(opt).from(finalHtml).output('bloburl').then(url => {
    const newWin = window.open(url, '_blank');
    if (!newWin || newWin.closed || typeof newWin.closed == 'undefined') {
      showToast('?? Bloqueador de ventanas detectado. Ticket generado listo para descarga.');
      // Auto-fallback to download if opening tab is blocked
      const link = document.createElement('a');
      link.href = url;
      link.download = opt.filename;
      link.click();
    } else {
      showToast('? Ticket generado — Abre la nueva pestaña para Imprimir');
    }
  }).catch(err => {
    console.error('PDF Error:', err);
    showToast('Error al generar PDF');
  });
}

// === EVENT TABS ===
function switchEvTab(tab) {
  document.querySelectorAll('.ev-tab').forEach(t => t.classList.remove('active'));
  document.querySelector(`.ev-tab[data-tab="${tab}"]`).classList.add('active');
  document.getElementById('evGrupoSalida').style.display = tab === 'salida' ? 'block' : 'none';
  document.getElementById('evGrupoCurso').style.display = tab === 'curso' ? 'block' : 'none';
  document.getElementById('evGrupoFin').style.display = tab === 'fin' ? 'block' : 'none';
}

// === HISTORIAL (Antes Movimientos) ===
function switchHistTab(tab) {
  document.querySelectorAll('.ev-tab[data-htab]').forEach(t => t.classList.remove('active'));
  document.querySelector(`.ev-tab[data-htab="${tab}"]`).classList.add('active');
  document.getElementById('histContentFinalizados').style.display = tab === 'finalizados' ? 'block' : 'none';
  document.getElementById('histContentActividad').style.display = tab === 'actividad' ? 'block' : 'none';

  if (tab === 'finalizados') renderArchivedEvents();
  else renderDetailedActivity();
}

function renderArchivedEvents() {
  const movList = document.getElementById('movList');
  if (!movList) return;

  const pastEvents = Object.entries(archivedEvents)
    .sort((a, b) => new Date(b[1].archivedAt || b[1].date) - new Date(a[1].archivedAt || a[1].date));

  if (pastEvents.length === 0) {
    movList.innerHTML = '<p style="text-align:center; color:var(--text2); font-style:italic; padding: 24px;">No hay eventos archivados en el historial.</p>';
  } else {
    movList.innerHTML = pastEvents.map(([key, ev]) => {
      return `<div class="mov-item" style="display: flex; flex-direction: column; gap: 8px; align-items: stretch;" onclick="openArchivedEvent('${key}')">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div style="font-weight: 600; font-size: 14px;">${sanitize(ev.title)}</div>
          <div class="ev-badge green-b">Archivado</div>
        </div>
        <div style="font-size: 13px; color: var(--text2);">
          <span style="color: var(--gold);">${sanitize(ev.client)}</span> • Concluido: ${new Date(ev.archivedAt || ev.date).toLocaleDateString('es-MX')}
        </div>
      </div>`;
    }).join('');
  }
}

function renderDetailedActivity() {
  const actList = document.getElementById('actividadList');
  if (!actList) return;

  if (!movimientos || movimientos.length === 0) {
    actList.innerHTML = '<p style="text-align:center; color:var(--text2); font-style:italic; padding: 24px;">No hay registros de actividad recientes.</p>';
  } else {
    actList.innerHTML = movimientos.map(m => {
      const isSalida = m.tipo === 'Salida' || m.tipo === 'Evento Eliminado';
      const stCls = isSalida ? 'evento' : 'disp';
      const color = isSalida ? 'var(--orange)' : 'var(--green)';
      return `
        <div class="mov-item">
          <div class="mov-info">
            <span class="mov-equip">${sanitize(m.equip)} <span style="font-size:12px;color:var(--text2);font-weight:normal;">(${sanitize(m.id)})</span></span>
            <span class="mov-event">${sanitize(m.evento)} • Resp: ${sanitize(m.resp) || 'Sistema'}</span>
            <span class="mov-date">${m.time}</span>
          </div>
          <span class="ep-status ${stCls}" style="color:${color}; border-color:${color};">${m.tipo}</span>
        </div>`;
    }).join('');
  }
}

function renderMovimientos() {
  renderArchivedEvents();
  renderDetailedActivity();
}

function openArchivedEvent(key) {
  const ev = archivedEvents[key];
  if (!ev) return;
  // For archived events, we just show a toast or a simple summary for now, 
  // since they are basically data snapshots.
  showToast(`Evento: ${ev.title} - Todo el equipo fue devuelto correctamente.`);
}

renderMovimientos();

// === SCANNER ===
function setTipo(btn, tipo) {
  document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

function doScan() {
  const code = (document.getElementById('qrSearchInput').value || '').trim();
  const eventKey = document.getElementById('scanEventSelect').value;
  const isEntrada = document.querySelector('.toggle-btn.ent').classList.contains('active');

  if (!code) {
    showToast('Por favor ingresa o busca un activo');
    return;
  }

  // Si hay un paréntesis con el ID, extraer solo el ID (ej: "Bumper (V000001)" -> "V000001")
  let targetId = code;
  const match = code.match(/\(([^)]+)\)/);
  if (match) targetId = match[1];

  const codeUpper = targetId.toUpperCase();
  const found = equipos.find(e => e.id.toUpperCase() === codeUpper || (e.qr && e.qr.toUpperCase() === codeUpper));

  if (!found) {
    showToast('Activo no encontrado: ' + codeUpper);
    return;
  }

  // VALIDACIÓN DE SEGURIDAD CONTRA DOBLE ESCANEO
  if (!isEntrada && found.estado === 'En Evento') {
    showToast(`?? Operación inválida: El equipo ${found.id} ya se encuentra fuera de bodega.`);
    return;
  }
  if (isEntrada && found.estado === 'Disponible') {
    showToast(`?? Operación inválida: El equipo ${found.id} ya se encuentra en bodega.`);
    return;
  }

  // Registrar movimiento

  const type = isEntrada ? 'Entrada' : 'Salida';
  const eventName = eventKey && checkData[eventKey] ? checkData[eventKey].title : 'Escaneo Manual';
  const user = getCurrentUser();

  // Si hay un evento seleccionado, intentar marcar como "done" en el evento
  if (eventKey && checkData[eventKey]) {
    const ev = checkData[eventKey];
    const modelToFind = found.descripcion;
    let markedInEvent = false;

    for (const items of Object.values(ev.categories)) {
      const group = items.find(g => g.model === modelToFind && g.doneCount < g.qty);
      if (group) {
        if (!group.scannedIds.includes(found.id)) {
          group.doneCount++;
          group.scannedIds.push(found.id);
          markedInEvent = true;
        }
        break;
      }
    }
    saveEvents(checkData);
  }

  // Actualizar estado global y persistir
  found.estado = isEntrada ? 'Disponible' : 'En Evento';
  saveItemsToDB(window.equipos);

  // Registrar en historial
  const timeStr = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  movimientos.unshift({
    equip: found.nombre,
    id: found.id,
    evento: eventName,
    tipo: type,
    time: 'Hoy ' + timeStr,
    resp: user ? user.username : 'Sistema'
  });
  saveMovimientos(movimientos);

  // UI Feedback
  document.getElementById('qrSearchInput').value = '';
  document.getElementById('searchResults').innerHTML = '';
  if (typeof renderMovimientos === 'function') renderMovimientos();

  showToast(`? ${type} registrada: ${found.id}`);

  // Alert modal demo logic (opcional, mantener si el usuario gusta de la simulación de alertas)
  if (Math.random() > 0.9) {
    document.getElementById('alertModal').classList.add('show');
    addNotif(`Alerta de equipo ${found.id}: requiere revisión`);
  }
}

function doEventScan() {
  const inputEl = document.getElementById('eventScanInput');
  if (!inputEl) return;
  const code = (inputEl.value || '').trim();
  if (!code) return;

  // Extraer ID si tiene ()
  let targetId = code;
  const match = code.match(/\(([^)]+)\)/);
  if (match) targetId = match[1];

  // Procesarlo a través del motor principal
  processScanResult(targetId);

  // Limpiar el campo
  inputEl.value = '';

  // Re-enfocar el campo para escaneos continuos
  inputEl.focus();
}

// === DEVOLUCIÓN GLOBAL ===
function handleGlobalReturnScan(code) {
  if (!code) return;
  const inputEl = document.getElementById('globalReturnScanInput');

  let targetId = code.trim();
  const match = targetId.match(/\(([^)]+)\)/);
  if (match) targetId = match[1];
  const codeUpper = targetId.toUpperCase();

  // Buscar el equipo
  const masterEquip = equipos.find(e => e.id.toUpperCase() === codeUpper || (e.qr && e.qr.toUpperCase() === codeUpper));
  if (!masterEquip) {
    showToast('Equipo no encontrado: ' + codeUpper);
    if (inputEl) inputEl.value = '';
    return;
  }

  // Buscar en qué evento está este equipo (dentro de eventos en devolución o en curso)
  let foundKey = null;
  let foundGroup = null;

  for (const [key, ev] of Object.entries(checkData)) {
    // Solo buscamos en eventos que no estén totalmente devueltos
    for (const items of Object.values(ev.categories)) {
      const group = items.find(g => g.scannedIds.includes(masterEquip.id));
      if (group) {
        foundKey = key;
        foundGroup = group;
        break;
      }
    }
    if (foundKey) break;
  }

  if (foundKey && foundGroup) {
    const ev = checkData[foundKey];
    const user = getCurrentUser();

    // Procesar retorno
    foundGroup.doneCount = Math.max(0, foundGroup.doneCount - 1);
    foundGroup.scannedIds = foundGroup.scannedIds.filter(id => id !== masterEquip.id);
    ev.fin = true; // Asegurar que esté en pestaña de devolución
    masterEquip.estado = 'Disponible';

    // Registrar en movimientos
    const timeStr = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    movimientos.unshift({
      equip: masterEquip.nombre, id: masterEquip.id, evento: ev.title,
      tipo: 'Entrada', time: 'Hoy ' + timeStr, resp: user ? user.username : 'Sistema'
    });

    saveMovimientos(movimientos);
    saveEvents(checkData);
    saveItemsToDB(window.equipos);

    showToast(`✓ REGRESO: ${masterEquip.id} devuelto al evento "${ev.title}"`);
    renderEventCards();
    if (typeof renderMovimientos === 'function') renderMovimientos();
  } else {
    showToast(`⚠️ El equipo ${masterEquip.id} no parece estar asignado a ningún evento activo.`);
  }

  if (inputEl) {
    inputEl.value = '';
    inputEl.focus();
  }
}

function closeModal() {
  document.getElementById('alertModal').classList.remove('show');
}

// === ASSET SEARCH ===
function searchAsset(query) {
  const container = document.getElementById('searchResults');
  if (!query || query.length < 2) { container.innerHTML = ''; return; }
  const q = query.toLowerCase();
  const results = equipos.filter(e =>
    (e.id && e.id.toLowerCase().includes(q)) ||
    (e.nombre && e.nombre.toLowerCase().includes(q)) ||
    (e.descripcion && e.descripcion.toLowerCase().includes(q)) ||
    (e.serie && e.serie.toLowerCase().includes(q)) ||
    (e.marca && e.marca.toLowerCase().includes(q)) ||
    (e.cat && e.cat.toLowerCase().includes(q)) ||
    (e.qr && e.qr.toLowerCase().includes(q))
  ).slice(0, 5);
  container.innerHTML = results.map(e => {
    const stCls = e.estado === 'Disponible' ? 'disp' : e.estado === 'En Evento' ? 'evento' : 'mant';
    const idx = equipos.indexOf(e);
    return `<div class="search-result" onclick="openEquipDetail(${idx})">
      <span class="sr-name">${e.nombre}</span><span class="sr-id">${e.id}</span>
      <span class="sr-status ${stCls}">${e.estado}</span>
    </div>`;
  }).join('');
  if (!results.length) container.innerHTML = '<div class="search-result"><span class="sr-name" style="color:var(--text2)">No se encontró el activo</span></div>';
}
function selectAsset(id, name) {
  document.getElementById('qrSearchInput').value = name + ' (' + id + ')';
  document.getElementById('searchResults').innerHTML = '';
  showToast('Activo seleccionado: ' + id);
}

// === TOAST ===
function showToast(msg) {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}




// === DRIVE ===
function showDriveModal() {
  document.getElementById('driveModal').classList.add('show');
}
function closeDriveModal() {
  document.getElementById('driveModal').classList.remove('show');
}
function selectDriveFile(el) {
  document.querySelectorAll('.drive-file').forEach(f => f.classList.remove('selected'));
  el.classList.add('selected');
}
function importDrive() {
  closeDriveModal();
  showToast('Datos importados desde Drive');
}

// === SETTINGS & SUPPORT ===
function renderRentalStats() {
  const area = document.getElementById('rentalStatsArea');
  if (!area) return;

  const categories = [...new Set(equipos.map(e => e.cat))];
  const stats = categories.map(cat => {
    const deptEquipos = equipos.filter(e => e.cat === cat);
    const rented = deptEquipos.filter(e => e.estado === 'En Evento').length;
    return {
      cat,
      rented,
      total: deptEquipos.length,
      pct: Math.round((rented / deptEquipos.length) * 100) || 0
    };
  }).filter(s => s.rented > 0);

  if (stats.length === 0) {
    area.innerHTML = '<p style="color:var(--text2); font-size:12px; padding:10px">No hay equipos rentados actualmente.</p>';
    return;
  }

  area.innerHTML = stats.map(s => {
    const iconKey = s.cat === 'Audio' ? 'audio' : s.cat === 'Iluminación' ? 'ilu' : s.cat === 'Video' ? 'video' : 'est';
    return `
      <div class="rental-stat-card">
        <div class="rsc-icon ${iconKey}">
          ${svgIcons[iconKey]}
        </div>
        <div class="rsc-info">
          <div class="rsc-label">Departamento</div>
          <div class="rsc-name">${s.cat}</div>
          <div class="rsc-meta">
            <span class="rsc-count">${s.rented}/${s.total} items</span>
            <span class="rsc-pct">${s.pct}% en uso</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// === RESUMEN GENERAL PAGE ===
function openResumen() {
  renderResumenStats();
  renderResumenEventos();
  renderResumenEquipo();
  renderResumenInventario();
  showPage('pg-resumen');
}

function switchResumenTab(tab) {
  document.querySelectorAll('.resumen-tab').forEach(t => t.classList.remove('active'));
  document.querySelector(`.resumen-tab[data-rtab="${tab}"]`).classList.add('active');
  document.getElementById('resumenTabEventos').style.display = tab === 'eventos' ? 'block' : 'none';
  document.getElementById('resumenTabEquipo').style.display = tab === 'equipo' ? 'block' : 'none';
  document.getElementById('resumenTabInventario').style.display = tab === 'inventario' ? 'block' : 'none';
}

function renderResumenStats() {
  const totalEquipos = equipos.length;
  const disponibles = equipos.filter(e => e.estado === 'Disponible').length;
  const enEvento = equipos.filter(e => e.estado === 'En Evento').length;
  const mantenimiento = equipos.filter(e => e.estado === 'Mantenimiento').length;
  const activos = Object.values(checkData).filter(ev => !ev.fin).length;

  document.getElementById('summaryStatsRow').innerHTML = `
    <div class="summary-stat">
      <span class="summary-stat-val gold">${totalEquipos}</span>
      <span class="summary-stat-label">Total Equipos</span>
    </div>
    <div class="summary-stat">
      <span class="summary-stat-val green">${disponibles}</span>
      <span class="summary-stat-label">Disponibles</span>
    </div>
    <div class="summary-stat">
      <span class="summary-stat-val orange">${enEvento}</span>
      <span class="summary-stat-label">En Evento</span>
    </div>
    <div class="summary-stat">
      <span class="summary-stat-val red">${activos}</span>
      <span class="summary-stat-label">Eventos Activos</span>
    </div>
  `;
}

function renderResumenEventos() {
  let html = '<div class="resumen-grid">';
  for (const [key, ev] of Object.entries(checkData)) {
    const allItems = Object.values(ev.categories).flat();
    const total = allItems.length;
    const done = allItems.filter(i => i.done).length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    const statusLabel = ev.fin ? (done === total ? 'Regreso Completo' : 'Faltan Equipos') : (done > 0 ? 'En Curso' : 'Pendiente');
    const statusCls = ev.fin ? (done === total ? 'complete' : 'ret-pend') : (done > 0 ? 'active' : 'pending');

    let catChips = '';
    for (const [cat, items] of Object.entries(ev.categories)) {
      const catDone = items.filter(i => i.done).length;
      catChips += `<span class="ev-cat-chip">${cat}: <span class="cat-done">${catDone}/${items.length}</span></span>`;
    }

    html += `
      <div class="ev-summary-card" onclick="openEvent('${key}')">
        <div class="ev-summary-head">
          <span class="ev-summary-name">${ev.title}</span>
          <span class="ev-badge ${statusCls}">${statusLabel}</span>
        </div>
        <div class="ev-summary-meta">
          <span>
            <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.47 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm0-14c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>
            ${ev.client}
          </span>
          <span>
            <svg viewBox="0 0 24 24"><path d="M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z"/></svg>
            ${ev.date}
          </span>
        </div>
        <div class="progress-row">
          <div class="progress-bar"><div class="progress-fill${ev.fin && done === total ? ' complete-fill' : ''}" style="width:${pct}%"></div></div>
          <span class="progress-txt">${done}/${total}</span>
        </div>
        <div class="ev-summary-cats">${catChips}</div>
      </div>
    `;
  }
  html += '</div>';
  document.getElementById('resumenTabEventos').innerHTML = html;
}

function renderResumenEquipo() {
  const rentados = equipos.filter(e => e.estado === 'En Evento');
  if (rentados.length === 0) {
    document.getElementById('resumenTabEquipo').innerHTML = '<p style="color:var(--text2); font-size:13px; padding:16px">No hay equipos rentados actualmente.</p>';
    return;
  }

  let html = '<div class="resumen-grid">';
  rentados.forEach(e => {
    const idx = equipos.indexOf(e);
    html += `
      <div class="rented-equip-card" onclick="openEquipDetail(${idx})">
        <div class="equip-icon ${e.iconCls}">${svgIcons[e.iconCls]}</div>
        <div class="equip-info">
          <div class="equip-name">${e.nombre}</div>
          <div class="equip-id">${e.id} • ${e.cat}</div>
          <div class="rented-equip-event">?? ${e.ubicacion}</div>
        </div>
        <span class="equip-status evento">En Evento</span>
      </div>
    `;
  });
  html += '</div>';
  document.getElementById('resumenTabEquipo').innerHTML = html;
}

function renderResumenInventario() {
  const categories = [...new Set(equipos.map(e => e.cat))];
  let html = '<div class="resumen-grid">';
  categories.forEach(cat => {
    const catEquipos = equipos.filter(e => e.cat === cat);
    const disponibles = catEquipos.filter(e => e.estado === 'Disponible').length;
    const enEvento = catEquipos.filter(e => e.estado === 'En Evento').length;
    const mant = catEquipos.filter(e => e.estado === 'Mantenimiento').length;
    const total = catEquipos.length;
    const pctDisp = Math.round((disponibles / total) * 100);
    const pctEvento = Math.round((enEvento / total) * 100);
    const iconKey = cat === 'Audio' ? 'audio' : cat === 'Iluminación' ? 'ilu' : cat === 'Video' ? 'video' : 'est';
    const bgClass = cat === 'Audio' ? 'background:rgba(74,144,255,.12)' : cat === 'Iluminación' ? 'background:rgba(251,146,60,.12)' : cat === 'Video' ? 'background:rgba(167,139,250,.12)' : 'background:rgba(74,222,128,.12)';

    html += `
      <div class="inv-summary-card">
        <div class="inv-summary-icon" style="${bgClass}">${svgIcons[iconKey]}</div>
        <div class="inv-summary-info">
          <div class="inv-summary-name">${cat} <span style="color:var(--text2); font-weight:400; font-size:13px">(${total})</span></div>
          <div class="inv-summary-bar">
            <div class="inv-bar">
              <div style="display:flex; height:100%">
                <div class="inv-bar-fill disp" style="width:${pctDisp}%"></div>
                <div class="inv-bar-fill evento" style="width:${pctEvento}%"></div>
              </div>
            </div>
          </div>
          <div class="inv-summary-stats">
            <span class="inv-stat-item"><span class="inv-stat-dot disp"></span> ${disponibles} Disp.</span>
            <span class="inv-stat-item"><span class="inv-stat-dot evento"></span> ${enEvento} Evento</span>
            ${mant > 0 ? `<span class="inv-stat-item"><span class="inv-stat-dot mant"></span> ${mant} Mant.</span>` : ''}
          </div>
        </div>
      </div>
    `;
  });
  html += '</div>';
  document.getElementById('resumenTabInventario').innerHTML = html;
}

function showProfileModal() {
  document.getElementById('profileModal').classList.add('show');
}
function closeProfileModal() {
  document.getElementById('profileModal').classList.remove('show');
}
function openSupport() {
  showToast('Soporte: soporte@rap.mx');
}
function doLogout() {
  sessionStorage.removeItem('rap_current_user');
  localStorage.removeItem('rap_persistent_user');
  document.getElementById('authScreen').style.display = 'flex';
  setTimeout(() => {
    document.getElementById('authScreen').classList.remove('hidden');
    showPage('pg-dashboard');
  }, 50);
}

// === USB BARCODE SCANNER DETECTION ===
let scanBuffer = '';
let scanTimeout = null;
const SCAN_THRESHOLD = 50;
let lastKeyTime = 0;

document.addEventListener('keypress', function (e) {
  const tag = e.target.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

  const now = Date.now();
  const timeDiff = now - lastKeyTime;

  if (e.key === 'Enter' && scanBuffer.length > 2) {
    e.preventDefault();
    processScanResult(scanBuffer.trim());
    scanBuffer = '';
    lastKeyTime = 0;
    return;
  }

  if (timeDiff < SCAN_THRESHOLD || scanBuffer.length === 0) {
    scanBuffer += e.key;
    const indicator = document.querySelector('.scanner-indicator');
    if (indicator) {
      indicator.classList.add('scanning');
      indicator.querySelector('span').textContent = 'Recibiendo datos...';
    }
  } else {
    scanBuffer = e.key;
  }
  lastKeyTime = now;

  clearTimeout(scanTimeout);
  scanTimeout = setTimeout(() => {
    if (scanBuffer.length > 2) {
      processScanResult(scanBuffer.trim());
    }
    scanBuffer = '';
    const indicator = document.querySelector('.scanner-indicator');
    if (indicator) {
      indicator.classList.remove('scanning');
      indicator.querySelector('span').textContent = 'Escáner USB listo — escanea un código de barras/QR';
    }
  }, 500);
});

function processScanResult(code) {
  const indicator = document.querySelector('.scanner-indicator');
  if (indicator) {
    indicator.classList.remove('scanning');
    indicator.querySelector('span').textContent = 'Escáner USB listo — escanea un código de barras/QR';
  }

  const codeUpper = code.toUpperCase();

  // Búsqueda robusta del equipo (por ID, QR o coincidencia parcial)
  const masterEquip = equipos.find(e =>
    e.id.toUpperCase() === codeUpper ||
    (e.qr && e.qr.toUpperCase() === codeUpper) ||
    e.id.toUpperCase().includes(codeUpper)
  );

  if (!masterEquip) {
    showToast('Código escaneado: ' + code + ' — No encontrado');
    return;
  }

  const idx = equipos.indexOf(masterEquip);

  // Registro en Last Scanned UI
  const lastEl = document.getElementById('lastScanned');
  const lastVal = document.getElementById('lastScannedValue');
  if (lastEl && lastVal) {
    lastEl.style.display = 'flex';
    lastVal.textContent = code;
  }

  // Si estamos en el detalle de evento, procesarlo internamente
  if (document.getElementById('pg-event-detail').classList.contains('active') && currentOpenEventKey) {
    const ev = checkData[currentOpenEventKey];
    if (ev) {
      const modelToFind = (masterEquip.descripcion || '').trim().toLowerCase();
      let foundInEvent = false;

      // Buscar si este ID ya estÃ¡ en alguna categorÃ­a de este evento (REGRESO)
      let checkinGroup = null;
      let checkoutGroup = null;

      for (const items of Object.values(ev.categories)) {
        const existing = items.find(g => g.scannedIds.includes(masterEquip.id));
        if (existing) {
          checkinGroup = existing;
          break;
        }
        if (!checkoutGroup) {
          checkoutGroup = items.find(g => (g.model || '').trim().toLowerCase() === modelToFind && g.doneCount < g.qty);
        }
      }

      const user = getCurrentUser();

      if (checkinGroup) {
        // --- LÓGICA DE DEVOLUCIÓN (RESTAR) ---
        checkinGroup.doneCount = Math.max(0, checkinGroup.doneCount - 1);
        checkinGroup.scannedIds = checkinGroup.scannedIds.filter(id => id !== masterEquip.id);
        ev.fin = true;
        masterEquip.estado = 'Disponible';

        movimientos.unshift({
          equip: masterEquip.nombre, id: masterEquip.id, evento: ev.title,
          tipo: 'Entrada', time: 'Justo ahora', resp: user ? user.username : 'Sistema'
        });
        saveMovimientos(movimientos);
        saveEvents(checkData);
        saveItemsToDB(window.equipos);
        syncInventoryToIndexedDB(); // Re-trigger sync attempt to maintain consistency
        foundInEvent = true;
        showToast(`✓ REGRESO detectado: ${masterEquip.id} devuelto.`);
      } else if (checkoutGroup) {
        // --- LÓGICA DE SALIDA (SUMAR) ---
        checkoutGroup.doneCount++;
        checkoutGroup.scannedIds.push(masterEquip.id);
        masterEquip.estado = 'En Evento';

        movimientos.unshift({
          equip: masterEquip.nombre, id: masterEquip.id, evento: ev.title,
          tipo: 'Salida', time: 'Justo ahora', resp: user ? user.username : 'Sistema'
        });
        saveMovimientos(movimientos);
        saveEvents(checkData);
        saveItemsToDB(window.equipos);
        syncInventoryToIndexedDB(); // Re-trigger sync attempt to maintain consistency
        foundInEvent = true;
        showToast(`✓ SALIDA detectada: ${masterEquip.id} cargado.`);
      }

      if (foundInEvent) {
        openEvent(currentOpenEventKey);
        if (typeof renderMovimientos === 'function') renderMovimientos();
        return;
      }

      if (!foundInEvent) {
        showToast(`⚠️ El equipo ${masterEquip.id} no puede procesarse: ya se completó o no se solicitó.`);
        return;
      }
    }
  }

  // Modos fuera del evento:
  showToast('Equipo encontrado: ' + masterEquip.nombre + ' (' + masterEquip.id + ')');

  if (document.getElementById('pg-scan').classList.contains('active')) {
    // Auto-register in Quick Scan
    document.getElementById('qrSearchInput').value = masterEquip.id;
    doScan();
  } else if (!document.getElementById('pg-event-detail').classList.contains('active')) {
    // Auto-open in inventory or search pages
    openEquipDetail(idx);
  }
}

// Auto-fill remembered user
document.addEventListener('DOMContentLoaded', () => {
  renderScanEventOptions(); // Carga inicial de eventos en escaneo
  const savedUser = localStorage.getItem('rap_saved_user');
  if (savedUser) {
    const userInput = document.getElementById('loginUser');
    const rememberChk = document.getElementById('loginRemember');
    if (userInput) userInput.value = savedUser;
    if (rememberChk) rememberChk.checked = true;
  }
});

// === GLOBAL SEARCH LOGIC ===
function handleGlobalSearch(query) {
  const container = document.getElementById('globalSearchResults');
  const emptyEl = document.getElementById('globalSearchEmpty');
  if (!container) return;

  if (!query || query.trim().length < 2) {
    container.innerHTML = '';
    emptyEl.style.display = 'none';
    return;
  }

  const q = query.toLowerCase();
  const results = equipos.filter(e =>
    (e.id && e.id.toLowerCase().includes(q)) ||
    (e.nombre && e.nombre.toLowerCase().includes(q)) ||
    (e.descripcion && e.descripcion.toLowerCase().includes(q)) ||
    (e.serie && e.serie.toLowerCase().includes(q)) ||
    (e.marca && e.marca.toLowerCase().includes(q)) ||
    (e.cat && e.cat.toLowerCase().includes(q)) ||
    (e.qr && e.qr.toLowerCase().includes(q))
  ).slice(0, 50);

  if (results.length === 0) {
    container.innerHTML = '';
    emptyEl.style.display = 'block';
    return;
  }

  emptyEl.style.display = 'none';
  container.innerHTML = results.map(e => {
    const idx = equipos.indexOf(e);
    // Secure icons and colors
    let catIcon = '';
    let bgStyle = 'background:rgba(212,168,67,0.1)';

    if (e.cat === 'Audio') { catIcon = '<svg viewBox="0 0 24 24"><path d="M12 3a9 9 0 00-9 9v7c0 1.1.9 2 2 2h4v-8H5v-1c0-3.87 3.13-7 7-7s7 3.13 7 7v1h-4v8h4c1.1 0 2-.9 2-2v-7a9 9 0 00-9-9z" fill="currentColor"/></svg>'; bgStyle = 'background:rgba(74,144,255,0.1)'; }
    else if (e.cat === 'Iluminación') { catIcon = '<svg viewBox="0 0 24 24"><path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71L12 2z" fill="currentColor"/></svg>'; bgStyle = 'background:rgba(251,146,60,0.1)'; }
    else if (e.cat === 'Video') { catIcon = '<svg viewBox="0 0 24 24"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" fill="currentColor"/></svg>'; bgStyle = 'background:rgba(167,139,250,0.1)'; }
    else { catIcon = '<svg viewBox="0 0 24 24"><path d="M12 3L2 12h3v8h14v-8h3L12 3z" fill="currentColor"/></svg>'; bgStyle = 'background:rgba(74,222,128,0.1)'; }

    return `
      <div class="global-search-item" onclick="openEquipDetail(${idx})">
        <div class="gs-icon" style="${bgStyle}">${catIcon}</div>
        <div class="gs-info">
          <div class="gs-name">${e.nombre}<span class="gs-tag">${e.cat}</span></div>
          <div class="gs-meta">ID: ${e.id} • Mod: ${e.descripcion || 'N/A'} • Ser: ${e.serie || 'N/A'}</div>
        </div>
        <span class="ep-status ${e.estado === 'Disponible' ? 'disp' : e.estado === 'En Evento' ? 'evento' : 'mant'}">${e.estado}</span>
      </div>
    `;
  }).join('');
}

async function finishAndArchiveEvent(key) {
  if (!confirm('¿Estás seguro de que deseas archivar este evento? Se moverá permanentemente al historial.')) return;

  const ev = checkData[key];
  if (!ev) return;

  // Clone and augment with archival info
  const archived = { ...ev, status: 'completed', archivedAt: new Date().toISOString() };
  archivedEvents[key] = archived;

  // Persistent storage
  localStorage.setItem('rap_archived_v1', JSON.stringify(archivedEvents));
  delete checkData[key];

  await saveEvents(checkData); // This will also trigger pushSharedData

  showToast('✓ Evento archivado exitosamente.');
  showPage('pg-dashboard');
  renderEventCards();
  if (typeof renderArchivedEvents === 'function') renderArchivedEvents();
}

