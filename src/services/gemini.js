import fs from 'fs';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import Bottleneck from 'bottleneck';
import { GEMINI_API_KEY, IS_CONFIGURED, GEMINI_MODEL, CONTEXT_FILE_PATH } from '../config/index.js';
import { sanitizeInput, redactSensitiveData, resolveWhatsAppContact } from '../utils/security.js';

// Límite de la API gratuita de Gemini: 15 peticiones por minuto.
// Limitamos a 14 peticiones por minuto (una cada ~4.3s) para garantizar cero bloqueos por cuota.
const limiter = new Bottleneck({
    minTime: 4300,
    maxConcurrent: 1
});

class GeminiService {
    constructor() {
        this.apiKey = GEMINI_API_KEY;
        this.modelName = GEMINI_MODEL;
        this.systemInstruction = this.loadSystemContext();
        this.userSessions = new Map(); // senderId -> { chat, lastInteraction }
        this.genAI = null;

        if (IS_CONFIGURED) {
            try {
                this.genAI = new GoogleGenerativeAI(this.apiKey);
            } catch (err) {
                console.error("[Gemini Init Error]:", redactSensitiveData(err));
            }
        }
    }

    loadSystemContext() {
        try {
            if (fs.existsSync(CONTEXT_FILE_PATH)) {
                return fs.readFileSync(CONTEXT_FILE_PATH, 'utf8');
            }
        } catch (error) {
            console.warn('⚠️ No se pudo leer accounting_services_context.md:', error.message);
        }

        return `Eres Estrella, la asistente virtual oficial de la contadora Olga Garcés en Colombia.
Tu objetivo es atender a los clientes con empatía, profesionalismo, detectando sarcasmo con madurez ejecutiva sin tomarlo literal, y limitándote ÚNICA Y EXCLUSIVAMENTE a las leyes fiscales y normativas de Colombia (DIAN, Estatuto Tributario).
REGLA DE BREVEDAD ABSOLUTA: Mantén tus respuestas SIEMPRE CORTAS (máximo 2 a 3 líneas de texto / 1 a 2 oraciones). Sé directa, ágil y concisa. En WhatsApp la gente no lee textos largos.
PROHIBICIÓN TOTAL DE VOCABULARIO: ESTÁ TOTALMENTE PROHIBIDO usar las palabras "velación" o "velar" (suenan a funeraria). Para Revisoría Fiscal y Auditoría usa exclusivamente: "auditoría", "control interno" o "dictamen".
UN MENSAJE POR TURNO: Envía únicamente un solo mensaje puntual por turno.
REGLA DE MENSAJE ININTELIGIBLE: Si el mensaje contiene una sola letra, texto incomprensible o sin sentido, responde estrictamente: "No he entendido tu mensaje. ¿Deseas que te comunique directamente con la contadora Olga Garcés?".
CERO ACOSO: Si el cliente no solicita contacto o deja de responder, no le envíes mensajes adicionales no solicitados.
No brindes asesoría sobre leyes de otros países y si el cliente solicita hablar con Olga Garcés, haz la transferencia.`;
    }

    getTools() {
        return [
            {
                functionDeclarations: [
                    {
                        name: "transfer_to_human",
                        description: "Ejecuta esta función ÚNICAMENTE cuando el usuario solicita explícitamente hablar con un humano, asesor, contadora o dueña, o si hace una consulta muy compleja que requiere atención humana directa.",
                        parameters: {
                            type: SchemaType.OBJECT,
                            properties: {
                                reason: {
                                    type: SchemaType.STRING,
                                    description: "La razón por la cual el usuario requiere hablar con la contadora."
                                }
                            },
                            required: ["reason"]
                        }
                    }
                ]
            }
        ];
    }

