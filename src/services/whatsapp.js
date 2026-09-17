const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { getChatbotResponse } = require('./gemini');
const { isWithinBusinessHours } = require('../utils/hours');

// Lista de chats silenciados (Handoff a humano)
const mutedChats = new Set();
// Memoria de conversación por chat
const chatHistory = new Map();

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

client.on('qr', (qr) => {
    console.log('QR Code recibido, escanea por favor:');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('Cliente de WhatsApp listo y conectado!');
});

client.on('message', async (message) => {
    try {
        // 1. FILTRO DE SEGURIDAD ESTRICTO: Ignorar estados, mensajes del propio bot, y difusiones
        if (message.isStatus || message.from === 'status@broadcast' || message.fromMe) return;

        // 2. FILTRO DE TIPO DE MENSAJE: Ignorar notificaciones de sistema (cambio de código de seguridad, llamadas perdidas, etc.)
        const validTypes = ['chat', 'image', 'video', 'ptt', 'audio', 'document'];
        if (!validTypes.includes(message.type)) return;

        // 3. FILTRO DE GRUPOS: Prohibido escribir en grupos
        if (message.from.includes('@g.us')) return;
        
        // 4. FILTRO DE ANTIGÜEDAD (Historial): Ignoramos mensajes con más de 5 minutos de antigüedad para evitar responder spam viejo al prender el bot.
        const now = Math.floor(Date.now() / 1000);
        if (now - message.timestamp > 300) {
            console.log(`Mensaje antiguo ignorado de: ${message.from}`);
            return;
        }

        const chatId = message.from;
        let text = message.body.trim();
        
        // Si mandan un audio o imagen sin texto, evitamos que text sea indefinido
        if (!text) {
            if (message.type === 'ptt' || message.type === 'audio') text = "[El usuario envió un mensaje de voz]";
            else if (message.type === 'image' || message.type === 'video' || message.type === 'document') text = "[El usuario envió un archivo multimedia]";
            else return; // Si no hay texto y no es archivo válido, ignorar
        }

        // Comando oculto para reactivar el bot por la dueña
        if (text === '/reactivar') {
            mutedChats.delete(chatId);
            chatHistory.delete(chatId); // limpiar historial
            await message.reply('Bot reactivado para este chat.');
            return;
        }

        // Verificar si estamos fuera de horario
        if (!isWithinBusinessHours()) {
            // Ya no archivamos el chat para evitar crasheos (Execution context was destroyed).
            // Simplemente le mandamos el mensaje indicando que no está disponible.
            await message.reply('Hola, en este momento nuestra contadora no se encuentra disponible. Por favor comunícate mañana a partir de las 8:30 am nuevamente. ¡Gracias!');
            return;
        }

        // Si el chat está silenciado (atendido por humano), el bot ignora
        if (mutedChats.has(chatId)) {
            return;
        }

        // Recuperar historial
        let history = chatHistory.get(chatId) || [];
        
        // Obtener respuesta de Gemini
        const response = await getChatbotResponse(text, history);

        // Enviar respuesta
        await message.reply(response.text);

        // Actualizar historial
        history.push({ role: 'user', content: text });
        history.push({ role: 'assistant', content: response.text });
        
        // Mantener solo los últimos 10 mensajes para ahorrar tokens
        if (history.length > 10) history = history.slice(-10);
        chatHistory.set(chatId, history);

        // Si hubo handoff, silenciar el chat
        if (response.handoff) {
            mutedChats.add(chatId);
            console.log(`[Handoff] Chat ${chatId} silenciado. Requiere atención humana.`);
        }
    } catch (error) {
        console.error("Error procesando mensaje:", error);
    }
});

const startWhatsAppClient = () => {
    client.initialize();
};

module.exports = {
    startWhatsAppClient
};
