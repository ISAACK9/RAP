$API_URL = "https://script.google.com/macros/s/AKfycbzT7OIAlgLhved2naO9FKz4PiBn_2VSl9CK7epvZc8mr3hWcJpo4i77Kt3Mmr6kJ1V6eQ/exec"
$API_TOKEN = "RAP_SECURE_TOKEN_2026_V1_ISAAC"

$adminUser = @{
    id          = "admin-001"
    name        = "Isaac Contreras"
    username    = "ISAAC"
    email       = "isaac@rap.mx"
    phone       = ""
    cargo       = "Administrador"
    password    = "CONTRERAS9"
    role        = "admin"
    status      = "active"
    permissions = @("inventario", "escaneo", "eventos", "eventos_edit", "movimientos", "estadisticas")
    createdAt   = (Get-Date -Format "yyyy-MM-ddTHH:mm:ss.fffZ")
}

Write-Host "Resetting Users..."
$body1 = @{
    action    = "pushUsers"
    token     = $API_TOKEN
    adminRole = "admin"
    users     = @($adminUser)
} | ConvertTo-Json -Depth 10

try {
    Invoke-RestMethod -Uri $API_URL -Method Post -Body $body1 -ContentType "application/json"
}
catch {
    Write-Host "⚠️ ERROR DE ACCESO: El script de Google no es público o el Token es incorrecto." -ForegroundColor Yellow
    Write-Host "Asegúrate de que el despliegue esté configurado para 'Anyone' (Cualquier persona)." -ForegroundColor Gray
    # No terminamos el script para intentar el siguiente paso
}

Write-Host "Resetting Notifications..."
$body2 = @{
    action        = "push"
    token         = $API_TOKEN
    notifications = @()
} | ConvertTo-Json

try {
    Invoke-RestMethod -Uri $API_URL -Method Post -Body $body2 -ContentType "application/json"
}
catch {
    Write-Host "⚠️ ERROR DE ACCESO: No se pudo conectar con el servidor para notificaciones." -ForegroundColor Yellow
}

Write-Host "Reset complete."
