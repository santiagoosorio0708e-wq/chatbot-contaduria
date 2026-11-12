import makeWASocket, {
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    Browsers
} from '@whiskeysockets/baileys';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import { 
    AUTH_FOLDER_PATH, 
    USE_PAIRING_CODE, 
    PHONE_NUMBER 
} from '../config/index.js';
import { geminiService } from './gemini.js';
import { scheduleGuard } from '../utils/hours.js';
import { sanitizeInput, redactSensitiveData } from '../utils/security.js';

// Estado global para monitoreo y dashboard web
let botStatus = 'initializing';
let latestQr = null;
let latestPairingCode = null;
let activeSocket = null;

// Tiempo de arranque del bot (en segundos UNIX)
// REGLA CLAVE: El bot solo puede escribir después de que se realiza la conexión;
// cualquier mensaje con timestamp previo al arranque es ignorado.
const startupTime = Math.floor(Date.now() / 1000);

// Control de concurrencia y prevención de bucles o respuestas duplicadas
const processedMessageIds = new Set();
const mutedChats = new Set();

function pruneSet(setInstance, maxItems = 200) {
    if (setInstance.size > maxItems) {
        const toDelete = Array.from(setInstance).slice(0, 50);
        for (const item of toDelete) setInstance.delete(item);
    }
}

