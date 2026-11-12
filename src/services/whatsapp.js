const fs = require('fs');
const path = require('path');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { getChatbotResponse } = require('./gemini');
const { isWithinBusinessHours } = require('../utils/hours');
const { sanitizeInput, redactSensitiveData } = require('../utils/security');
const { PUPPETEER_EXECUTABLE_PATH, WWEBJS_DATA_PATH } = require('../config');

// Limpieza proactiva de bloqueos residuales de Chromium (SingletonLock/DevToolsActivePort)
// que impiden que Chrome arranque tras reinicios inesperados en contenedores o Render
function cleanupChromeLocks(baseDir) {
    if (!baseDir || !fs.existsSync(baseDir)) return;
    try {
        const scanAndClean = (dir) => {
            const files = fs.readdirSync(dir, { withFileTypes: true });
            for (const file of files) {
                const fullPath = path.join(dir, file.name);
                if (file.isDirectory()) {
                    scanAndClean(fullPath);
                } else if (file.name.startsWith('Singleton') || file.name === 'DevToolsActivePort') {
                    try {
                        fs.unlinkSync(fullPath);
                        console.log(`[WhatsApp] Archivo residual de bloqueo eliminado: ${file.name}`);
                    } catch (e) {}
                }
            }
        };
        scanAndClean(baseDir);
    } catch (e) {}
}

// Estructuras de control en memoria con límites para evitar fugas de memoria (Memory Leaks en 512MB RAM)
const MAX_STORED_CHATS = 500;
const mutedChats = new Set();
const chatHistory = new Map();
const outOfHoursNotified = new Map();
const presentationNotified = new Map();

/**
 * Limpia entradas antiguas de un Map si supera el límite de seguridad.
 * @param {Map} map 
 */
function pruneMap(map) {
    if (map.size > MAX_STORED_CHATS) {
        const keysToDelete = Array.from(map.keys()).slice(0, 100);
        for (const k of keysToDelete) {
            map.delete(k);
        }
    }
}

// Estado global del cliente para el panel de monitoreo y Render
let botStatus = 'initializing';
let latestQr = null;

// Capturamos el momento exacto en el que el bot arranca
const startupTime = Math.floor(Date.now() / 1000);

// Flags optimizados y limpios para ejecutar Chromium en Linux y Docker
// Incluye --disable-blink-features=AutomationControlled para ocultar navigator.webdriver
// y prevenir que WhatsApp rechace el emparejamiento con 'no conectado / revise la conexión'
const puppeteerArgs = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--no-first-run',
    '--no-zygote',
    '--disable-gpu',
    '--mute-audio',
    '--no-default-browser-check',
    '--disable-blink-features=AutomationControlled'
];

let client = null;

function createClientInstance() {
    return new Client({
        authStrategy: new LocalAuth({
            dataPath: WWEBJS_DATA_PATH
        }),
        webVersionCache: {
            type: 'none'
        },
        authTimeoutMs: 120000, // 120 segundos para evitar timeouts prematuros de WebSocket
        takeoverOnConflict: true,
        takeoverTimeoutMs: 0,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
        puppeteer: {
            headless: true,
            bypassCSP: true,
            protocolTimeout: 300000,
            executablePath: PUPPETEER_EXECUTABLE_PATH || undefined,
            args: puppeteerArgs
        }
    });
}

client = createClientInstance();

client.on('qr', (qr) => {
    latestQr = qr;
    botStatus = 'qr_ready';
    console.log('[WhatsApp] Nuevo código QR generado. Visualízalo en terminal o en el panel web /qr');
    try {
        qrcode.generate(qr, { small: true });
    } catch (e) {
        // Ignorar si terminal no soporta QR
    }
});

client.on('loading_screen', (percent, message) => {
    console.log(`[WhatsApp Cargando] ${percent}% - ${message || ''}`);
});

client.on('authenticated', () => {
    console.log('[WhatsApp] Cliente autenticado exitosamente!');
    latestQr = null;
});

client.on('auth_failure', (msg) => {
    console.error('[WhatsApp Error de autenticación]:', redactSensitiveData(msg));
    botStatus = 'auth_failure';
    latestQr = null;
});

client.on('ready', () => {
    console.log('[WhatsApp] ¡Cliente de WhatsApp listo y conectado!');
    botStatus = 'ready';
    latestQr = null;
});

let isReconnecting = false;
client.on('disconnected', (reason) => {
    console.warn(`[WhatsApp] Cliente desconectado. Razón: ${reason}`);
    botStatus = 'disconnected';
    latestQr = null;
    
    if (isReconnecting) return;
    isReconnecting = true;

    // Intento de reconexión con espera exponencial segura
    setTimeout(async () => {
        console.log('[WhatsApp] Intentando re-inicializar cliente de WhatsApp...');
        try {
            await client.initialize();
        } catch (err) {
            console.error('[WhatsApp Error al re-inicializar]:', redactSensitiveData(err));
        } finally {
            isReconnecting = false;
        }
    }, 10000);
});

