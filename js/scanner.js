// Scanner.js - Handles html5-qrcode integration and asynchronous backend processing

let html5QrcodeScanner = null;
const SCAN_MODAL = document.getElementById('modal-scanner');

document.getElementById('btn-scan-main')?.addEventListener('click', () => {
    // Validate Auth
    if (!AuthState.isLoggedIn) {
        UI.showToast("Debes iniciar sesión para escanear", "error");
        return;
    }
    openScanner();
});

document.querySelector('.close-modal')?.addEventListener('click', closeScanner);

function openScanner() {
    SCAN_MODAL.classList.remove('hidden');

    if (!html5QrcodeScanner) {
        html5QrcodeScanner = new Html5Qrcode("reader");
    }

    const config = { fps: 10, qrbox: { width: 250, height: 250 } };

    // Request camera and start scanning
    html5QrcodeScanner.start(
        { facingMode: "environment" }, // Prefer back camera on mobile
        config,
        onScanSuccess,
        onScanError
    ).catch(err => {
        console.error("Camera start error:", err);
        UI.showToast("Error al iniciar la cámara. Verifica los permisos.", "error");
    });
}

function closeScanner() {
    SCAN_MODAL.classList.add('hidden');
    if (html5QrcodeScanner && html5QrcodeScanner.isScanning) {
        html5QrcodeScanner.stop().catch(err => console.error("Error stopping scanner", err));
    }
}

async function onScanSuccess(decodedText, decodedResult) {
    // Stop scanning immediately to prevent duplicate scans
    html5QrcodeScanner.pause(true);

    // Play a beep sound if desired, or vibrate on mobile
    if (navigator.vibrate) navigator.vibrate(200);

    // Prompt user for Action: Check-in (Entrada) or Check-out (Salida)
    // In a real app, this could be buttons inside the modal, using JS confirm for simplicity here
    const isSalida = confirm(`Código detectado: ${decodedText}\n\n¿Es una SALIDA a Préstamo?\n[Aceptar] = SALIDA\n[Cancelar] = ENTRADA (Devolución)`);
    const actionType = isSalida ? 'salida' : 'entrada';

    await processScanData(decodedText, actionType);

    // Resume scanner or close modal
    closeScanner();
}

function onScanError(errorMessage) {
    // Ignore routine scan errors (not finding a code in current frame)
    // console.warn(errorMessage);
}

// Handle asynchronous communication to avoid freezing
async function processScanData(code, type) {
    // No more UI block/loader here, instant UI update!
    try {
        const response = await DB.mutate('processScan', {
            code: code,
            type: type,
            user: AuthState.user.username,
            timestamp: new Date().toISOString()
        });

        // Let the user know it was saved (at least locally)
        UI.showToast(response.message, "success");
    } catch (err) {
        console.error("Error processScan:", err);
        UI.showToast("Error crítico al procesar escaneo", "error");
    }
}

// Manual entry fallback
document.getElementById('btn-manual-entry')?.addEventListener('click', async () => {
    const code = prompt("Ingresa el código manualmente:");
    if (code) {
        const isSalida = confirm(`Código: ${code}\n\n¿Es una SALIDA a Préstamo?\n[Aceptar] = SALIDA\n[Cancelar] = ENTRADA (Devolución)`);
        closeScanner();
        await processScanData(code, isSalida ? 'salida' : 'entrada');
    }
});
