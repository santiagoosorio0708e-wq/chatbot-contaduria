import fs from 'fs';
import makeWASocket, {
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    Browsers,
    jidNormalizedUser
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
import { sanitizeInput, redactSensitiveData, isPureEmoji, isUnintelligibleOrSingleChar } from '../utils/security.js';

// Estado global para monitoreo y dashboard web
let botStatus = 'initializing';
let latestQr = null;
let latestPairingCode = null;
let activeSocket = null;
let isShuttingDown = false;

// Tiempo de arranque del bot (en segundos UNIX)
// REGLA CLAVE: El bot solo puede escribir después de que se realiza la conexión;
// cualquier mensaje con timestamp previo al arranque es ignorado.
const startupTime = Math.floor(Date.now() / 1000);

// Control de concurrencia y prevención de bucles o respuestas duplicadas
const processedMessageIds = new Set();
const mutedChats = new Set();

// Mapeo dinámico de WhatsApp LID (@lid) a número telefónico real (@s.whatsapp.net)
const lidToPhoneMap = new Map();

// Control de inactividad de clientes y resúmenes ejecutivos enviados al chat propio ("Tú")
const inactivityTimers = new Map(); // remoteJid -> NodeJS.Timeout
const sentSummaries = new Map();    // remoteJid -> { msgCount: number, timestamp: number }

function pruneSet(setInstance, maxItems = 200) {
    if (setInstance.size > maxItems) {
        const toDelete = Array.from(setInstance).slice(0, 50);
        for (const item of toDelete) setInstance.delete(item);
    }
}

function pruneMap(mapInstance, maxItems = 200) {
    if (mapInstance.size > maxItems) {
        const toDelete = Array.from(mapInstance.keys()).slice(0, 50);
        for (const item of toDelete) mapInstance.delete(item);
    }
}

// Envía el resumen del lead/caso al chat personal de la contadora ("Tú" / Note to Self)
async function sendLeadSummaryToSelf(sock, remoteJid, pushName, statusReason) {
    try {
        if (!sock || !sock.user?.id) return;
        const myJid = jidNormalizedUser(sock.user.id);
        if (!myJid) return;

        // Evitar duplicados si el conteo de mensajes no ha cambiado desde el último resumen enviado en menos de 1 hora
        const currentCount = geminiService.getMessageCount(remoteJid);
        const previous = sentSummaries.get(remoteJid);
        if (previous && previous.msgCount === currentCount && (Date.now() - previous.timestamp < 3600000)) {
            return;
        }

        console.log(`🔍 [Resumen Lead] Analizando interacción de ${pushName} (${remoteJid}) para notificar a la contadora...`);
        const summaryText = await geminiService.generateLeadSummary(remoteJid, pushName, statusReason, lidToPhoneMap);

        if (!summaryText) {
            console.log(`ℹ️ [Resumen Lead] ${pushName} no aportó datos contables relevantes. Omitiendo envío a chat propio.`);
            return;
        }

        console.log(`📋 Enviando resumen de prospecto al chat propio de WhatsApp ("Tú" - ${myJid})...`);
        await sock.sendMessage(myJid, { text: summaryText });
        console.log(`✅ ¡Resumen de ${pushName} entregado exitosamente en el chat "Tú" de la contadora Olga Garcés!`);

        sentSummaries.set(remoteJid, {
            msgCount: currentCount,
            timestamp: Date.now()
        });
        pruneMap(sentSummaries, 200);
    } catch (err) {
        console.error('❌ Error al enviar resumen al chat propio ("Tú"):', redactSensitiveData(err.message));
    }
}

export async function startWhatsAppClient() {
    console.log('🤖 Iniciando Cliente de WhatsApp con Baileys (Ultra Bajo Consumo de RAM)...');
    isShuttingDown = false;
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
            browser: Browsers.macOS('Chrome'),
            printQRInTerminal: false,
            generateHighQualityLinkPreview: false,
            syncFullHistory: false,
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 60000,
            keepAliveIntervalMs: 15000
        });

        activeSocket = sock;

        // Guardar credenciales de forma nativa sin alterar identidades
        sock.ev.on('creds.update', saveCreds);

        // Mapeo proactivo de LIDs a números de teléfono reales
        sock.ev.on('chats.phoneNumberShare', ({ lid, jid }) => {
            if (lid && jid) {
                const cleanPn = jid.split('@')[0].replace(/\D/g, '');
                if (cleanPn.length >= 8) {
                    lidToPhoneMap.set(lid, cleanPn);
                    pruneMap(lidToPhoneMap, 300);
                }
            }
        });

        sock.ev.on('contacts.upsert', (contacts) => {
            if (Array.isArray(contacts)) {
                for (const c of contacts) {
                    if (c && c.lid && (c.jid || c.id)) {
                        const target = c.jid || c.id;
                        if (typeof target === 'string' && target.endsWith('@s.whatsapp.net')) {
                            const cleanPn = target.split('@')[0].replace(/\D/g, '');
                            if (cleanPn.length >= 8) {
                                lidToPhoneMap.set(c.lid, cleanPn);
                            }
                        }
                    }
                }
                pruneMap(lidToPhoneMap, 300);
            }
        });

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
                if (isShuttingDown) {
                    console.log('[WhatsApp] Cierre por apagado seguro del proceso. No se programa reconexión.');
                    botStatus = 'disconnected';
                    return;
                }

                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const isLoggedOut = statusCode === DisconnectReason.loggedOut;

                console.log(`⚠️ Conexión de WhatsApp cerrada. Código de estado: ${statusCode}. Reconectando: ${!isLoggedOut}`);
                botStatus = 'disconnected';
                latestQr = null;
                latestPairingCode = null;

                if (statusCode === 515) {
                    console.log('🔄 [WhatsApp 515] Reinicio requerido tras sincronización inicial de QR. Reconectando en 1.5s...');
                    setTimeout(() => {
                        startWhatsAppClient();
                    }, 1500);
                    return;
                }

                if (isLoggedOut) {
                    console.log('🗑️ Sesión cerrada o invalidada (Logout 401). Limpiando credenciales para generar nuevo QR...');
                    try {
                        fs.rmSync(AUTH_FOLDER_PATH, { recursive: true, force: true });
                        console.log('✅ Carpeta de autenticación eliminada exitosamente.');
                    } catch (err) {
                        console.warn('⚠️ No se pudo eliminar la carpeta de autenticación:', err.message);
                    }

                    // Reinicio automático inmediato para que el usuario pueda escanear un nuevo QR fresco
                    setTimeout(() => {
                        console.log('🔄 Reiniciando Baileys para generar nuevo código QR limpio...');
                        startWhatsAppClient();
                    }, 2000);
                    return;
                }

                // Reconexión para otras caídas temporales de red
                setTimeout(() => {
                    startWhatsAppClient();
                }, 3000);
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

                    // REGLA 1.1: Ignorar mensajes del chat privado con uno mismo ("Tú" / Note to Self)
                    const myJid = sock.user?.id ? jidNormalizedUser(sock.user.id) : null;
                    if (myJid && (remoteJid === myJid || remoteJid.startsWith(myJid.split('@')[0]))) continue;

                    // REGLA 2: Ignorar grupos (@g.us) y estados (status@broadcast)
                    if (remoteJid.endsWith('@g.us') || remoteJid === 'status@broadcast') continue;

                    // Mapeo proactivo de LID si el mensaje entrante contiene senderPn o participantPn
                    if (remoteJid.endsWith('@lid')) {
                        const pnCandidate = msg.key?.senderPn || msg.key?.participantPn;
                        if (pnCandidate && typeof pnCandidate === 'string') {
                            const cleanPn = pnCandidate.replace(/\D/g, '');
                            if (cleanPn.length >= 8) {
                                lidToPhoneMap.set(remoteJid, cleanPn);
                                pruneMap(lidToPhoneMap, 300);
                            }
                        }
                    }

                    // Si el cliente volvió a escribir, reiniciar el temporizador de inactividad
                    if (inactivityTimers.has(remoteJid)) {
                        clearTimeout(inactivityTimers.get(remoteJid));
                        inactivityTimers.delete(remoteJid);
                    }

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

                    // REGLA 2.1: Ignorar stickers de WhatsApp
                    if (actualMessage?.stickerMessage) {
                        console.log(`🖼️ [Sticker Ignorado] Mensaje de ${msg.pushName || 'Cliente'} es un sticker. Omitiendo.`);
                        continue;
                    }

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

                    // REGLA 2.2: Ignorar multimedia sin texto (audios, imágenes, videos, documentos sin pie de foto, contactos, ubicaciones)
                    const isMediaWithoutText = !messageContent && (
                        !!actualMessage?.audioMessage ||
                        !!actualMessage?.imageMessage ||
                        !!actualMessage?.videoMessage ||
                        !!actualMessage?.documentMessage ||
                        !!actualMessage?.contactMessage ||
                        !!actualMessage?.locationMessage ||
                        !!actualMessage?.ptvMessage
                    );
                    if (isMediaWithoutText) {
                        console.log(`📎 [Multimedia Sin Texto Ignorada] Mensaje sin texto de ${msg.pushName || 'Cliente'}. Omitiendo respuesta.`);
                        continue;
                    }

                    const pushName = msg.pushName || 'Cliente';
                    const text = sanitizeInput(messageContent, 1000);

                    // REGLA 2.3: Ignorar si no hay texto o si son únicamente emoticonos / emojis
                    if (!text || text.trim().length === 0 || isPureEmoji(text)) {
                        console.log(`😀 [Emoji/Vacío Ignorado] Mensaje de ${pushName} es vacío o solo emoticonos. Omitiendo.`);
                        continue;
                    }

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

                    console.log(`\n📩 Mensaje recibido de ${pushName} (${remoteJid}): "${text}"`);

                    // REGLA 2.4: Si envía una sola letra o una palabra ininteligible:
                    if (isUnintelligibleOrSingleChar(text)) {
                        console.log(`❓ [Ininteligible] Mensaje de ${pushName} ("${text}") es ininteligible o de una sola letra.`);
                        const unintelligibleReply = "No he entendido tu mensaje. ¿Deseas que te comunique directamente con la contadora Olga Garcés?";
                        await safeSend(remoteJid, { text: unintelligibleReply });

                        // Registrar en el historial de sesión para reconocer si el usuario responde afirmativamente
                        try {
                            geminiService.getChatSession(remoteJid);
                            const sessionData = geminiService.userSessions.get(remoteJid);
                            if (sessionData && sessionData.history) {
                                sessionData.history.push({ role: 'user', content: text, timestamp: Date.now() });
                                sessionData.history.push({ role: 'assistant', content: unintelligibleReply, timestamp: Date.now() });
                            }
                        } catch (e) {}

                        continue;
                    }

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

                        // Si hubo solicitud de transferencia a la contadora, silenciar para dar paso al humano y enviar resumen inmediato a "Tú"
                        if (response.handoff) {
                            mutedChats.add(remoteJid);
                            pruneSet(mutedChats, 100);
                            console.log(`👤 [Handoff] Chat con ${pushName} transferido a la contadora Olga Garcés.`);
                            await sendLeadSummaryToSelf(sock, remoteJid, pushName, 'Cliente continuó la conversación y solicitó hablar con la contadora Olga Garcés');
                        } else {
                            // Si el cliente está en conversación, programar temporizador de inactividad (3 minutos)
                            // Si no continúa respondiendo tras haber aportado datos, se enviará el resumen a su WhatsApp "Tú"
                            const timer = setTimeout(async () => {
                                try {
                                    inactivityTimers.delete(remoteJid);
                                    await sendLeadSummaryToSelf(sock, remoteJid, pushName, 'El cliente no continuó la conversación tras brindar información inicial (Inactivo)');
                                } catch (timerErr) {
                                    console.error('❌ Error en temporizador de inactividad:', redactSensitiveData(timerErr.message));
                                }
                            }, 180000); // 3 minutos de inactividad
                            inactivityTimers.set(remoteJid, timer);
                            pruneMap(inactivityTimers, 200);
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
    console.log('[WhatsApp] Cerrando conexión de WhatsApp de forma segura...');
    isShuttingDown = true;
    for (const timer of inactivityTimers.values()) {
        clearTimeout(timer);
    }
    inactivityTimers.clear();
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

// Permite reiniciar manualmente la sesión y forzar un nuevo código QR limpio
export async function resetWhatsAppSession() {
    console.log('🔄 [Reset Manual] Limpiando credenciales y reiniciando sesión...');
    try {
        if (activeSocket) {
            activeSocket.end(undefined);
            activeSocket = null;
        }
    } catch (e) {}

    try {
        fs.rmSync(AUTH_FOLDER_PATH, { recursive: true, force: true });
        console.log('✅ Carpeta de credenciales limpiada correctamente.');
    } catch (e) {}

    botStatus = 'initializing';
    latestQr = null;
    latestPairingCode = null;

    setTimeout(() => {
        startWhatsAppClient();
    }, 2000);
}
