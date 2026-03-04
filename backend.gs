/**
 * Google Apps Script - Backend for Inventory App
 * 
 * Instructions:
 * 1. Go to script.google.com and create a new project.
 * 2. Paste this code into Code.gs.
 * 3. Create a Google Sheet, name the tabs: "Usuarios", "Inventario", "Historial", "Eventos".
 * 4. Replace SPREADSHEET_ID with your Google Sheet ID.
 * 5. Deploy -> New Deployment -> Select "Web app".
 *    - Execute as: Me
 *    - Who has access: Anyone (or Anyone with Google Account depending on your org).
 * 6. Copy the Web App URL and paste it into `api.js`.
 */

const SPREADSHEET_ID = 'TU_SPREADSHEET_ID_AQUI'; // <--- UPDATE THIS

function doPost(e) {
  return handleRequest(e);
}

function doGet(e) {
  // Can be used for testing or simple GETs
  return handleRequest(e);
}

function handleRequest(e) {
  let response = { success: false, message: 'Invalid request' };
  
  try {
    const payload = e.postData ? JSON.parse(e.postData.contents) : e.parameter;
    const action = payload.action;

    if (!action) throw new Error("No action provided");

    switch (action) {
      case 'getDashboardStats':
        response = getDashboardStats();
        break;
      case 'getInventory':
        response = getSheetData('Inventario');
        break;
      case 'getHistory':
        response = getSheetData('Historial');
        break;
      case 'getEvents':
        response = getSheetData('Eventos');
        break;
      case 'processScan':
        response = processScan(payload.data); // data: { code, actionType (in/out), user, date }
        break;
      default:
        throw new Error("Unknown action: " + action);
    }
    
    response.success = true;
  } catch (error) {
    response.success = false;
    response.error = error.toString();
  }

  // Return standard JSON response
  return ContentService.createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSheetData(sheetName) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(sheetName);
  if (!sheet) throw new Error("Sheet not found: " + sheetName);
  
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return { items: [] }; // Only headers or empty
  
  const headers = data[0];
  const items = [];
  
  for (let i = 1; i < data.length; i++) {
    let row = data[i];
    let obj = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = row[j];
    }
    items.push(obj);
  }
  
  return { items: items };
}

function getDashboardStats() {
  const invData = getSheetData('Inventario').items;
  const historyData = getSheetData('Historial').items;
  
  let total = invData.length;
  let prestamos = invData.filter(item => item.Estado === 'En Préstamo').length;
  let disponibles = invData.filter(item => item.Estado === 'Disponible').length;
  
  // Get 5 most recent movements (assuming last in sheet is most recent)
  let recents = historyData.slice(-5).reverse();
  
  return {
    stats: { total, prestamos, disponibles },
    recents: recents
  };
}

function processScan(data) {
  const { code, type, user, timestamp } = data; // type: 'entrada' or 'salida'
  const sheetInv = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Inventario');
  const sheetHist = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Historial');
  
  // 1. Find item in Inventory
  const invData = sheetInv.getDataRange().getValues();
  let rowIndex = -1;
  let itemData = null;
  const headers = invData[0];
  const codeIndex = headers.indexOf('Codigo'); // Assume 'Codigo' is the column name
  const statusIndex = headers.indexOf('Estado'); // Assume 'Estado' is the column name
  
  if (codeIndex === -1 || statusIndex === -1) throw new Error("Columns Codigo or Estado not found in Inventario");

  for (let i = 1; i < invData.length; i++) {
    if (String(invData[i][codeIndex]) === String(code)) {
      rowIndex = i + 1; // Google Sheets is 1-indexed, +1 because loop is 0-indexed relative to array
      itemData = invData[i];
      break;
    }
  }

  if (rowIndex === -1) {
    throw new Error("El equipo con código " + code + " no está registrado en el inventario.");
  }

  const newStatus = type === 'salida' ? 'En Préstamo' : 'Disponible';
  
  // Check valid flow
  if (itemData[statusIndex] === 'En Préstamo' && type === 'salida') {
     throw new Error("El equipo ya se encuentra en préstamo.");
  }
  if (itemData[statusIndex] === 'Disponible' && type === 'entrada') {
     throw new Error("El equipo ya se encuentra disponible.");
  }

  // 2. Update Inventory
  sheetInv.getRange(rowIndex, statusIndex + 1).setValue(newStatus);
  
  // 3. Log into History
  // Assume Historial has columns: Fecha, Codigo, Equipo, Accion, Usuario
  const currentItemName = itemData[headers.indexOf('Nombre')] || "Desconocido"; // Assume 'Nombre' exists
  sheetHist.appendRow([timestamp, code, currentItemName, type.toUpperCase(), user]);

  return { message: "Movimiento registrado exitosamente." };
}
