const API_URL = "https://script.google.com/macros/s/AKfycbzT7OIAlgLhved2naO9FKz4PiBn_2VSl9CK7epvZc8mr3hWcJpo4i77Kt3Mmr6kJ1V6eQ/exec";
const API_TOKEN = "RAP_SECURE_TOKEN_2026_V1_ISAAC";

const SECTIONS = ['inventario', 'escaneo', 'eventos', 'eventos_edit', 'movimientos', 'estadisticas'];

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
    permissions: SECTIONS,
    createdAt: new Date().toISOString()
};

async function reset() {
    console.log("Starting reset...");

    // 1. Reset Users
    try {
        const resUsers = await fetch(API_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'pushUsers',
                token: API_TOKEN,
                adminRole: 'admin',
                users: [adminUser]
            })
        });
        const resultUsers = await resUsers.json();
        console.log("Users reset result:", resultUsers);
    } catch (e) {
        console.error("Error resetting users:", e);
    }

    // 2. Clear Notifications
    try {
        const resNotifs = await fetch(API_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'push',
                token: API_TOKEN,
                notifications: []
            })
        });
        const resultNotifs = await resNotifs.json();
        console.log("Notifications reset result:", resultNotifs);
    } catch (e) {
        console.error("Error clearing notifications:", e);
    }

    console.log("Reset complete.");
}

reset();
