# Plan de Arquitectura Escalable (24k+ Artículos y Multiusuario)

Este documento contiene el plan propuesto para que la aplicación soporte más de 24,000 artículos y múltiples usuarios concurrentes en el futuro. Guárdalo para cuando estés en tu otra computadora.

## 1. Fluidez en la Interfaz (Frontend): Virtual Scrolling
Si la aplicación intenta dibujar 24,000 tarjetas de equipos en la página `index.html` al mismo tiempo, el navegador (Chrome, Safari, etc.) colapsará por exceso de uso de memoria (RAM).

**La Solución:** Implementar *Virtual Scrolling* (Renderizado Virtual).
- **Cómo funciona:** La aplicación solo dibujará los 15 o 20 artículos que caben en la pantalla en ese momento. Cuando deslizas hacia abajo (haces scroll), el código reutiliza esas mismas 20 tarjetas y solo les cambia los datos (nombre, modelo, estado) de forma invisible.
- **Resultado:** Puedes hacer scroll entre 24,000 o 100,000 equipos y la aplicación correrá a 60 cuadros por segundo de forma súper fluida en cualquier dispositivo.

## 2. Caché Inteligente y Almacenamiento Local (IndexedDB)
Google Sheets / Drive tiene límites en cuántas peticiones puede recibir por segundo. Si varios usuarios abren la app y buscan constantemente, podríamos bloquear el Drive.

**La Solución:** Uso de `IndexedDB` y Caché.
- **Cómo funciona:** Al iniciar sesión, la app descargará la base de datos de Drive una sola vez y la guardará en la memoria interna y rápida del navegador (IndexedDB).
- **Búsqueda instantánea:** Las búsquedas y el filtrado en la pestaña de "Inventario" se harán directo en la memoria de tu dispositivo local. Buscar un equipo entre 24,000 tomará milisegundos y no consumirá internet.

## 3. Sincronización Transaccional y Drive en Tiempo Real
Para evitar que dos usuarios renten el mismo equipo ("choques de estado") y mantener todo sincronizado:

**La Solución:** Google Apps Script (GAS) como API y Validación de Estado (Locks).
- **Backend (GAS):** Crearemos un pequeño script en tu Google Sheet que funcione como una API REST.
- **Peticiones Inteligentes y Validación:** Cuando escanees un equipo, la aplicación preguntará a Drive: *"¿Este artículo sigue disponible o alguien lo acaba de rentar?"*. Si dos personas escanean al mismo tiempo, el primero pasa y el segundo recibe una alerta roja instantánea: **"Equipo No Disponible"**.
- **Actualización Continua (Polling):** La aplicación consultará a Drive en segundo plano cada varios segundos preguntando por los "últimos elementos modificados". Si el servidor reporta un cambio, la pantalla de todos los usuarios se actualizará automáticamente sin tener que recargar la página.

---
**Nota para el futuro desarrollo (Próxima Sesión en la Computadora Principal):**

En la sesión anterior, el proyecto quedó preparado a nivel de interfaz de usuario y lógica interna:
- [x] Soporte para escáner QR/Código de Barras integrado.
- [x] UI/UX Responsivo.
- [x] Sistema de Notificaciones de Administrador.
- [x] Role-Based Access Control (Admin, Jefe de Almacén, Encargado, Inventarios) funcional y configurable desde el Panel de Admin.

**El SIGUIENTE PASO INMEDIATO Y PRIORIDAD ABSOLUTA es:**
1. **Conexión a Google Drive / Sheets (24,000 artículos):** Modificar `app.js` para reemplazar la base de datos de "prueba" (`window.equipos`) por un `fetch()` hacia el Google Apps Script que servirá como API.
2. **Implementar Virtual Scrolling y Paginación Local:** Dado que la base de datos es masiva (24k items), la UI de la pestaña "Inventario" *DEBE* usar *Virtual Scrolling* o renderizado dinámico por lotes para que el DOM no colapse. **La prioridad es que la app se sienta fluida, fácil de usar y muy rápida a pesar del volumen de datos.**
3. **Caché / IndexedDB:** Construir la lógica para descargar el inventario en plano a IndexedDB en el primer inicio de sesión para que las búsquedas mediante el input de Escáner sean instantáneas sin consumir datos repetidamente de Google Drive.
4. **Validación en Tiempo Real (Locks):** Elaborar el código de validación (`onEdit` o funciones `doPost() / doGet()`) en la hoja de cálculo de Google para evitar choques si varios empleados escanean al mismo tiempo.