    getChatSession(senderId) {
        if (!this.genAI && IS_CONFIGURED) {
            this.genAI = new GoogleGenerativeAI(this.apiKey);
        }

        if (!this.genAI) {
            throw new Error('Falta configurar GEMINI_API_KEY en las variables de entorno');
        }

        // Limpieza de sesiones antiguas si superan 100 usuarios activos
        if (this.userSessions.size > 100) {
            const now = Date.now();
            for (const [key, session] of this.userSessions.entries()) {
                if (now - session.lastInteraction > 3600000) { // 1 hora inactivo
                    this.userSessions.delete(key);
                }
            }
        }

        if (!this.userSessions.has(senderId)) {
            const model = this.genAI.getGenerativeModel({
                model: this.modelName,
                systemInstruction: this.systemInstruction,
                tools: this.getTools(),
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 200
                }
            });

            const chat = model.startChat({
                history: []
            });

            this.userSessions.set(senderId, {
                chat,
                lastInteraction: Date.now(),
                history: []
            });
        }

        const sessionData = this.userSessions.get(senderId);
        if (!sessionData.history) {
            sessionData.history = [];
        }
        sessionData.lastInteraction = Date.now();
        return sessionData.chat;
    }

    async generateResponse(senderId, rawMessage) {
        if (!IS_CONFIGURED) {
            return {
                text: "Hola, nuestro sistema se encuentra en mantenimiento temporal. En breve la contadora se pondrá en contacto contigo.",
                handoff: true
            };
        }

        const message = sanitizeInput(rawMessage, 1000);
        if (!message) {
            return {
                text: "¿En qué trámite contable o tributario te puedo colaborar?",
                handoff: false
            };
        }

        // Registrar mensaje del usuario en el historial de la sesión
        const chat = this.getChatSession(senderId);
        const sessionData = this.userSessions.get(senderId);
        if (sessionData && sessionData.history) {
            sessionData.history.push({ role: 'user', content: message, timestamp: Date.now() });
        }

        // Verificación heurística de solicitud o confirmación de comunicación con la contadora
        const lowerMsg = message.toLowerCase().trim();
        const humanKeywords = [
            'hablar con la contadora', 'comunicar con la contadora', 'comunicarme con la contadora',
            'hablar con un asesor', 'hablar con persona', 'asesor humano', 'hablar con alguien',
            'con olga', 'comunícame con la contadora', 'comunicame con la contadora',
            'comunícame con olga', 'quiero hablar con olga', 'quiero hablar con la contadora'
        ];

        // Verificar si el usuario confirma tras habérsele preguntado si desea comunicarse con Olga
        const affirmativeResponses = ['si', 'sí', 'por favor', 'si por favor', 'sí por favor', 'claro', 'si claro', 'sí claro', 'comunícame', 'comunicame', 'quiero hablar con ella'];
        const isAffirmative = affirmativeResponses.includes(lowerMsg);
        const lastAssistantMsg = sessionData?.history?.slice().reverse().find(m => m.role === 'assistant')?.content || '';
        const askedForTransfer = lastAssistantMsg.toLowerCase().includes('comunique directamente con la contadora') ||
                                 lastAssistantMsg.toLowerCase().includes('se comunique contigo');

        if ((isAffirmative && askedForTransfer) || humanKeywords.some(kw => lowerMsg.includes(kw))) {
            const handoffReply = "Entendido, le notificaré de inmediato a la contadora Olga Garcés para que se comunique contigo por este medio. ¡Muchas gracias!";
            if (sessionData && sessionData.history) {
                sessionData.history.push({ role: 'assistant', content: handoffReply, timestamp: Date.now() });
            }
            return {
                text: handoffReply,
                handoff: true
            };
        }

        try {
            // Llamada envuelta en Bottleneck para respetar cuotas
            const result = await limiter.schedule(async () => {
                return await chat.sendMessage(message);
            });

            if (result && result.response) {
                // Verificar si Gemini llamó a la función 'transfer_to_human'
                let functionCalls = null;
                try {
                    functionCalls = typeof result.response.functionCalls === 'function' ? result.response.functionCalls() : null;
                } catch (e) {}

                if (functionCalls && Array.isArray(functionCalls) && functionCalls.length > 0) {
                    const call = functionCalls.find(fc => fc && fc.name === "transfer_to_human");
                    if (call) {
                        const transferReply = "Entendido, le notificaré a la contadora Olga Garcés para que revise tu caso y te responda por este mismo medio.";
                        if (sessionData && sessionData.history) {
                            sessionData.history.push({ role: 'assistant', content: transferReply, timestamp: Date.now() });
                        }
                        return {
                            text: transferReply,
                            handoff: true
                        };
                    }
                }

                const responseText = result.response.text();
                let cleanResponse = responseText ? responseText.trim() : "¿Podrías darme más detalles sobre tu consulta contable?";

                // Sanitización estricta: Erradicación total de "velación" / "velar" en el mensaje
                cleanResponse = cleanResponse.replace(/\bvelaci[oó]n\b/gi, 'auditoría');
                cleanResponse = cleanResponse.replace(/\bvelaciones\b/gi, 'auditorías');
                cleanResponse = cleanResponse.replace(/\bvelar\b/gi, 'supervisar el cumplimiento');

                if (sessionData && sessionData.history) {
                    sessionData.history.push({ role: 'assistant', content: cleanResponse, timestamp: Date.now() });
                    if (sessionData.history.length > 25) {
                        sessionData.history = sessionData.history.slice(-25);
                    }
                }

                return {
                    text: cleanResponse,
                    handoff: false
                };
            }

            return {
                text: "No he entendido tu mensaje. ¿Deseas que te comunique directamente con la contadora Olga Garcés?",
                handoff: false
            };

        } catch (error) {
            console.warn(`⚠️ Error en llamada principal de Gemini (${this.modelName}):`, redactSensitiveData(error.message));

            // Modelos de respaldo de alta disponibilidad
            const fallbackModels = ['gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-3.5-flash-lite'];

            for (const fallbackModelName of fallbackModels) {
                if (fallbackModelName === this.modelName) continue;
                try {
                    console.log(`🔄 Probando modelo de respaldo: ${fallbackModelName}...`);
                    const fallbackModel = this.genAI.getGenerativeModel({
                        model: fallbackModelName,
                        systemInstruction: this.systemInstruction,
                        generationConfig: { maxOutputTokens: 200 }
                    });
                    const result = await fallbackModel.generateContent(message);
                    let cleanFallbackText = result.response.text().trim();
                    cleanFallbackText = cleanFallbackText.replace(/\bvelaci[oó]n\b/gi, 'auditoría');
                    cleanFallbackText = cleanFallbackText.replace(/\bvelaciones\b/gi, 'auditorías');
                    cleanFallbackText = cleanFallbackText.replace(/\bvelar\b/gi, 'supervisar el cumplimiento');

                    if (sessionData && sessionData.history) {
                        sessionData.history.push({ role: 'assistant', content: cleanFallbackText, timestamp: Date.now() });
                    }
                    return {
                        text: cleanFallbackText,
                        handoff: false
                    };
                } catch (fallbackError) {
                    // Continuar al siguiente modelo de respaldo
                }
            }

            return {
                text: "Hola, en este momento tuvimos una pequeña intermitencia técnica. ¿Deseas que te comunique directamente con la contadora Olga Garcés?",
                handoff: false
            };
        }
    }

    getMessageCount(senderId) {
        const session = this.userSessions.get(senderId);
        return session?.history ? session.history.length : 0;
    }

    async generateLeadSummary(senderId, pushName, statusReason, lidMap = null) {
        if (!IS_CONFIGURED || !this.genAI) return null;

        const session = this.userSessions.get(senderId);
        if (!session || !session.history || session.history.length === 0) {
            return null;
        }

        const formattedHistory = session.history
            .map(m => `${m.role === 'user' ? 'Cliente' : 'Estrella'}: ${m.content}`)
            .join('\n');

        // Resolución segura y verídica del contacto de WhatsApp (evita wa.me/233... rotos para @lid)
        const resolvedContact = resolveWhatsAppContact(senderId, pushName, session.history, lidMap);
        const phoneDisplay = resolvedContact.display;

        const prompt = `Actúa como la secretaria ejecutiva Estrella para la contadora pública Olga Garcés en Colombia.
Analiza la siguiente conversación sostenida con un cliente en WhatsApp:

DATOS TÉCNICOS:
- Nombre visible WhatsApp: "${pushName || 'No identificado'}"
- Identificador/JID: "${senderId}"
- Contacto WhatsApp: ${phoneDisplay}
- Situación de la interacción: "${statusReason}"

HISTORIAL DE LA CONVERSACIÓN:
${formattedHistory}

INSTRUCCIONES CLAVE:
1. Determina si el cliente ha aportado información contable/tributaria real o un caso concreto (por ejemplo: su nombre, cédula o NIT, ciudad, tipo de contribuyente, trámite que necesita resolver como renta, exógena, saldos a favor, auditoría/revisoría fiscal, documentos que tiene o consulta tributaria concreta).
2. Si el cliente ÚNICAMENTE saludó (ej: "hola", "buen día"), envió mensajes vacíos o pruebas, o la conversación no contiene datos contables ni caso que atender, responde ÚNICA Y EXCLUSIVAMENTE con la palabra: NO_LEAD
3. NUNCA USES LA PALABRA "VELACIÓN" NI "VELAR" (suena a funeraria). Para Revisoría Fiscal usa "auditoría", "dictamen" o "control interno".
4. Si el cliente SÍ aportó información útil o planteó una situación contable, genera un reporte ejecutivo impecable y estructurado para Olga Garcés (que se enviará a su chat personal "Tú") con el siguiente formato exacto:

📋 *NUEVO PROSPECTO / RESUMEN DE CLIENTE*

👤 *Cliente:* [Nombre detectado en la conversación o nombre de WhatsApp]
📱 *WhatsApp:* ${phoneDisplay}${resolvedContact.note ? `\n💡 *Nota:* ${resolvedContact.note}` : ''}
🆔 *Cédula / NIT:* [Número de identificación si lo dio, o "No especificado"]
🏙️ *Ciudad:* [Ciudad si la dio, o "No especificada"]
🏢 *Contribuyente:* [Persona Natural / Empresa SAS / etc., o "No especificado"]
📊 *Trámite requerido:* [Declaración de Renta / Exógena / Saldos a favor / Auditoría o Revisoría Fiscal / Asesoría / etc.]
📌 *Estado de interacción:* ${statusReason}
📝 *Resumen del Caso:* [Resumen conciso y muy claro de 2 a 3 líneas de lo que necesita resolver]
📂 *Documentos / Soportes:* [Documentos mencionados o "Pendientes por solicitar"]

Recuerda: Si no hay información contable relevante, responde solo NO_LEAD sin ningún texto adicional.`;

        try {
            return await limiter.schedule(async () => {
                const modelCandidates = [this.modelName, 'gemini-3.5-flash', 'gemini-3.1-flash-lite'];
                for (const candidate of modelCandidates) {
                    try {
                        const m = this.genAI.getGenerativeModel({ model: candidate });
                        const res = await m.generateContent(prompt);
                        let text = res?.response?.text()?.trim();
                        if (!text || text.includes('NO_LEAD')) {
                            return null;
                        }
                        // Erradicación de "velación" / "velar" en el reporte
                        text = text.replace(/\bvelaci[oó]n\b/gi, 'auditoría');
                        text = text.replace(/\bvelaciones\b/gi, 'auditorías');
                        text = text.replace(/\bvelar\b/gi, 'supervisar el cumplimiento');
                        return text;
                    } catch (e) {
                        console.warn(`[Lead Summary Fallback] Falló con ${candidate}:`, redactSensitiveData(e.message));
                    }
                }
                return null;
            });
        } catch (err) {
            console.error('❌ Error al generar resumen con Gemini:', redactSensitiveData(err.message));
            return null;
        }
    }

    resetSession(senderId) {
        this.userSessions.delete(senderId);
    }
}

export const geminiService = new GeminiService();

// Función de compatibilidad simple
export async function getChatbotResponse(rawMessage, conversationHistory = [], senderId = 'default_user') {
    return await geminiService.generateResponse(senderId, rawMessage);
}
