// Auth.js - Basic Role Based Access Control stub & user state management

const AuthState = {
    user: null, // { username, role }
    isLoggedIn: false,
};

function checkAuth() {
    // Check local storage for session
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
        // Default to a guest or force login (here we just show guest)
        updateAuthUI();
    }
}

function updateAuthUI() {
    const nameDisplay = document.getElementById('user-name-display');
    const loginBtn = document.getElementById('btn-login-modal');
    const logoutBtn = document.getElementById('btn-logout');

    if (AuthState.isLoggedIn && AuthState.user) {
        if (nameDisplay) nameDisplay.innerText = `${AuthState.user.username} (${AuthState.user.role})`;
        if (loginBtn) loginBtn.classList.add('hidden');
        if (logoutBtn) logoutBtn.classList.remove('hidden');
    } else {
        if (nameDisplay) nameDisplay.innerText = "Invitado";
        if (loginBtn) loginBtn.classList.remove('hidden');
        if (logoutBtn) logoutBtn.classList.add('hidden');
    }
}

function login(username, role = 'Usuario') {
    AuthState.user = { username, role };
    AuthState.isLoggedIn = true;
    localStorage.setItem('inventory_user', JSON.stringify(AuthState.user));
    updateAuthUI();
    UI.showToast(`Bienvenido, ${username}`);
}

function logout() {
    AuthState.user = null;
    AuthState.isLoggedIn = false;
    localStorage.removeItem('inventory_user');
    updateAuthUI();
    UI.showToast("Sesión cerrada");
}

document.getElementById('btn-logout')?.addEventListener('click', logout);

// Simulating a quick login logic for demo purposes
document.getElementById('btn-login-modal')?.addEventListener('click', () => {
    // In a real app, this would open a modal with User/Pass
    // We simulate logging in as Administrador for demo
    const userRole = confirm("Demo Login:\nAceptar para ingresar como 'Administrador'.\nCancelar para ingresar como 'Usuario'.") ? 'Administrador' : 'Usuario';
    login('AdminTest', userRole);
});

// Initialize on load
document.addEventListener('DOMContentLoaded', checkAuth);

// Helper for other scripts to check RBAC
function canProcessScan() {
    return AuthState.isLoggedIn; // Assuming all logged users can scan. Change if only admins can.
}

function isAdmin() {
    return AuthState.isLoggedIn && AuthState.user?.role === 'Administrador';
}
