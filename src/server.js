import http from 'http';
import { getBotStatus, getLatestQr, getLatestPairingCode } from './services/whatsapp.js';
import { PORT, IS_CONFIGURED, USE_PAIRING_CODE } from './config/index.js';
import { 
    safeJsonStringify, 
    escapeHtml, 
    serializeForScript, 
    createRateLimiter 
} from './utils/security.js';

// Limitadores de velocidad en memoria para prevenir DoS y fuerza bruta
const apiRateLimiter = createRateLimiter({ windowMs: 60000, maxRequests: 60 });
const healthRateLimiter = createRateLimiter({ windowMs: 60000, maxRequests: 180 });

// Encabezados de seguridad reforzados
const SECURITY_HEADERS = {
    'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: https://api.qrserver.com; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self';",
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '0',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), camera=(), microphone=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
};

function renderDashboardHtml(status, qr, pairingCode) {
    let statusBadge = '';
    let mainContent = '';
    let autoRefreshSec = 0;

    const safeStatus = escapeHtml(status || 'initializing');

    if (status === 'ready') {
        statusBadge = `
            <div class="badge badge-success">
                <span class="indicator pulse-green"></span>
                <span>Conectado y Operativo</span>
            </div>
        `;
        mainContent = `
            <div class="status-card-inner">
                <div class="icon-circle icon-success">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                        <polyline points="22 4 12 14.01 9 11.01"></polyline>
                    </svg>
                </div>
                <h3>WhatsApp Vinculado con Éxito</h3>
                <p class="description">El asistente virtual de contaduría pública está activo con Baileys, escuchando y respondiendo consultas en tiempo real sin sobrecargar la memoria.</p>
                <div class="metrics-grid">
                    <div class="metric-item">
                        <span class="metric-label">Motor de IA</span>
                        <span class="metric-value">Google Gemini</span>
                    </div>
                    <div class="metric-item">
                        <span class="metric-label">Horario Mañana</span>
                        <span class="metric-value">08:30 - 12:30</span>
                    </div>
                    <div class="metric-item">
                        <span class="metric-label">Horario Tarde</span>
                        <span class="metric-value">14:00 - 18:00</span>
                    </div>
                </div>
            </div>
        `;
    } else if (pairingCode) {
        statusBadge = `
            <div class="badge badge-warning">
                <span class="indicator pulse-amber"></span>
                <span>Código de Vinculación Listo</span>
            </div>
        `;
        const safeCode = escapeHtml(pairingCode);
        mainContent = `
            <div class="status-card-inner">
                <div class="pairing-code-box">
                    <span class="pairing-code-text">${safeCode}</span>
                </div>
                <h3>Vincula sin Escanear QR</h3>
                <ol class="instructions-list">
                    <li>Abre WhatsApp en el celular de la contadora.</li>
                    <li>Toca <strong>Dispositivos vinculados</strong> en Configuración / Menú.</li>
                    <li>Toca <strong>Vincular un dispositivo</strong>.</li>
                    <li>Abajo toca <strong>"Vincular con el número de teléfono en su lugar"</strong>.</li>
                    <li>Escribe el código mostrado arriba: <strong>${safeCode}</strong></li>
                </ol>
                <p class="refresh-note">⏳ Escribe este código en tu WhatsApp. El panel actualizará automáticamente al sincronizar.</p>
            </div>
        `;
    } else if (status === 'qr_ready' && qr) {
        statusBadge = `
            <div class="badge badge-warning">
                <span class="indicator pulse-amber"></span>
                <span>Esperando Escaneo de QR</span>
            </div>
        `;
        const qrImgUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(qr)}&size=300x300&margin=10`;
        mainContent = `
            <div class="status-card-inner">
                <div class="qr-container">
                    <img id="qr-image-display" src="${qrImgUrl}" alt="Código QR WhatsApp" class="qr-image" />
                </div>
                <h3>Escanea con tu WhatsApp</h3>
                <ol class="instructions-list">
                    <li>Abre WhatsApp en tu teléfono celular.</li>
                    <li>Toca <strong>Dispositivos vinculados</strong> en Configuración / Menú.</li>
                    <li>Toca <strong>Vincular un dispositivo</strong> y apunta tu cámara a este código.</li>
                </ol>
                <p class="refresh-note">⏳ Apunta la cámara de tu celular. El panel actualizará automáticamente al sincronizar.</p>
            </div>
        `;
    } else if (status === 'disconnected') {
        autoRefreshSec = 6;
        statusBadge = `
            <div class="badge badge-danger">
                <span class="indicator pulse-red"></span>
                <span>Desconectado</span>
            </div>
        `;
        mainContent = `
            <div class="status-card-inner">
                <div class="icon-circle icon-danger">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="15" y1="9" x2="9" y2="15"></line>
                        <line x1="9" y1="9" x2="15" y2="15"></line>
                    </svg>
                </div>
                <h3>Cliente Desconectado</h3>
                <p class="description">El cliente de WhatsApp perdió la conexión. Se está intentando reconectar automáticamente...</p>
            </div>
        `;
    } else {
        autoRefreshSec = 5;
        statusBadge = `
            <div class="badge badge-info">
                <span class="indicator pulse-blue"></span>
                <span>Iniciando Baileys</span>
            </div>
        `;
        mainContent = `
            <div class="status-card-inner">
                <div class="spinner"></div>
                <h3>Iniciando WhatsApp...</h3>
                <p class="description">Conectando al protocolo WebSocket de WhatsApp sin navegador (Ultra bajo consumo de memoria).</p>
                <p class="refresh-note">Generando código de acceso...</p>
            </div>
        `;
    }

    const scriptSafeStatus = serializeForScript(status || '');
    const scriptSafeQr = serializeForScript(qr || '');
    const scriptSafePairing = serializeForScript(pairingCode || '');

    return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Panel de Control | Chatbot Contaduría Pública</title>
    ${autoRefreshSec > 0 ? `<meta http-equiv="refresh" content="${autoRefreshSec}">` : ''}
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg-base: #090d16;
            --bg-card: rgba(18, 24, 38, 0.75);
            --border-card: rgba(255, 255, 255, 0.08);
            --accent: #3b82f6;
            --success: #10b981;
            --warning: #f59e0b;
            --danger: #ef4444;
            --text-main: #f8fafc;
            --text-muted: #94a3b8;
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
            font-family: 'Outfit', sans-serif;
        }

        body {
            background-color: var(--bg-base);
            background-image: 
                radial-gradient(at 0% 0%, rgba(59, 130, 246, 0.15) 0px, transparent 50%),
                radial-gradient(at 100% 100%, rgba(16, 185, 129, 0.1) 0px, transparent 50%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
            color: var(--text-main);
        }

        .dashboard-container {
            width: 100%;
            max-width: 520px;
            background: var(--bg-card);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            border: 1px solid var(--border-card);
            border-radius: 24px;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
            overflow: hidden;
            animation: fadeIn 0.6s cubic-bezier(0.16, 1, 0.3, 1);
        }

        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(16px); }
            to { opacity: 1; transform: translateY(0); }
        }

        .header {
            padding: 28px 28px 20px;
            text-align: center;
            border-bottom: 1px solid var(--border-card);
        }

        .header h1 {
            font-size: 1.4rem;
            font-weight: 700;
            background: linear-gradient(135deg, #ffffff 0%, #cbd5e1 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            margin-bottom: 12px;
        }

        .badge {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 6px 14px;
            border-radius: 9999px;
            font-size: 0.85rem;
            font-weight: 500;
        }

        .badge-success { background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); }
        .badge-warning { background: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3); }
        .badge-danger  { background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); }
        .badge-info    { background: rgba(59, 130, 246, 0.15); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.3); }

        .indicator { width: 8px; height: 8px; border-radius: 50%; }
        .pulse-green { background: #10b981; box-shadow: 0 0 10px #10b981; animation: pulse 2s infinite; }
        .pulse-amber { background: #f59e0b; box-shadow: 0 0 10px #f59e0b; animation: pulse 1.5s infinite; }
        .pulse-red   { background: #ef4444; }
        .pulse-blue  { background: #3b82f6; box-shadow: 0 0 10px #3b82f6; animation: pulse 1.5s infinite; }

        @keyframes pulse {
            0% { transform: scale(0.95); opacity: 0.8; }
            50% { transform: scale(1.2); opacity: 1; }
            100% { transform: scale(0.95); opacity: 0.8; }
        }

        .body { padding: 30px 28px; }
        .status-card-inner { display: flex; flex-direction: column; align-items: center; text-align: center; }

        .icon-circle {
            width: 72px; height: 72px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-bottom: 20px;
        }
        .icon-success { background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3); }
        .icon-danger { background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); }

        .spinner {
            width: 54px; height: 54px; border: 4px solid rgba(59, 130, 246, 0.2); border-top: 4px solid #3b82f6; border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 20px;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        .qr-container {
            background: #ffffff; padding: 16px; border-radius: 18px; box-shadow: 0 15px 30px rgba(0, 0, 0, 0.4); margin-bottom: 22px;
        }
        .qr-image { display: block; width: 240px; height: 240px; border-radius: 8px; }

        .pairing-code-box {
            background: rgba(59, 130, 246, 0.15);
            border: 2px dashed #3b82f6;
            border-radius: 16px;
            padding: 18px 28px;
            margin-bottom: 20px;
        }
        .pairing-code-text {
            font-size: 2.2rem;
            font-weight: 700;
            letter-spacing: 0.2em;
            color: #60a5fa;
            font-family: monospace;
        }

        h3 { font-size: 1.25rem; font-weight: 600; margin-bottom: 10px; color: #ffffff; }
        .description { font-size: 0.95rem; color: var(--text-muted); line-height: 1.5; margin-bottom: 24px; max-width: 400px; }

        .instructions-list {
            text-align: left; background: rgba(255, 255, 255, 0.03); border: 1px solid var(--border-card); border-radius: 14px; padding: 16px 20px 16px 36px; font-size: 0.88rem; color: #cbd5e1; line-height: 1.7; margin-bottom: 18px; width: 100%;
        }
        .instructions-list strong { color: #ffffff; }

        .metrics-grid {
            display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; width: 100%; margin-top: 6px;
        }
        .metric-item {
            background: rgba(255, 255, 255, 0.03); border: 1px solid var(--border-card); border-radius: 14px; padding: 14px 10px; display: flex; flex-direction: column; gap: 4px;
        }
        .metric-label { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); }
        .metric-value { font-size: 0.88rem; font-weight: 600; color: #ffffff; }

        .refresh-note { font-size: 0.8rem; color: #64748b; }
        .footer {
            padding: 18px 28px; border-top: 1px solid var(--border-card); text-align: center; font-size: 0.8rem; color: #64748b; background: rgba(0, 0, 0, 0.15);
        }
        .footer code { background: rgba(255, 255, 255, 0.08); padding: 2px 6px; border-radius: 6px; color: #cbd5e1; }
    </style>
</head>
<body>
    <div class="dashboard-container">
        <header class="header">
            <h1>Despacho de Contaduría Pública</h1>
            ${statusBadge}
        </header>
        <main class="body">
            ${mainContent}
        </main>
        <footer class="footer">
            Monitoreo activo y ultra ligero en <code>/health</code>
        </footer>
    </div>
    <script>
        const initialStatus = ${scriptSafeStatus};
        let currentQrString = ${scriptSafeQr};
        let currentPairingString = ${scriptSafePairing};

        setInterval(async () => {
            try {
                const res = await fetch('/status');
                if (!res.ok) return;
                const data = await res.json();

                if (data.whatsappStatus !== initialStatus || data.pairingCode !== currentPairingString) {
                    window.location.reload();
                    return;
                }

                if (data.qr && data.qr !== currentQrString) {
                    currentQrString = data.qr;
                    const img = document.getElementById('qr-image-display');
                    if (img) {
                        img.src = 'https://api.qrserver.com/v1/create-qr-code/?data=' + encodeURIComponent(data.qr) + '&size=300x300&margin=10';
                    } else {
                        window.location.reload();
                    }
                }
            } catch (e) {}
        }, 2500);
    </script>
</body>
</html>`;
}

