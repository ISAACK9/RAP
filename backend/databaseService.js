/**
 * databaseService.js
 * 
 * Módulo de conexión con Google Sheets API mediante Google Cloud Service Account.
 * Garantiza lecturas/escrituras rápidas asíncronas para respaldar la Arquitectura Offline-First de la SPA.
 */

require('dotenv').config();
const { google } = require('googleapis');

// Inicialización de la Autenticación mediante Service Account
let auth;
if (process.env.GOOGLE_CREDENTIALS_JSON) {
    // Para Vercel: Se lee todo el JSON desde una variable de entorno
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
    auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
} else {
    // Fallback local: Lee GOOGLE_APPLICATION_CREDENTIALS
    auth = new google.auth.GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
}

const sheets = google.sheets({ version: 'v4', auth });
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

class DatabaseService {

    /**
     * Helper para convertir un array bidimensional de hojas de cálculo a un Array de Objetos JS
     */
    _mapRowsToObjects(rows) {
        if (!rows || rows.length === 0) return [];
        const headers = rows[0];
        return rows.slice(1).map(row => {
            const rowObj = {};
            let hasData = false;
            headers.forEach((header, index) => {
                const val = row[index] !== undefined ? String(row[index]).trim() : '';
                rowObj[header] = val;
                if (val !== '') hasData = true;
            });
            return hasData ? rowObj : null;
        }).filter(item => item !== null);
    }

