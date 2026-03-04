/**
 * server.js
 * 
 * Servidor Express.js que expone el 'databaseService.js' como una REST API local.
 * La aplicación frontend SPA llamará a esta API en lugar de usar Google Apps Script.
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const databaseService = require('./databaseService');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
// Permitir peticiones desde nuestro frontend estático (ej. Live Server en el puerto 5500)
app.use(cors());
app.use(express.json()); // Parsear JSON en el request body

// --- RUTAS DE LA API ---

// 1. Obtener Inventario
app.get('/api/inventory', async (req, res) => {
    const limit = parseInt(req.query.limit) || 100;
    const offset = parseInt(req.query.offset) || 0;

    console.log(`[API] Solicitando inventario (Limit: ${limit}, Offset: ${offset})`);
    const result = await databaseService.obtenerInventario(limit, offset);

    // Si success es false, lanzamos 500 para que el Frontend (OfflineSyncService) active su cola de reintentos
    if (!result.success) return res.status(500).json(result);
    return res.status(200).json(result);
});

// 2. Registrar Escaneo/Movimiento
app.post('/api/scan', async (req, res) => {
    const { codigo, type, user, timestamp, equipoNombre } = req.body;

    if (!codigo || !type) {
        return res.status(400).json({ success: false, error: 'Código y tipo de movimiento son requeridos.' });
    }

    console.log(`[API] Registrando escaneo: ${codigo} - ${type.toUpperCase()}`);

    const datos = {
        codigo: codigo,
        tipo: type, // 'entrada' o 'salida'
        usuario: user || 'Anónimo',
        fecha: timestamp || new Date().toISOString(),
        equipoNombre: equipoNombre || 'No especificado'
    };

    const result = await databaseService.registrarMovimiento(datos);

    if (!result.success) return res.status(500).json(result);
    return res.status(200).json(result);
});

// 3. Actualizar Permisos de Usuario
app.post('/api/users/role', async (req, res) => {
    const { username, nuevoRol } = req.body;

    if (!username || !nuevoRol) {
        return res.status(400).json({ success: false, error: 'Faltan datos de usuario o rol.' });
    }

    console.log(`[API] Actualizando rol de ${username} a ${nuevoRol}`);
    const result = await databaseService.actualizarUsuario(username, nuevoRol);

    if (!result.success) return res.status(500).json(result);
    return res.status(200).json(result);
});

// 4. Ruta combinada "action" para mantener compatibilidad con el código Frontend Frontend original
app.post('/api/action', async (req, res) => {
    const action = req.body.action;
    const payloadData = req.body.data;
    const params = req.body.params;

    if (action === 'getInventory') {
        const result = await databaseService.obtenerInventario(params?.limit, params?.offset);
        if (!result.success) return res.status(500).json(result);
        return res.status(200).json(result);
    }

    if (action === 'getHistory') {
        const result = await databaseService.obtenerHistorial(params?.limit, params?.offset);
        if (!result.success) return res.status(500).json(result);
        return res.status(200).json(result);
    }

    if (action === 'getEvents') {
        const result = await databaseService.obtenerEventos(params?.limit, params?.offset);
        if (!result.success) return res.status(500).json(result);
        return res.status(200).json(result);
    }

    if (action === 'processScan') {
        const datos = {
            codigo: payloadData.code,
            tipo: payloadData.type,
            usuario: payloadData.user,
            fecha: payloadData.timestamp,
            equipoNombre: payloadData.equipoNombre || ''
        };
        const result = await databaseService.registrarMovimiento(datos);
        if (!result.success) return res.status(500).json(result);
        return res.status(200).json(result);
    }

    if (action === 'getUsers') {
        const result = await databaseService.obtenerUsuarios();
        if (!result.success) return res.status(500).json(result);
        return res.status(200).json(result);
    }

    // Si es un comando de Mock como getDashboardStats
    if (action === 'getDashboardStats') {
        return res.status(200).json({
            success: true,
            stats: { total: 0, prestamos: 0, disponibles: 0 },
            recents: []
        });
    }

    res.status(404).json({ success: false, error: 'Action no soportada' });
});

// 5. Proxy para la Sincronización de Archivos CSV múltiples
// Soluciona el problema de CORS en el WebWorker al descargar los Excels de Inventario
app.get('/api/proxy-csv', async (req, res) => {
    try {
        const targetUrl = req.query.url;
        if (!targetUrl || !targetUrl.includes('google.com')) {
            return res.status(400).json({ error: 'URL no válida' });
        }

        console.log(`[Proxy] Fetching: ${targetUrl}`);

        // Node 18+ soporta fetch nativo
        const fetchResponse = await fetch(targetUrl);
        if (!fetchResponse.ok) {
            return res.status(fetchResponse.status).send(`Failed to fetch from Google: ${fetchResponse.statusText}`);
        }

        const text = await fetchResponse.text();

        res.setHeader('Content-Type', 'text/csv');
        // Permite CORS hacia nuestro frontend
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.status(200).send(text);

    } catch (e) {
        console.error('[Proxy Error]', e.message);
        res.status(500).json({ error: e.message });
    }
});

// Iniciar Servidor
app.listen(PORT, () => {
    console.log(`========================================`);
    console.log(`🚀 Inventory Backend API Corriendo!`);
    console.log(`📡 Escuchando en http://localhost:${PORT}`);
    console.log(`========================================`);
});
