const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const cron = require('node-cron');
const { getChatbotResponse } = require('./gemini');
const { isWithinBusinessHours } = require('../utils/hours');

// Lista de chats silenciados (Handoff a humano)
const mutedChats = new Set();
// Memoria de conversación por chat
const chatHistory = new Map();

// Chats archivados fuera de horario que deben ser desarchivados
const archivedChatsToUnarchive = new Set();

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
    
    // Configurar cron job para verificar si entramos en horario de atención y desarchivar
    // Se ejecuta cada minuto
    cron.schedule('* * * * *', async () => {
        if (isWithinBusinessHours() && archivedChatsToUnarchive.size > 0) {
            console.log(`Estamos en horario de atención. Desarchivando ${archivedChatsToUnarchive.size} chats...`);
            for (const chatId of archivedChatsToUnarchive) {
                try {
                    const chat = await client.getChatById(chatId);
                    await chat.unarchive();
                    console.log(`Chat ${chatId} desarchivado.`);
                    // Notificar a la dueña si se requiere
                    archivedChatsToUnarchive.delete(chatId);
                } catch (err) {
                    console.error(`Error desarchivando chat ${chatId}:`, err);
                }
            }
        }
    });
});

client.on('message', async (message) => {
    // Ignorar estados, mensajes del propio bot, y grupos
    if (message.isStatus || message.from === 'status@broadcast' || message.from.includes('@g.us') || message.fromMe) return;

    // MUY IMPORTANTE: Ignorar mensajes antiguos (historial sincronizado al conectar el bot)
    // Comparamos el timestamp del mensaje con el tiempo actual. Si tiene más de 2 minutos (120 seg) de antigüedad, lo ignoramos.
    const now = Math.floor(Date.now() / 1000);
    if (now - message.timestamp > 120) {
        console.log(`Mensaje antiguo ignorado de: ${message.from}`);
        return;
    }

    const chatId = message.from;
    const text = message.body.trim();

    // Comando oculto para reactivar el bot por la dueña
    if (text === '/reactivar') {
        mutedChats.delete(chatId);
        chatHistory.delete(chatId); // limpiar historial
        await message.reply('Bot reactivado para este chat.');
        return;
    }

    // Verificar si estamos fuera de horario
    if (!isWithinBusinessHours()) {
        try {
            const chat = await message.getChat();
            await chat.archive();
            archivedChatsToUnarchive.add(chatId);
            
            // Responder de forma educada solo una vez por un tiempo o siempre que escriban fuera de horario
            await message.reply('Hola, en este momento nos encontramos fuera de nuestro horario de atención. Hemos recibido tu mensaje y nuestra contadora te responderá a primera hora del siguiente día hábil. ¡Gracias por comunicarte!');
            return;
        } catch (error) {
            console.error('Error al archivar chat:', error);
        }
    }

    // Si el chat está silenciado (atendido por humano), el bot ignora
    if (mutedChats.has(chatId)) {
        return;
    }

    // Recuperar historial
    let history = chatHistory.get(chatId) || [];
    
    // Obtener respuesta de OpenAI
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
        // Aquí podrías enviar un mensaje al número de la dueña avisando
        // client.sendMessage('numero_dueña@c.us', `El usuario ${message._data.notifyName || chatId} requiere tu atención.`);
    }
});

const startWhatsAppClient = () => {
    client.initialize();
};

module.exports = {
    startWhatsAppClient
};
