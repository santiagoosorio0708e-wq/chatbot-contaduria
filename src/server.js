const http = require('http');
const { getBotStatus, getLatestQr } = require('./services/whatsapp');
const { BUSINESS_MORNING_START, BUSINESS_MORNING_END, BUSINESS_AFTERNOON_START, BUSINESS_AFTERNOON_END } = require('./config');

const PORT = process.env.PORT || 3000;

function renderDashboardHtml(status, qr) {
    let statusBadge = '';
    let mainContent = '';
    let autoRefreshSec = 0;

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
                <p class="description">El asistente virtual de contaduría pública está activo, escuchando y respondiendo consultas en tiempo real.</p>
                <div class="metrics-grid">
                    <div class="metric-item">
                        <span class="metric-label">Motor de IA</span>
                        <span class="metric-value">Google Gemini</span>
                    </div>
                    <div class="metric-item">
                        <span class="metric-label">Horario Mañana</span>
                        <span class="metric-value">${BUSINESS_MORNING_START} - ${BUSINESS_MORNING_END}</span>
                    </div>
                    <div class="metric-item">
                        <span class="metric-label">Horario Tarde</span>
                        <span class="metric-value">${BUSINESS_AFTERNOON_START} - ${BUSINESS_AFTERNOON_END}</span>
                    </div>
                </div>
            </div>
        `;
    } else if (status === 'qr_ready' && qr) {
        autoRefreshSec = 10;
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
                    <img src="${qrImgUrl}" alt="Código QR WhatsApp" class="qr-image" />
                </div>
                <h3>Escanea con tu WhatsApp</h3>
                <ol class="instructions-list">
                    <li>Abre WhatsApp en tu teléfono celular.</li>
                    <li>Toca <strong>Dispositivos vinculados</strong> en Configuración / Menú.</li>
                    <li>Toca <strong>Vincular un dispositivo</strong> y apunta tu cámara a este código.</li>
                </ol>
                <p class="refresh-note">⏳ La página se actualiza automáticamente cada ${autoRefreshSec}s para renovar el código o confirmar la conexión.</p>
            </div>
        `;
    } else if (status === 'disconnected') {
        autoRefreshSec = 5;
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
        autoRefreshSec = 6;
        statusBadge = `
            <div class="badge badge-info">
                <span class="indicator pulse-blue"></span>
                <span>Iniciando Navegador</span>
            </div>
        `;
        mainContent = `
            <div class="status-card-inner">
                <div class="spinner"></div>
                <h3>Inicializando WhatsApp Web...</h3>
                <p class="description">Estamos arrancando la sesión de Puppeteer y Chromium en segundo plano. Esto puede tomar unos segundos.</p>
                <p class="refresh-note">Actualizando automáticamente...</p>
            </div>
        `;
    }

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
            --accent-glow: rgba(59, 130, 246, 0.35);
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
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 80px rgba(59, 130, 246, 0.1);
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
            letter-spacing: -0.02em;
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
            letter-spacing: 0.01em;
        }

        .badge-success {
            background: rgba(16, 185, 129, 0.15);
            color: #34d399;
            border: 1px solid rgba(16, 185, 129, 0.3);
        }

        .badge-warning {
            background: rgba(245, 158, 11, 0.15);
            color: #fbbf24;
            border: 1px solid rgba(245, 158, 11, 0.3);
        }

        .badge-danger {
            background: rgba(239, 68, 68, 0.15);
            color: #f87171;
            border: 1px solid rgba(239, 68, 68, 0.3);
        }

        .badge-info {
            background: rgba(59, 130, 246, 0.15);
            color: #60a5fa;
            border: 1px solid rgba(59, 130, 246, 0.3);
        }

        .indicator {
            width: 8px;
            height: 8px;
            border-radius: 50%;
        }

        .pulse-green { background: #10b981; box-shadow: 0 0 10px #10b981; animation: pulse 2s infinite; }
        .pulse-amber { background: #f59e0b; box-shadow: 0 0 10px #f59e0b; animation: pulse 1.5s infinite; }
        .pulse-red   { background: #ef4444; box-shadow: 0 0 10px #ef4444; }
        .pulse-blue  { background: #3b82f6; box-shadow: 0 0 10px #3b82f6; animation: pulse 1.5s infinite; }

        @keyframes pulse {
            0% { transform: scale(0.95); opacity: 0.8; }
            50% { transform: scale(1.2); opacity: 1; }
            100% { transform: scale(0.95); opacity: 0.8; }
        }

        .body {
            padding: 30px 28px;
        }

        .status-card-inner {
            display: flex;
            flex-direction: column;
            align-items: center;
            text-align: center;
        }

        .icon-circle {
            width: 72px;
            height: 72px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin-bottom: 20px;
        }

        .icon-success {
            background: rgba(16, 185, 129, 0.15);
            color: #10b981;
            border: 1px solid rgba(16, 185, 129, 0.3);
        }

        .icon-danger {
            background: rgba(239, 68, 68, 0.15);
            color: #ef4444;
            border: 1px solid rgba(239, 68, 68, 0.3);
        }

        .spinner {
            width: 54px;
            height: 54px;
            border: 4px solid rgba(59, 130, 246, 0.2);
            border-top: 4px solid #3b82f6;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin-bottom: 20px;
        }

        @keyframes spin {
            to { transform: rotate(360deg); }
        }

        .qr-container {
            background: #ffffff;
            padding: 16px;
            border-radius: 18px;
            box-shadow: 0 15px 30px rgba(0, 0, 0, 0.4);
            margin-bottom: 22px;
            transition: transform 0.2s ease;
        }

        .qr-image {
            display: block;
            width: 240px;
            height: 240px;
            border-radius: 8px;
        }

        h3 {
            font-size: 1.25rem;
            font-weight: 600;
            margin-bottom: 10px;
            color: #ffffff;
        }

        .description {
            font-size: 0.95rem;
            color: var(--text-muted);
            line-height: 1.5;
            margin-bottom: 24px;
            max-width: 400px;
        }

        .instructions-list {
            text-align: left;
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid var(--border-card);
            border-radius: 14px;
            padding: 16px 20px 16px 36px;
            font-size: 0.88rem;
            color: #cbd5e1;
            line-height: 1.7;
            margin-bottom: 18px;
            width: 100%;
        }

        .instructions-list strong {
            color: #ffffff;
        }

        .metrics-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 12px;
            width: 100%;
            margin-top: 6px;
        }

        .metric-item {
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid var(--border-card);
            border-radius: 14px;
            padding: 14px 10px;
            display: flex;
            flex-direction: column;
            gap: 4px;
        }

        .metric-label {
            font-size: 0.72rem;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: var(--text-muted);
        }

        .metric-value {
            font-size: 0.88rem;
            font-weight: 600;
            color: #ffffff;
        }

        .refresh-note {
            font-size: 0.8rem;
            color: #64748b;
        }

        .footer {
            padding: 18px 28px;
            border-top: 1px solid var(--border-card);
            text-align: center;
            font-size: 0.8rem;
            color: #64748b;
            background: rgba(0, 0, 0, 0.15);
        }

        .footer a {
            color: #38bdf8;
            text-decoration: none;
            transition: color 0.2s;
        }

        .footer a:hover {
            color: #7dd3fc;
        }
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
            Endpoint de monitoreo 24/7 activo en <code>/health</code>
        </footer>
    </div>
</body>
</html>`;
}

function startWebServer() {
    const server = http.createServer((req, res) => {
        const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        
        // 1. Healthcheck para Render y monitores externos (soporta /health, /healthz, /ping, /healthcheck)
        if (url.pathname === '/health' || url.pathname === '/healthz' || url.pathname === '/ping' || url.pathname === '/healthcheck') {
            res.writeHead(200, { 
                'Content-Type': 'application/json; charset=utf-8',
                'Cache-Control': 'no-cache, no-store, must-revalidate'
            });
            return res.end(JSON.stringify({ 
                status: 'ok', 
                service: 'chatbot-contaduria',
                uptimeSeconds: Math.floor(process.uptime()),
                whatsappStatus: getBotStatus(),
                timestamp: new Date().toISOString()
            }));
        }

        // 2. Estado en formato JSON
        if (url.pathname === '/status') {
            res.writeHead(200, { 
                'Content-Type': 'application/json; charset=utf-8',
                'Cache-Control': 'no-cache, no-store, must-revalidate'
            });
            return res.end(JSON.stringify({
                status: 'running',
                whatsappStatus: getBotStatus(),
                hasQr: Boolean(getLatestQr()),
                timestamp: new Date().toISOString()
            }));
        }

        // 3. Panel Web visual (interfaz para escanear QR o verificar estado)
        if (url.pathname === '/qr' || url.pathname === '/') {
            const status = getBotStatus();
            const qr = getLatestQr();

            res.writeHead(200, { 
                'Content-Type': 'text/html; charset=utf-8',
                'Cache-Control': 'no-cache, no-store, must-revalidate'
            });
            return res.end(renderDashboardHtml(status, qr));
        }

        // 4. Ruta no encontrada
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404 Not Found');
    });

    server.listen(PORT, '0.0.0.0', () => {
        console.log(`[Web Server] Servidor web listo en el puerto ${PORT}`);
        console.log(`[Web Server] Escaneo visual disponible en: /qr`);
    });

    return server;
}

module.exports = {
    startWebServer
};