export function startWebServer(portOverride = null) {
    const listenPort = portOverride || PORT;
    const server = http.createServer((req, res) => {
        // 1. Validar longitud de URL
        if (req.url && req.url.length > 2048) {
            res.writeHead(414, { 'Content-Type': 'text/plain; charset=utf-8' });
            return res.end('414 URI Too Long');
        }

        // 2. Encabezados de seguridad
        for (const [header, val] of Object.entries(SECURITY_HEADERS)) {
            res.setHeader(header, val);
        }

        // 3. Restringir métodos
        if (req.method !== 'GET' && req.method !== 'HEAD') {
            res.writeHead(405, { 
                'Content-Type': 'application/json; charset=utf-8',
                'Allow': 'GET, HEAD' 
            });
            return res.end(safeJsonStringify({ error: 'Método no permitido. Solo se aceptan solicitudes GET o HEAD.' }));
        }

        const clientIp = req.headers['x-forwarded-for'] 
            ? req.headers['x-forwarded-for'].split(',')[0].trim() 
            : (req.socket.remoteAddress || '127.0.0.1');

        let pathname = '/';
        try {
            const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
            pathname = parsedUrl.pathname;
        } catch (urlErr) {
            res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
            return res.end('400 Bad Request');
        }

        // 4. Endpoint de Healthcheck para Render
        if (pathname === '/health' || pathname === '/healthz' || pathname === '/ping' || pathname === '/healthcheck') {
            if (!healthRateLimiter(clientIp)) {
                res.writeHead(429, { 'Content-Type': 'application/json; charset=utf-8', 'Retry-After': '60' });
                return res.end(safeJsonStringify({ error: 'Demasiadas solicitudes de monitoreo.' }));
            }

            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            if (req.method === 'HEAD') return res.end();

            const memMb = Math.round(process.memoryUsage().rss / 1024 / 1024);
            const healthPayload = {
                status: 'ok',
                service: 'chatbot-contaduria',
                uptimeSeconds: Math.floor(process.uptime()),
                memoryUsageMB: memMb,
                memoryStatus: memMb < 250 ? 'EXCELLENT (<250MB)' : 'NORMAL',
                whatsappStatus: getBotStatus(),
                isConfigured: IS_CONFIGURED,
                timestamp: new Date().toISOString()
            };
            return res.end(safeJsonStringify(healthPayload));
        }

        // 5. Rate limit general
        if (!apiRateLimiter(clientIp)) {
            res.writeHead(429, { 
                'Content-Type': 'application/json; charset=utf-8',
                'Retry-After': '60'
            });
            return res.end(safeJsonStringify({ error: 'Límite de solicitudes excedido. Intenta más tarde.' }));
        }

        // 6. Endpoint de estado JSON
        if (pathname === '/status') {
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            if (req.method === 'HEAD') return res.end();

            const statusPayload = {
                status: 'running',
                whatsappStatus: getBotStatus(),
                hasQr: Boolean(getLatestQr()),
                qr: getLatestQr() || null,
                pairingCode: getLatestPairingCode() || null,
                isConfigured: IS_CONFIGURED,
                timestamp: new Date().toISOString()
            };
            return res.end(safeJsonStringify(statusPayload));
        }

        // 7. Panel Web para escanear QR o ver Pairing Code
        if (pathname === '/qr' || pathname === '/') {
            const status = getBotStatus();
            const qr = getLatestQr();
            const pairingCode = getLatestPairingCode();

            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            if (req.method === 'HEAD') return res.end();

            return res.end(renderDashboardHtml(status, qr, pairingCode));
        }

        // 8. 404
        res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(safeJsonStringify({ error: 'Ruta no encontrada' }));
    });

    server.listen(listenPort, '0.0.0.0', () => {
        console.log(`[Web Server] Servidor web activo en el puerto ${listenPort}`);
        console.log(`[Web Server] Healthcheck de Render en: /health`);
        console.log(`[Web Server] Panel de vinculación en: /qr o /`);
    });

    return server;
}