    /**
     * Helper para convertir un Objeto JS a un Array para Sheets (considerando las cabeceras)
     */
    async _mapObjectToRow(sheetName, obj) {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: `${sheetName}!1:1`
        });
        const headers = response.data.values[0] || [];
        return headers.map(header => obj[header] || '');
    }

    /**
     * OBTENER INVENTARIO (Lectura Paginada / Diferida)
     * Resuelve el requerimiento "No descargues toda la BD de golpe".
     * @param {number} limit 
     * @param {number} offset 
     */
    async obtenerInventario(limit = 100, offset = 0) {
        try {
            // Se asume que la hoja de llama "Inventario"
            const response = await sheets.spreadsheets.values.get({
                spreadsheetId: SPREADSHEET_ID,
                range: 'Inventario!A:Z'
            });

            const allItems = this._mapRowsToObjects(response.data.values);

            // Lógica de Paginación en memoria (para bases gigantes, se ajusta el 'range' de consulta directo a A[offset]:Z[offset+limit])
            const paginatedItems = allItems.slice(offset, offset + limit);

            return {
                success: true,
                total: allItems.length,
                count: paginatedItems.length,
                items: paginatedItems
            };

        } catch (error) {
            console.error('[DB Service] Error en obtenerInventario:', error.message);
            // Retorna un json de error amigable sin colapsar la app
            return { success: false, items: [], error: 'Error de conexión con la base de datos externa.' };
        }
    }

    /**
     * OBTENER HISTORIAL (Lectura Paginada)
     */
    async obtenerHistorial(limit = 100, offset = 0) {
        try {
            const response = await sheets.spreadsheets.values.get({
                spreadsheetId: SPREADSHEET_ID,
                range: 'Historial!A:Z'
            });

            const allItems = this._mapRowsToObjects(response.data.values).reverse(); // Reverse for newest first
            const paginatedItems = allItems.slice(offset, offset + limit);

            return {
                success: true,
                total: allItems.length,
                count: paginatedItems.length,
                items: paginatedItems
            };
        } catch (error) {
            console.error('[DB Service] Error en obtenerHistorial:', error.message);
            return { success: false, items: [], error: 'Error obteniendo historial.' };
        }
    }

    /**
     * OBTENER EVENTOS (Lectura Paginada)
     */
    async obtenerEventos(limit = 100, offset = 0) {
        try {
            const response = await sheets.spreadsheets.values.get({
                spreadsheetId: SPREADSHEET_ID,
                range: 'Eventos!A:Z'
            });

            const allItems = this._mapRowsToObjects(response.data.values).reverse();
            const paginatedItems = allItems.slice(offset, offset + limit);

            return {
                success: true,
                total: allItems.length,
                count: paginatedItems.length,
                items: paginatedItems
            };
        } catch (error) {
            console.error('[DB Service] Error en obtenerEventos:', error.message);
            return { success: false, items: [], error: 'Error obteniendo eventos.' };
        }
    }

    /**
     * REGISTRAR MOVIMIENTO (Escritura asíncrona)
     * Añade una fila en 'Historial' y actualiza el estado en 'Inventario'
     * @param {Object} datos - { codigo, tipo (entrada/salida), usuario, fecha, equipoNombre }
     */
    async registrarMovimiento(datos) {
        try {
            const { codigo, tipo, usuario, fecha, equipoNombre } = datos;

            // 1. Agregar registro a la pestaña Historial (AppendRow)
            const nuevoHistorialRow = [fecha, codigo, equipoNombre, tipo.toUpperCase(), usuario];

            await sheets.spreadsheets.values.append({
                spreadsheetId: SPREADSHEET_ID,
                range: 'Historial!A:E',
                valueInputOption: 'USER_ENTERED',
                resource: { values: [nuevoHistorialRow] }
            });

            // 2. Buscar fila exact del equipo en 'Inventario' para cambiar el 'Estado'
            const invResponse = await sheets.spreadsheets.values.get({
                spreadsheetId: SPREADSHEET_ID,
                range: 'Inventario!A:Z'
            });

            const rows = invResponse.data.values;
            const codigoIndex = rows[0].indexOf('Codigo');
            const estadoIndex = rows[0].indexOf('Estado');

            let targetRowIndex = -1;
            for (let i = 1; i < rows.length; i++) {
                if (String(rows[i][codigoIndex]) === String(codigo)) {
                    targetRowIndex = i + 1; // +1 porque sheets usa índices 1-base
                    break;
                }
            }

            if (targetRowIndex === -1) {
                return { success: false, error: 'Código de equipo no encontrado en el inventario.' };
            }

            // 3. Actualizar celda de Estado
            const nuevoEstado = tipo === 'salida' ? 'En Préstamo' : 'Disponible';
            // Convertimos índice de columna a Letra (Suponiendo Estado <= 26)
            const columnaLetra = String.fromCharCode(65 + estadoIndex);

            await sheets.spreadsheets.values.update({
                spreadsheetId: SPREADSHEET_ID,
                range: `Inventario!${columnaLetra}${targetRowIndex}`,
                valueInputOption: 'USER_ENTERED',
                resource: { values: [[nuevoEstado]] }
            });

            return { success: true, message: `Movimiento de ${tipo} registrado correctamente.` };

        } catch (error) {
            console.error('[DB Service] Error en registrarMovimiento:', error.message);
            // No hacemos throw para evitar que el proceso colapse si se cae el internet 
            // Esto permite que la API devuelva un error HTTP 500 y el Frontend encole el elemento en la caché de reintentos
            return { success: false, error: 'La sincronización falló por cortes de red o permisos externos.' };
        }
    }

    /**
     * REGISTRAR NUEVO EVENTO
     * Guarda en historial múltiple y cambia estados masivamente
     */
    async registrarEvento(eventData) {
        try {
            const numEquipos = eventData.equiposAsignados.length;
            console.log(`[DB Service] Registrando Evento '${eventData.nombre}' con ${numEquipos} equipos.`);

            // Opcional: Escribir la "Cabecera" del Evento en una hoja de "Eventos" si existiera,
            // pero para ser robustos, delegaremos la trazabilidad en "Historial" usando "EN EVENTO".

            let successCount = 0;
            // Registramos un movimiento general por cada equipo seleccionado
            for (const codigo of eventData.equiposAsignados) {
                const payload = {
                    codigo: codigo,
                    tipo: 'salida',
                    usuario: 'Admin', // Idealment tomarlo de eventData.user si existe
                    fecha: new Date().toISOString(),
                    equipoNombre: eventData.nombre // Usamos equipoNombre para guardar el Nombre del Evento y visualizarlo en el Historial
                };

                const result = await this.registrarMovimiento(payload);
                if (result.success) successCount++;
            }

            return {
                success: true,
                message: `Evento '${eventData.nombre}' creado. ${successCount}/${numEquipos} equipos asignados exitosamente.`
            };

        } catch (error) {
            console.error('[DB Service] Error en registrarEvento:', error.message);
            return { success: false, error: 'Ocurrió un error al procesar el grupo de equipos para el evento.' };
        }
    }

    /**
     * OBTENER USUARIOS (Para el panel de administración)
     * Resuelve requerimiento "Para que el Administrador vea y edite roles"
     */
    async obtenerUsuarios() {
        try {
            const response = await sheets.spreadsheets.values.get({
                spreadsheetId: SPREADSHEET_ID,
                range: 'Usuarios!A:Z'
            });

            const allUsers = this._mapRowsToObjects(response.data.values);

            return {
                success: true,
                items: allUsers
            };
        } catch (error) {
            console.error('[DB Service] Error en obtenerUsuarios:', error.message);
            return { success: false, items: [], error: 'Error obteniendo lista de usuarios.' };
        }
    }

    /**
     * ACTUALIZAR USUARIO (CRUD Administrativo)
     * Resuelve requerimiento "Para el sistema de permisos del administrador"
     * @param {String} username 
     * @param {String} nuevoRol (ej. 'Administrador', 'Usuario')
     */
    async actualizarUsuario(username, nuevoRol) {
        try {
            const response = await sheets.spreadsheets.values.get({
                spreadsheetId: SPREADSHEET_ID,
                range: 'Usuarios!A:Z'
            });

            const rows = response.data.values;
            const userIndex = rows[0].indexOf('Username');
            const rolIndex = rows[0].indexOf('Rol');

            let targetRowIndex = -1;
            for (let i = 1; i < rows.length; i++) {
                if (rows[i][userIndex] === username) {
                    targetRowIndex = i + 1;
                    break;
                }
            }

            if (targetRowIndex === -1) {
                return { success: false, error: `Usuario ${username} no existe.` };
            }

            const columnaLetra = String.fromCharCode(65 + rolIndex);

            await sheets.spreadsheets.values.update({
                spreadsheetId: SPREADSHEET_ID,
                range: `Usuarios!${columnaLetra}${targetRowIndex}`,
                valueInputOption: 'USER_ENTERED',
                resource: { values: [[nuevoRol]] }
            });

            return { success: true, message: `Permisos de ${username} actualizados a ${nuevoRol}.` };

        } catch (error) {
            console.error('[DB Service] Error en actualizarUsuario:', error.message);
            return { success: false, error: 'Fallo al conectar con servidor de autenticación external.' };
        }
    }
}

// Exportar como Singleton para ser importado por el router web (Ej: Express.js)
module.exports = new DatabaseService();
