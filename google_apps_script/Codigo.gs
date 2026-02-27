// ============================================================
//  RAP INVENTORY - Google Apps Script
//  Lee las primeras 7 columnas de 5 archivos de Google Sheets
// ============================================================

const ARCHIVOS = [
  "12RufVKNKNtGH7dEhDvYbc0fmFX6EyVyh",  // Archivo 1
  "1WnwXnaTyn7ZLro9TAwEjEvw21ZqrlNU0",  // Archivo 2
  "1rH6Ama5o--rRxvtcRonsAFIfjdYWo-og",  // Archivo 3
  "15th4w8laxjLniH-qE0tXrHk9avvE7-Dp",  // Archivo 4
  "1i_5-NkV0oWA7incDhTx8wHb9t9oEYROe"   // Archivo 5
];

function doGet(e) {
  var todos = [];
  var errores = [];

  ARCHIVOS.forEach(function(fileId) {
    try {
      var ss    = SpreadsheetApp.openById(fileId);
      var sheet = ss.getSheets()[0];
      var data  = sheet.getDataRange().getValues();

      if (data.length < 2) return; // archivo vacío

      // Fila 0 = encabezados (se omite)
      // Filas 1…N = datos
      for (var i = 1; i < data.length; i++) {
        var r = data[i];

        // Saltar filas completamente vacías
        var vacio = !r[0] && !r[1] && !r[2];
        if (vacio) continue;

        // Mapeo directo por posición (columnas 1-7 del sheet)
        todos.push({
          id:          String(r[0] || '').trim(),  // Columna 1
          nombre:      String(r[1] || '').trim(),  // Columna 2
          cat:         String(r[2] || '').trim(),  // Columna 3
          marca:       String(r[3] || '').trim(),  // Columna 4
          estado:      normalizarEstado(String(r[4] || '')), // Columna 5
          serie:       String(r[5] || '').trim(),  // Columna 6
          descripcion: String(r[6] || '').trim()   // Columna 7
        });
      }
    } catch(err) {
      errores.push(fileId + ': ' + err.message);
    }
  });

  var resultado = {
    success: true,
    total: todos.length,
    data: todos,
    errores: errores
  };

  var JSONString = JSON.stringify(resultado);

  // Soporte para JSONP (Elude el bloqueo CORS de Workspace)
  if (e && e.parameter && e.parameter.callback) {
    var callback = e.parameter.callback;
    var output = ContentService.createTextOutput(callback + '(' + JSONString + ');');
    output.setMimeType(ContentService.MimeType.JAVASCRIPT);
    return output;
  } else {
    // Respuesta normal JSON
    var JSONOutput = ContentService.createTextOutput(JSONString);
    JSONOutput.setMimeType(ContentService.MimeType.JSON);
    return JSONOutput;
  }
}

// Normaliza el estado al vocabulario de la app RAP
function normalizarEstado(raw) {
  var l = raw.toLowerCase().replace(/[áàä]/g,'a').replace(/[éèë]/g,'e')
             .replace(/[íìï]/g,'i').replace(/[óòö]/g,'o').replace(/[úùü]/g,'u');

  if (l.includes('disp') || l.includes('ok') || l.includes('libre') || l.includes('activo')) return 'Disponible';
  if (l.includes('mant') || l.includes('repar') || l.includes('falla'))                       return 'Mantenimiento';
  if (l.includes('evento') || l.includes('uso') || l.includes('ocup') || l.includes('rent')) return 'En Evento';

  return raw || 'Disponible';
}
