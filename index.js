const { startWhatsAppClient, stopWhatsAppClient } = require('./src/services/whatsapp');
const { startWebServer } = require('./src/server');
const { redactSensitiveData } = require('./src/utils/security');

console.log('Iniciando el Chatbot de Contaduría Pública...');

// 1. Iniciar servidor web HTTP (requerido inmediatamente por Render para healthchecks en /health)
const server = startWebServer();

// 2. Iniciar cliente de WhatsApp Web en segundo plano
startWhatsAppClient();

// 3. Compactación proactiva de memoria en Node.js para 512MB RAM
if (typeof global.gc === 'function') {
    setInterval(() => {
        try {
            global.gc();
        } catch (e) {}
    }, 60000).unref();
}

// 4. Manejo de señales de apagado limpio (Render envía SIGTERM durante despliegues)
let isShuttingDown = false;
async function gracefulShutdown(signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`[Process] Recibida señal ${signal}. Cerrando servicios de manera segura...`);

    try {
        // Cerrar cliente de WhatsApp Web
        await stopWhatsAppClient();
    } catch (err) {
        console.error('[Process Error al cerrar WhatsApp]:', redactSensitiveData(err));
    }

    try {
        // Cerrar servidor HTTP
        server.close(() => {
            console.log('[Process] Servidor HTTP cerrado correctamente.');
            process.exit(0);
        });
    } catch (err) {
        process.exit(0);
    }

    // Forzar cierre tras 10 segundos en caso de que quede algún socket bloqueado
    setTimeout(() => {
        console.warn('[Process] Forzando salida tras tiempo de espera.');
        process.exit(0);
    }, 10000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// 4. Manejo global de excepciones no capturadas con ofuscación de credenciales
process.on('unhandledRejection', (reason, promise) => {
    console.error('[Process] Unhandled Rejection:', redactSensitiveData(reason));
});

process.on('uncaughtException', (err) => {
    console.error('[Process] Uncaught Exception:', redactSensitiveData(err));
});
