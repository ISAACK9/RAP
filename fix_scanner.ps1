$content = Get-Content -Path "c:\Users\admin3\Desktop\Prueba RAP\app.js" -Raw
$anchorStart = "    if (ev) {"
$anchorEnd = "return;`r?`n    }`r?`n  }"

# Search for the block. 
# We'll use a regex to replace everything between 'if (ev) {' and the next closing logic of processScanResult.

$newLogic = @"
    if (ev) {
      const modelToFind = (masterEquip.descripcion || '').trim().toLowerCase();
      let foundInEvent = false;

      // Buscar si este ID ya está en alguna categoría de este evento (REGRESO)
      let checkinGroup = null;
      let checkoutGroup = null;

      for (const items of Object.values(ev.categories)) {
        const existing = items.find(g => g.scannedIds.includes(masterEquip.id));
        if (existing) {
          checkinGroup = existing;
          break;
        }
        if (!checkoutGroup) {
          checkoutGroup = items.find(g => (g.model || '').trim().toLowerCase() === modelToFind && g.doneCount < g.qty);
        }
      }

      const user = getCurrentUser();

      if (checkinGroup) {
        // --- LÓGICA DE DEVOLUCIÓN (RESTAR) ---
        checkinGroup.doneCount = Math.max(0, checkinGroup.doneCount - 1);
        checkinGroup.scannedIds = checkinGroup.scannedIds.filter(id => id !== masterEquip.id);
        ev.fin = true; 
        masterEquip.estado = 'Disponible';
        
        movimientos.unshift({
           equip: masterEquip.nombre, id: masterEquip.id, evento: ev.title,
           tipo: 'Entrada', time: 'Justo ahora', resp: user ? user.username : 'Sistema'
        });
        saveMovimientos(movimientos);
        saveEvents(checkData);
        saveItemsToDB(window.equipos);
        foundInEvent = true;
        showToast(`✓ REGRESO detectado: ${masterEquip.id} devuelto.`);
      } else if (checkoutGroup) {
        // --- LÓGICA DE SALIDA (SUMAR) ---
        checkoutGroup.doneCount++;
        checkoutGroup.scannedIds.push(masterEquip.id);
        masterEquip.estado = 'En Evento';

        movimientos.unshift({
           equip: masterEquip.nombre, id: masterEquip.id, evento: ev.title,
           tipo: 'Salida', time: 'Justo ahora', resp: user ? user.username : 'Sistema'
        });
        saveMovimientos(movimientos);
        saveEvents(checkData);
        saveItemsToDB(window.equipos);
        foundInEvent = true;
        showToast(`✓ SALIDA detectada: ${masterEquip.id} cargado.`);
      }

      if (foundInEvent) {
        openEvent(currentOpenEventKey);
        if (typeof renderMovimientos === 'function') renderMovimientos();
        return;
      }

      if (!foundInEvent) {
        showToast(`⚠️ El equipo ${masterEquip.id} no puede procesarse: ya se completó o no se solicitó.`);
        return;
      }
    }
"@

# We'll use a very specific regex that matches the start of the if(ev) block 
# and goes until the return; } } at the end.
# Escaping for regex
$startTag = "    if \(ev\) \{"
$endTag = "      return;\r?\n    \}\r?\n  \}"

# Perform the regex replace. 
# (?s) makes it match across newlines.
$regex = "(?s)$startTag.*?$endTag"
$newFileContent = $content -replace $regex, $newLogic

[System.IO.File]::WriteAllText("c:\Users\admin3\Desktop\Prueba RAP\app.js", $newFileContent)
Write-Output "SUCCESS: app.js updated via PowerShell."
