// ============================================================
//  RAP INVENTORY - Google Apps Script
//  Lee las primeras 7 columnas de 5 archivos de Google Sheets
// ============================================================

const ARCHIVOS = [
  "12RufVKNKNtGH7dEhDvYbc0fmFX6EyVyh",
  "1WnwXnaTyn7ZLro9TAwEjEvw21ZqrlNU0",
  "1rH6Ama5o--rRxvtcRonsAFIfjdYWo-og",
  "15th4w8laxjLniH-qE0tXrHk9avvE7-Dp",
  "1i_5-NkV0oWA7incDhTx8wHb9t9oEYROe"
];

// SHARED DATABASE SPREADSHEET
const DB_SPREADSHEET_ID = "1JxmuQp6VkUf5tqY2s0pjQtU63SG8h07bunZ6P312mn8";

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || 'inventory';
  
  if (action === 'inventory') {
    return handleInventoryGet(e);
  } else if (action === 'pull') {
    return handlePullSharedData(e);
  }
}

function doPost(e) {
  try {
    var contents = JSON.parse(e.postData.contents);
    var action = contents.action;
    
    if (action === 'push') {
      return handlePushSharedData(contents);
    }
  } catch (err) {
    return createJsonResponse({ success: false, error: err.message });
  }
}

function handleInventoryGet(e) {
  var todos = [];
  var errores = [];

  ARCHIVOS.forEach(function(fileId) {
    try {
      var ss = SpreadsheetApp.openById(fileId);
      var sheet = ss.getSheets()[0];
      var data = sheet.getDataRange().getValues();
      if (data.length < 2) return;
      for (var i = 1; i < data.length; i++) {
        var r = data[i];
        if (!r[0] && !r[1] && !r[2]) continue;
        todos.push({
          id: String(r[0] || '').trim(),
          nombre: String(r[1] || '').trim(),
          cat: String(r[2] || '').trim(),
          marca: String(r[3] || '').trim(),
          estado: normalizarEstado(String(r[4] || '')),
          serie: String(r[5] || '').trim(),
          descripcion: String(r[6] || '').trim()
        });
      }
    } catch(err) {
      errores.push(fileId + ': ' + err.message);
    }
  });

  return createJsonResponse({ success: true, total: todos.length, data: todos, errores: errores }, e);
}

function handlePushSharedData(contents) {
  var ss = SpreadsheetApp.openById(DB_SPREADSHEET_ID);
  var sheet = ss.getSheets()[0];
  
  // Storage structure: 
  // Col A: Data Type ('events' or 'movements')
  // Col B: JSON stringified data
  // Col C: Timestamp
  
  if (contents.events) {
    updateOrInsertDbRow(sheet, 'events', JSON.stringify(contents.events));
  }
  if (contents.movements) {
    updateOrInsertDbRow(sheet, 'movements', JSON.stringify(contents.movements));
  }
  
  return createJsonResponse({ success: true });
}

function handlePullSharedData(e) {
  var ss = SpreadsheetApp.openById(DB_SPREADSHEET_ID);
  var sheet = ss.getSheets()[0];
  var data = sheet.getDataRange().getValues();
  
  var result = { events: {}, movements: [] };
  
  data.forEach(function(r) {
    if (r[0] === 'events') result.events = JSON.parse(r[1]);
    if (r[0] === 'movements') result.movements = JSON.parse(r[1]);
  });
  
  return createJsonResponse({ success: true, data: result }, e);
}

function updateOrInsertDbRow(sheet, type, json) {
  var data = sheet.getDataRange().getValues();
  var foundRow = -1;
  
  for (var i = 0; i < data.length; i++) {
    if (data[i][0] === type) {
      foundRow = i + 1;
      break;
    }
  }
  
  if (foundRow !== -1) {
    sheet.getRange(foundRow, 2).setValue(json);
    sheet.getRange(foundRow, 3).setValue(new Date());
  } else {
    sheet.appendRow([type, json, new Date()]);
  }
}

function createJsonResponse(obj, e) {
  var JSONString = JSON.stringify(obj);
  var callback = e && e.parameter && e.parameter.callback;
  
  if (callback) {
    var output = ContentService.createTextOutput(callback + '(' + JSONString + ');');
    output.setMimeType(ContentService.MimeType.JAVASCRIPT);
    return output;
  } else {
    var output = ContentService.createTextOutput(JSONString);
    output.setMimeType(ContentService.MimeType.JSON);
    return output;
  }
}

function normalizarEstado(raw) {
  var l = raw.toLowerCase().replace(/[áàä]/g,'a').replace(/[éèë]/g,'e')
             .replace(/[íìï]/g,'i').replace(/[óòö]/g,'o').replace(/[úùü]/g,'u');
  if (l.includes('disp') || l.includes('ok') || l.includes('libre') || l.includes('activo')) return 'Disponible';
  if (l.includes('mant') || l.includes('repar') || l.includes('falla')) return 'Mantenimiento';
  if (l.includes('evento') || l.includes('uso') || l.includes('ocup') || l.includes('rent')) return 'En Evento';
  return raw || 'Disponible';
}
