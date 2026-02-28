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

// SHARED DATABASE SPREADSHEET (Central store for events, movements, and users)
const DB_SPREADSHEET_ID = "1JxmuQp6VkUf5tqY2s0pjQtU63SG8h07bunZ6P312mn8";
const SECRET_TOKEN = "RAP_SECURE_TOKEN_2026_V1_ISAAC"; // Premium Security Token

function getSharedSheet(name) {
  const ss = SpreadsheetApp.openById(DB_SPREADSHEET_ID);
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    if (name === 'USUARIOS') {
      sheet.appendRow(['ID', 'Name', 'Username', 'Email', 'Phone', 'Cargo', 'Password', 'Role', 'Status', 'Permissions', 'CreatedAt']);
    } else {
      sheet.appendRow(['Type', 'JSON_DATA', 'Timestamp']);
    }
  }
  return sheet;
}

function verifyToken(token) {
  return token === SECRET_TOKEN;
}

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || 'inventory';
  var token = e.parameter.token;
  
  // Public inventory access (if required) or protected
  // For 'Premium' security, let's protect everything except inventory if you want, 
  // but the user asked to secure all endpoints.
  if (!verifyToken(token)) {
    return createJsonResponse({ success: false, error: 'Unauthorized: Invalid Security Token' }, e);
  }

  var callback = e.parameter.callback;
  var result = { success: false };
  
  try {
    if (action === 'inventory') {
      return handleInventoryGet(e);
    } 
    else if (action === 'pull') {
      var sheet = getSharedSheet('GLOBAL_SYNC');
      var data = sheet.getDataRange().getValues();
      result = { success: true, data: { events: {}, movements: [], archivedEvents: {}, notifications: [] } };
      data.forEach(function(r) {
        if (r[0] === 'events') result.data.events = JSON.parse(r[1]);
        if (r[0] === 'movements') result.data.movements = JSON.parse(r[1]);
        if (r[0] === 'archived_events') result.data.archivedEvents = JSON.parse(r[1]);
        if (r[0] === 'notifications') result.data.notifications = JSON.parse(r[1]);
      });
    } else if (action === 'pullUsers') {
      var sheet = getSharedSheet('USUARIOS');
      var data = sheet.getDataRange().getValues();
      var users = [];
      for (var i = 1; i < data.length; i++) {
        users.push({
          id: String(data[i][0]),
          name: String(data[i][1]),
          username: String(data[i][2]),
          email: String(data[i][3]),
          phone: String(data[i][4]),
          cargo: String(data[i][5]),
          password: String(data[i][6]), // Incluido para validación si se requiere
          role: String(data[i][7]),
          status: String(data[i][8]),
          permissions: JSON.parse(data[i][9] || '[]'),
          createdAt: String(data[i][10])
        });
      }
      result = { success: true, data: users };
    } else if (action === 'login') {
      var sheet = getSharedSheet('USUARIOS');
      var data = sheet.getDataRange().getValues();
      var userFound = null;
      var username = e.parameter.username;
      var password = e.parameter.password;
      
      for (var i = 1; i < data.length; i++) {
        if (String(data[i][2]).toLowerCase() === String(username).toLowerCase() && String(data[i][6]) === String(password)) {
          userFound = {
            id: String(data[i][0]),
            name: String(data[i][1]),
            username: String(data[i][2]),
            role: String(data[i][7]),
            status: String(data[i][8]),
            permissions: JSON.parse(data[i][9] || '[]')
          };
          break;
        }
      }
      if (userFound) result = { success: true, data: userFound };
      else result = { success: false, error: 'Credenciales inválidas' };
    } else if (action === 'signup') {
      var sheet = getSharedSheet('USUARIOS');
      var userStr = e.parameter.user;
      var u = JSON.parse(userStr);
      
      // Duplication Check
      var data = sheet.getDataRange().getValues();
      var exists = false;
      for (var i = 1; i < data.length; i++) {
        if (String(data[i][2]).toLowerCase() === String(u.username).toLowerCase()) {
          exists = true;
          break;
        }
      }
      
      if (exists) {
        result = { success: false, error: 'Ese nombre de usuario ya existe en el servidor' };
      } else {
        sheet.appendRow([u.id, u.name, u.username, u.email, u.phone, u.cargo, u.password, u.role, u.status, JSON.stringify(u.permissions), u.createdAt]);
        result = { success: true };
      }
    }
  } catch (err) {
    result = { success: false, error: err.message };
  }
  
  return createJsonResponse(result, e);
}

function doPost(e) {
  try {
    var contents = JSON.parse(e.postData.contents);
    var action = contents.action;
    var token = contents.token;

    if (!verifyToken(token)) {
      return createJsonResponse({ success: false, error: 'Unauthorized: Invalid Security Token' });
    }
    
    if (action === 'login') {
      var sheet = getSharedSheet('USUARIOS');
      var data = sheet.getDataRange().getValues();
      var userFound = null;
      for (var i = 1; i < data.length; i++) {
        if (String(data[i][2]).toLowerCase() === String(contents.username).toLowerCase() && String(data[i][6]) === String(contents.password)) {
          userFound = {
            id: String(data[i][0]),
            name: String(data[i][1]),
            username: String(data[i][2]),
            role: String(data[i][7]),
            status: String(data[i][8]),
            permissions: JSON.parse(data[i][9] || '[]')
          };
          break;
        }
      }
      if (userFound) return createJsonResponse({ success: true, data: userFound });
      else return createJsonResponse({ success: false, error: 'Credenciales inválidas' });
    }
    else if (action === 'push') {
      var sheet = getSharedSheet('GLOBAL_SYNC');
      if (contents.events) updateOrInsertDbRow(sheet, 'events', JSON.stringify(contents.events));
      if (contents.movements) updateOrInsertDbRow(sheet, 'movements', JSON.stringify(contents.movements));
      if (contents.archivedEvents) updateOrInsertDbRow(sheet, 'archived_events', JSON.stringify(contents.archivedEvents));
      if (contents.notifications) updateOrInsertDbRow(sheet, 'notifications', JSON.stringify(contents.notifications));
      return createJsonResponse({ success: true });
    }
    else if (action === 'pushUsers') {
      // Role Check: Only Admins can push all users
      if (contents.adminRole !== 'admin') {
         return createJsonResponse({ success: false, error: 'Access Denied: Admin role required' });
      }
      var sheet = getSharedSheet('USUARIOS');
      sheet.clear();
      sheet.appendRow(['ID', 'Name', 'Username', 'Email', 'Phone', 'Cargo', 'Password', 'Role', 'Status', 'Permissions', 'CreatedAt']);
      contents.users.forEach(function(u) {
        sheet.appendRow([u.id, u.name, u.username, u.email, u.phone, u.cargo, u.password, u.role, u.status, JSON.stringify(u.permissions), u.createdAt]);
      });
      return createJsonResponse({ success: true });
    }
    else if (action === 'signup') {
      var sheet = getSharedSheet('USUARIOS');
      var u = contents.user;
      
      // Verification: Does user already exist?
      var data = sheet.getDataRange().getValues();
      var exists = false;
      for (var i = 1; i < data.length; i++) {
        if (String(data[i][2]).toLowerCase() === String(u.username).toLowerCase()) {
          exists = true;
          break;
        }
      }
      
      if (exists) {
        return createJsonResponse({ success: false, error: 'Ese nombre de usuario ya existe en el servidor' });
      }
      
      sheet.appendRow([u.id, u.name, u.username, u.email, u.phone, u.cargo, u.password, u.role, u.status, JSON.stringify(u.permissions), u.createdAt]);
      return createJsonResponse({ success: true });
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
