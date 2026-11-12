import 'dotenv/config';
import { startWhatsAppClient, stopWhatsAppClient } from './src/services/whatsapp.js';
import { startWebServer } from './src/server.js';
import { redactSensitiveData } from './src/utils/security.js';

console.log('================================================================');
console.log('📊 INICIANDO CHATBOT DE CONTADURÍA PÚBLICA (RENDER FREE READY)');
console.log('================================================================');

// 1. Iniciar servidor web HTTP (requerido inmediatamente por Render para healthchecks en /health)
const server = startWebServer();

// 2. Iniciar cliente de WhatsApp con Baileys en segundo plano (ultra bajo consumo de RAM)
startWhatsAppClient().catch(err => {
    console.error('❌ Error al iniciar el cliente de WhatsApp:', redactSensitiveData(err.message));
});

// 3. Manejo de señales de apagado limpio (Render envía SIGTERM durante despliegues)
let isShuttingDown = false;
async function gracefulShutdown(signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`[Process] Recibida señal ${signal}. Cerrando servicios de manera segura...`);

    try {
        await stopWhatsAppClient();
    } catch (err) {
        console.error('[Process Error al cerrar WhatsApp]:', redactSensitiveData(err));
    }

    try {
        server.close(() => {
            console.log('[Process] Servidor HTTP cerrado correctamente.');
            process.exit(0);
        });
    } catch (err) {
        process.exit(0);
    }

    setTimeout(() => {
        process.exit(0);
    }, 5000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// 4. Capturadores globales de errores para garantizar que el bot nunca se caiga
process.on('unhandledRejection', (reason) => {
    console.error('🛡️ [Error Protegido - unhandledRejection]:', redactSensitiveData(reason));
});

process.on('uncaughtException', (err) => {
    console.error('🛡️ [Error Protegido - uncaughtException]:', redactSensitiveData(err.message));
});