export async function startWhatsAppClient() {
    console.log('🤖 Iniciando Cliente de WhatsApp con Baileys (Ultra Bajo Consumo de RAM)...');
    botStatus = 'initializing';
    latestQr = null;
    latestPairingCode = null;

    try {
        const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER_PATH);
        const { version, isLatest } = await fetchLatestBaileysVersion();

        console.log(`📦 Versión de Baileys: v${version.join('.')}${isLatest ? ' (última versión)' : ''}`);

        const sock = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
            },
            browser: Browsers.ubuntu('Chrome'),
            printQRInTerminal: false,
            generateHighQualityLinkPreview: false,
            syncFullHistory: false,
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 60000,
            keepAliveIntervalMs: 15000
        });

        activeSocket = sock;
        sock.ev.on('creds.update', saveCreds);

        // 1. Manejo de Pairing Code si está habilitado y no está registrado
        if (USE_PAIRING_CODE && !sock.authState.creds.registered) {
            botStatus = 'pairing_code_ready';
            const cleanPhone = (PHONE_NUMBER || '').replace(/[^0-9]/g, '');

            if (cleanPhone) {
                setTimeout(async () => {
                    try {
                        console.log(`\n⏳ Solicitando código de vinculación para el número: +${cleanPhone}...`);
                        const code = await sock.requestPairingCode(cleanPhone);
                        latestPairingCode = code;
                        console.log('\n=============================================================');
                        console.log('🔑 CÓDIGO DE VINCULACIÓN DE WHATSAPP (SIN CÓDIGO QR):');
                        console.log(`\n       👉  [ ${code} ]  👈\n`);
                        console.log('Instrucciones en el celular de la contadora:');
                        console.log(' 1. Abrir WhatsApp > Ajustes (o los 3 puntos) > Dispositivos vinculados');
                        console.log(' 2. Tocar "Vincular un dispositivo"');
                        console.log(' 3. Abajo tocar la opción "Vincular con el número de teléfono en su lugar"');
                        console.log(` 4. Escribir este código: ${code}`);
                        console.log('=============================================================\n');
                    } catch (err) {
                        console.error('❌ Error al solicitar el código de vinculación:', redactSensitiveData(err.message));
                    }
                }, 3000);
            } else {
                console.log('💡 [Aviso Pairing Code] Para usar código de vinculación telefónica, añade PHONE_NUMBER=57300... en .env o Render.');
            }
        }

        // 2. Manejo de Eventos de Conexión y QR
        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            // Si hay QR disponible
            if (qr) {
                latestQr = qr;
                botStatus = 'qr_ready';
                console.log('\n=============================================================');
                console.log('📱 ESCANEA ESTE CÓDIGO QR CON WHATSAPP EN TU TELÉFONO:');
                console.log('   (WhatsApp > Ajustes / Menú > Dispositivos vinculados > Vincular un dispositivo)');
                console.log('   También disponible visualmente en tu panel web: /qr');
                console.log('=============================================================\n');
                try {
                    qrcode.generate(qr, { small: true });
                } catch (e) {}
                console.log('=============================================================\n');
            }

            // Manejo de desconexión y reconexión limpia
            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

                console.log(`⚠️ Conexión de WhatsApp cerrada. Código de estado: ${statusCode}. Reconectando: ${shouldReconnect}`);
                botStatus = 'disconnected';
                latestQr = null;

                if (shouldReconnect) {
                    setTimeout(() => {
                        startWhatsAppClient();
                    }, 4000);
                } else {
                    console.log('❌ Sesión cerrada permanentemente (Logout). Se limpiarán credenciales en el siguiente reinicio.');
                }
            } else if (connection === 'open') {
                console.log('\n=============================================================');
                console.log('✅ ¡CONEXIÓN EXITOSA CON WHATSAPP!');
                console.log('📌 Bot de Contaduría Pública activo y listo para atender mensajes.');
                console.log('=============================================================\n');
                botStatus = 'ready';
                latestQr = null;
                latestPairingCode = null;
            }
        });

        // 3. Manejo de Mensajes Entrantes
        sock.ev.on('messages.upsert', async (chatUpdate) => {
            try {
                // Solo procesar notificaciones nuevas en tiempo real
                if (chatUpdate.type !== 'notify') return;

                for (const msg of chatUpdate.messages) {
                    if (!msg || !msg.message) continue;

                    const messageId = msg.key?.id;
                    const remoteJid = msg.key?.remoteJid;
                    if (!remoteJid || !messageId) continue;

                    // REGLA 1: Ignorar mensajes enviados por el propio bot para evitar bucles
                    if (msg.key?.fromMe) continue;

                    // REGLA 2: Ignorar grupos (@g.us) y estados (status@broadcast)
                    if (remoteJid.endsWith('@g.us') || remoteJid === 'status@broadcast') continue;

                    // REGLA 3: Evitar procesar el mismo mensaje dos veces
                    if (processedMessageIds.has(messageId)) continue;
                    processedMessageIds.add(messageId);
                    pruneSet(processedMessageIds, 300);

                    // REGLA 4: FILTRO DE ANTIGÜEDAD SEGURO: Descartar solo mensajes con más de 5 minutos de antigüedad
                    const nowSec = Math.floor(Date.now() / 1000);
                    const rawTimestamp = msg.messageTimestamp;
                    const msgTime = typeof rawTimestamp === 'object' && rawTimestamp !== null
                        ? (rawTimestamp.low || Number(rawTimestamp))
                        : Number(rawTimestamp);
                    if (msgTime > 0 && (nowSec - msgTime) > 300) {
                        console.log(`⏳ Ignorando mensaje antiguo de hace ${nowSec - msgTime}s.`);
                        continue;
                    }

                    // Extraer y desenvolver mensajes (soporte completo para mensajes efímeros, temporales y multimedia)
                    const actualMessage = msg.message?.ephemeralMessage?.message ||
                                          msg.message?.viewOnceMessage?.message ||
                                          msg.message?.viewOnceMessageV2?.message ||
                                          msg.message?.documentWithCaptionMessage?.message ||
                                          msg.message;

                    const messageContent =
                        actualMessage?.conversation ||
                        actualMessage?.extendedTextMessage?.text ||
                        actualMessage?.imageMessage?.caption ||
                        actualMessage?.videoMessage?.caption ||
                        actualMessage?.documentMessage?.caption ||
                        actualMessage?.buttonsResponseMessage?.selectedButtonId ||
                        actualMessage?.listResponseMessage?.singleSelectReply?.selectedRowId ||
                        actualMessage?.templateButtonReplyMessage?.selectedId ||
                        '';

                    const isMediaOnly = !messageContent && (
                        !!actualMessage?.audioMessage ||
                        !!actualMessage?.imageMessage ||
                        !!actualMessage?.videoMessage ||
                        !!actualMessage?.stickerMessage ||
                        !!actualMessage?.documentMessage ||
                        !!actualMessage?.contactMessage ||
                        !!actualMessage?.locationMessage
                    );

                    const pushName = msg.pushName || 'Cliente';
                    const text = sanitizeInput(messageContent, 1000);

                    // Función auxiliar de envío ultra seguro con fallback directo
                    const safeSend = async (jid, content) => {
                        try {
                            return await sock.sendMessage(jid, content, { quoted: msg });
                        } catch (err) {
                            console.warn(`[WhatsApp] Envío con quoted falló, reintentando directo a ${jid}...`);
                            try {
                                return await sock.sendMessage(jid, content);
                            } catch (retryErr) {
                                console.error(`[WhatsApp Error crítico al enviar a ${jid}]:`, redactSensitiveData(retryErr.message));
                            }
                        }
                    };

                    console.log(`\n📩 Mensaje recibido de ${pushName} (${remoteJid}): "${text || '[Archivo Multimedia]'}"`);

                    // Comando para reactivar bot si fue silenciado por transferencia
                    if (text === '/reactivar') {
                        mutedChats.delete(remoteJid);
                        await safeSend(remoteJid, { text: '✅ Asistente virtual Estrella reactivada para este chat.' });
                        continue;
                    }

                    // Si el chat está silenciado (atendido por la contadora humana), no responder
                    if (mutedChats.has(remoteJid)) {
                        console.log(`⏳ Chat con ${pushName} está en modo manual (silenciado para la contadora).`);
                        continue;
                    }

                    // 1. VALIDACIÓN DE HORARIO DE ATENCIÓN
                    const scheduleStatus = scheduleGuard.isWithinOperatingHours();

                    if (!scheduleStatus.isOpen) {
                        console.log(`⏰ [Fuera de Horario] Motivo: ${scheduleStatus.reason} | Hora actual: ${scheduleStatus.currentTime}`);

                        // Si es el primer contacto fuera de horario, enviamos el aviso breve de horario
                        if (scheduleGuard.shouldSendOffHoursNotification(remoteJid)) {
                            const offHoursReply = scheduleGuard.getOffHoursMessage();
                            console.log(`📤 Enviando aviso breve de fuera de horario a ${pushName}...`);
                            await safeSend(remoteJid, { text: offHoursReply });
                            return;
                        }

                        // Si el cliente ya recibió el aviso inicial y ahora envía sus datos, motivo o consulta:
                        // La IA procesa y responde inmediatamente para no perder el hilo ni dejar al cliente en visto.
                        console.log(`🟢 [Fuera de Horario - Continuación] ${pushName} continúa conversando. Procesando con IA...`);
                    }

                    // 2. CASO MULTIMEDIA SIN TEXTO EN HORARIO LABORAL
                    if (isMediaOnly && !text) {
                        console.log(`📎 Mensaje multimedia sin texto de ${pushName}. Enviando respuesta orientativa...`);
                        const mediaPrompt = `¡Hola! 👋 Hemos recibido tu archivo. Para brindarte una orientación más ágil y precisa, por favor indícanos brevemente en un mensaje de texto qué trámite o consulta contable necesitas resolver. ¡Con gusto te atenderemos!`;
                        await safeSend(remoteJid, { text: mediaPrompt });
                        return;
                    }

                    if (!text || text.trim().length === 0) {
                        return;
                    }

                    // 3. PROCESAMIENTO CON INTELIGENCIA ARTIFICIAL GEMINI (ESTRELLA)
                    console.log(`🟢 [En Horario] Procesando consulta de ${pushName} con Estrella (Google Gemini)...`);

                    // Indicador de "escribiendo..." en WhatsApp
                    try {
                        await sock.sendPresenceUpdate('composing', remoteJid);
                    } catch (e) {}

                    try {
                        const response = await geminiService.generateResponse(remoteJid, text);
                        console.log(`📤 Enviando respuesta a ${pushName}...`);

                        // Enviar respuesta exacta una sola vez con fallback seguro
                        await safeSend(remoteJid, { text: response.text });

                        // Si hubo solicitud de transferencia a la contadora, silenciar para dar paso al humano
                        if (response.handoff) {
                            mutedChats.add(remoteJid);
                            pruneSet(mutedChats, 100);
                            console.log(`👤 [Handoff] Chat con ${pushName} transferido a la contadora Olga Garcés.`);
                        }
                    } catch (err) {
                        console.error(`❌ Error al responder a ${remoteJid}:`, redactSensitiveData(err.message));
                    } finally {
                        try {
                            await sock.sendPresenceUpdate('paused', remoteJid);
                        } catch (e) {}
                    }
                }
            } catch (upsertErr) {
                console.error('🛡️ [Error controlado en messages.upsert]:', redactSensitiveData(upsertErr.message));
            }
        });

    } catch (criticalErr) {
        console.error('❌ Error crítico al inicializar Baileys:', redactSensitiveData(criticalErr.message));
        botStatus = 'disconnected';
        setTimeout(() => {
            startWhatsAppClient();
        }, 8000);
    }
}

export async function stopWhatsAppClient() {
    console.log('[WhatsApp] Cerrando conexión de WhatsApp...');
    try {
        if (activeSocket) {
            activeSocket.end(undefined);
            activeSocket = null;
        }
    } catch (e) {}
}

export function getBotStatus() {
    return botStatus;
}

export function getLatestQr() {
    return latestQr;
}

export function getLatestPairingCode() {
    return latestPairingCode;
}
