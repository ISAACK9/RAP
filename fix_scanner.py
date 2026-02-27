import os

file_path = r'c:\Users\admin3\Desktop\Prueba RAP\app.js'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# I will find the block starting around line 2988 and ending around 3066
# I'll use a very specific unique search string from the beginning and end of the block.

anchor_start = '    if (ev) {'
anchor_search = '// Búsqueda del grupo correspondiente en el evento'
anchor_end = '      return;\n    }\n  }'

# Let's find the start of the processScanResult section for safety
start_index = content.find('function processScanResult(code) {')
if start_index == -1:
    print("Could not find function processScanResult")
    exit(1)

# Find the specific 'if (ev) {' after it
if_ev_index = content.find(anchor_start, start_index)
if if_ev_index == -1:
    print("Could not find 'if (ev) {'")
    exit(1)

# Find the closing brace of that block. 
# It's at 3066 in my view_file output.
# I'll find the next 'return;' and '}' following the if(ev) block.

# New robust logic
new_logic = """    if (ev) {
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
    }"""

# I'll replace from if_ev_index to the closing brace.
# To find the true closing brace, I'll count braces or find the return; branch.
# In the current file:
# 3065:       return;
# 3066:     }
# 3067:   }

# I'll find the next 'return;' and then the next '}' and then another '}'
end_search = 'return;\n    }\n  }'
end_index = content.find(end_search, if_ev_index)

if end_index == -1:
    print("Could not find end anchor")
    exit(1)

final_end = end_index + len(end_search) - 5 # Keep the last brace of the outer block

new_content = content[:if_ev_index] + new_logic + content[final_end:]

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(new_content)

print("SUCCESS: processScanResult updated.")