client.on('message', async (message) => {
    try {
        if (!message) return;

        // 1. FILTRO DE SEGURIDAD ESTRICTO: Ignorar estados, mensajes del propio bot, y difusiones
        if (message.isStatus || message.from === 'status@broadcast' || message.fromMe) return;

        // 2. FILTRO DE TIPO DE MENSAJE: Ignorar notificaciones de sistema
        const validTypes = ['chat', 'image', 'video', 'ptt', 'audio', 'document'];
        if (!validTypes.includes(message.type)) return;

        // 3. FILTRO DE GRUPOS: Prohibido responder en grupos
        if (typeof message.from === 'string' && message.from.includes('@g.us')) return;
        
        // 4. FILTRO DE ANTIGÜEDAD (Historial): Ignorar mensajes enviados antes del arranque
        if (message.timestamp && message.timestamp < startupTime) {
            return;
        }

        const chatId = message.from;
        let rawText = message.body ? message.body.trim() : '';
        const now = Math.floor(Date.now() / 1000);
        
        // Mensajes multimedia
        if (!rawText) {
            if (message.type === 'ptt' || message.type === 'audio') rawText = "[El usuario envió un mensaje de voz]";
            else if (message.type === 'image' || message.type === 'video' || message.type === 'document') rawText = "[El usuario envió un archivo multimedia]";
            else if (message.type === 'sticker') rawText = "[El usuario envió un sticker]";
            else return; 
        }

        // Sanitización rigurosa de la entrada
        const text = sanitizeInput(rawText, 1000);

        // Función auxiliar para envío seguro con fallback directo
        const safeSend = async (content) => {
            try {
                await message.reply(content);
            } catch (replyErr) {
                console.warn('[WhatsApp] message.reply falló, intentando client.sendMessage directo...');
                try {
                    await client.sendMessage(chatId, content);
                } catch (sendErr) {
                    console.error('[WhatsApp Error crítico al enviar]:', redactSensitiveData(sendErr));
                }
            }
        };

        // Comando oculto para reactivar el bot por la contadora
        if (text === '/reactivar') {
            mutedChats.delete(chatId);
            chatHistory.delete(chatId); 
            await safeSend('Bot reactivado para este chat.');
            return;
        }

        // Verificar si estamos fuera de horario
        if (!isWithinBusinessHours()) {
            pruneMap(outOfHoursNotified);
            const lastNotified = outOfHoursNotified.get(chatId) || 0;
            if (now - lastNotified > 43200) { // 12 horas
                outOfHoursNotified.set(chatId, now);
                await safeSend('Hola, en este momento nuestra contadora no se encuentra disponible. Por favor comunícate mañana a partir de las 8:30 am nuevamente. ¡Gracias!');
            }
            return;
        }

        // --- MENSAJE DE PRESENTACIÓN (CADA 3 HORAS EN HORARIO LABORAL) ---
        if (message.type !== 'image') {
            pruneMap(presentationNotified);
            const lastPresentation = presentationNotified.get(chatId) || 0;
            if (now - lastPresentation > 10800) { // 3 horas = 10800 segundos
                presentationNotified.set(chatId, now);
                await safeSend('¡Hola! Bienvenido al asistente virtual del despacho de Contaduría Pública. ¿En qué te puedo asesorar hoy? (Recuerda que si necesitas hablar directamente con la contadora, solo dímelo).');
            }
        }

        // Si el chat está silenciado (atendido por humano), el bot ignora
        if (mutedChats.has(chatId)) {
            return;
        }

        // Recuperar y gestionar historial en memoria
        let history = chatHistory.get(chatId) || [];
        
        // Obtener respuesta de Gemini de forma segura
        const response = await getChatbotResponse(text, history);

        // Enviar respuesta
        await safeSend(response.text);

        // Actualizar historial
        history.push({ role: 'user', content: text });
        history.push({ role: 'assistant', content: response.text });
        
        // Mantener solo los últimos 10 mensajes
        if (history.length > 10) history = history.slice(-10);
        
        pruneMap(chatHistory);
        chatHistory.set(chatId, history);

        // Si hubo handoff, silenciar el chat
        if (response.handoff) {
            mutedChats.add(chatId);
            console.log(`[Handoff] Chat silenciado para atención personalizada.`);
        }
    } catch (error) {
        console.error("[WhatsApp Message Error]:", redactSensitiveData(error));
    }
});

let isInitializing = false;
let retryTimer = null;

const startWhatsAppClient = () => {
    if (isInitializing) return;
    isInitializing = true;
    if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
    }

    console.log('[WhatsApp] Purgando posibles bloqueos residuales de Chromium...');
    cleanupChromeLocks(WWEBJS_DATA_PATH);

    console.log('[WhatsApp] Iniciando cliente de WhatsApp Web con Chromium...');
    botStatus = 'initializing';

    client.initialize().catch(err => {
        console.error('[WhatsApp Error al inicializar]:', redactSensitiveData(err));
        botStatus = 'error';
        isInitializing = false;
        cleanupChromeLocks(WWEBJS_DATA_PATH);

        console.log('[WhatsApp] Reintentando inicialización en 8 segundos...');
        retryTimer = setTimeout(() => {
            startWhatsAppClient();
        }, 8000);
    });
};

const stopWhatsAppClient = async () => {
    console.log('[WhatsApp] Deteniendo cliente de WhatsApp de manera segura...');
    try {
        if (client) {
            await client.destroy();
        }
    } catch (e) {
        console.error('[WhatsApp Error al destruir]:', redactSensitiveData(e));
    }
};

const getBotStatus = () => botStatus;
const getLatestQr = () => latestQr;

module.exports = {
    startWhatsAppClient,
    stopWhatsAppClient,
    getBotStatus,
    getLatestQr
};
