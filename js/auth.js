// Auth.js - Functional Role Based Access Control & Authentication Flow

const AuthState = {
    user: null, // { username, role }
    isLoggedIn: false,
};

function checkAuth() {
    const stored = localStorage.getItem('inventory_user');
    if (stored) {
        try {
            AuthState.user = JSON.parse(stored);
            AuthState.isLoggedIn = true;
            updateAuthUI();
        } catch (e) {
            console.error("Auth state error", e);
        }
    } else {
        updateAuthUI();
    }
}

function updateAuthUI() {
    const navBar = document.querySelector('.main-nav');
    const loginView = document.getElementById('view-login');
    const homeView = document.getElementById('view-home');
    const nameDisplay = document.getElementById('user-name-display');

    if (AuthState.isLoggedIn && AuthState.user) {
        // 1. Mostrar Navbar y Datos de Usuario
        if (navBar) navBar.style.display = 'flex';
        if (nameDisplay) nameDisplay.innerText = `${AuthState.user.username} (${AuthState.user.role})`;

        // 2. Apagar Login abruptamente
        if (loginView) {
            loginView.classList.add('hidden');
            loginView.classList.remove('active', 'flex');
            loginView.style.display = 'none';
        }

        // 3. Encender Home View (Forzar Desbloqueo) si ninguna otra vista está activa
        if (homeView && !document.querySelector('.view.active:not(#view-login)')) {
            homeView.classList.remove('hidden');
            // Timeout ligero para permitir el reflow del DOM antes de animar
            setTimeout(() => homeView.classList.add('active'), 50);
        }

        // 4. Aplicar RBAC (Permisos de Admin)
        const adminNavItem = document.getElementById('nav-item-admin');
        const syncBtn = document.getElementById('btn-sync-inventory');
        if (isAdmin()) {
            if (adminNavItem) adminNavItem.classList.remove('hidden');
            if (syncBtn) syncBtn.classList.remove('hidden');
        } else {
            if (adminNavItem) adminNavItem.classList.add('hidden');
            if (syncBtn) syncBtn.classList.add('hidden');
        }
    } else {
        // Bloqueo estricto: Ocultar todo y mostrar Solo Login
        if (navBar) navBar.style.display = 'none';
        document.querySelectorAll('.view').forEach(v => {
            v.classList.remove('active');
            v.classList.add('hidden');
        });
        if (loginView) {
            loginView.classList.remove('hidden');
            loginView.style.display = 'flex';
            setTimeout(() => loginView.classList.add('active'), 50);
        }
    }
}

// ---------------------------------------------------------
// NEW API DRIVEN AUTH METHODS
// ---------------------------------------------------------

async function performAuthAction(action, username, password) {
    try {
        const payload = { action: action, username, password };
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        return data;
    } catch (e) {
        console.error(`Auth Error [${action}]:`, e);
        return { success: false, error: "Error de conexión con el servidor" };
    }
}

// Event Listeners for HTML Forms
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();

    // Toggle Tabs
    document.querySelectorAll('.auth-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            document.querySelectorAll('.auth-tab').forEach(t => {
                t.classList.remove('border-emerald-500', 'text-white');
                t.classList.add('border-transparent', 'text-gray-500');
            });
            e.target.classList.remove('border-transparent', 'text-gray-500');
            e.target.classList.add('border-emerald-500', 'text-white');

            document.querySelectorAll('.auth-form').forEach(f => f.classList.add('hidden'));
            document.getElementById(e.target.getAttribute('data-target')).classList.remove('hidden');
        });
    });

    // Handle Login
    document.getElementById('form-login')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const user = document.getElementById('login-user').value.trim();
        const pass = document.getElementById('login-pass').value.trim();
        const btn = document.getElementById('btn-submit-login');

        btn.disabled = true;
        btn.innerHTML = `<i class="material-icons-round spin-animation">sync</i> Verificando...`;

        const res = await performAuthAction('loginUsuario', user, pass);

        if (res.success) {
            AuthState.user = { username: res.username, role: res.rol };
            AuthState.isLoggedIn = true;
            localStorage.setItem('inventory_user', JSON.stringify(AuthState.user));
            updateAuthUI();
            UI.showToast(`Bienvenido, ${res.username}`, 'success');
            // Trigger load to populate dashboards immediately after login
            if (typeof loadDashboard === 'function') loadDashboard();
        } else {
            UI.showToast(res.error || "Credenciales incorrectas", "error");
        }

        btn.disabled = false;
        btn.innerHTML = `ENTRAR`;
    });

    // Handle Register
    document.getElementById('form-register')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const user = document.getElementById('reg-user').value.trim();
        const pass = document.getElementById('reg-pass').value.trim();
        const btn = document.getElementById('btn-submit-reg');

        btn.disabled = true;
        btn.innerHTML = `<i class="material-icons-round spin-animation">sync</i> Creando...`;

        const res = await performAuthAction('registrarUsuario', user, pass);

        if (res.success) {
            UI.showToast("Cuenta creada exitosamente. Ahora inicia sesión.", "success");
            // Switch to login tab automatically
            document.querySelector('.auth-tab[data-target="form-login"]').click();
            document.getElementById('login-user').value = user;
            document.getElementById('login-pass').value = '';
        } else {
            UI.showToast(res.error || "Error al registrar cuenta", "error");
        }

        btn.disabled = false;
        btn.innerHTML = `CREAR CUENTA`;
    });

    // Logout
    document.getElementById('btn-logout')?.addEventListener('click', () => {
        AuthState.user = null;
        AuthState.isLoggedIn = false;
        localStorage.removeItem('inventory_user');
        updateAuthUI();
        UI.showToast("Sesión cerrada", "info");
    });
});

// Helper for other scripts to check RBAC
function canProcessScan() {
    return AuthState.isLoggedIn;
}

function isAdmin() {
    return AuthState.isLoggedIn && AuthState.user?.role === 'Administrador';
}
