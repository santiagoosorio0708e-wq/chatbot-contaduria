import fs from 'fs';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import Bottleneck from 'bottleneck';
import { GEMINI_API_KEY, IS_CONFIGURED, GEMINI_MODEL, CONTEXT_FILE_PATH } from '../config/index.js';
import { sanitizeInput, redactSensitiveData } from '../utils/security.js';

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
                    maxOutputTokens: 800
                }
            });

            const chat = model.startChat({
                history: []
            });

            this.userSessions.set(senderId, {
                chat,
                lastInteraction: Date.now()
            });
        }

        const sessionData = this.userSessions.get(senderId);
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
                text: "¿En qué te puedo colaborar con respecto a tus temas contables o tributarios?",
                handoff: false
            };
        }

        // Verificación heurística directa de solicitud de humano para agilidad
        const humanKeywords = ['hablar con la contadora', 'comunicar con la contadora', 'hablar con un asesor', 'hablar con persona', 'asesor humano', 'hablar con alguien'];
        const lowerMsg = message.toLowerCase();
        if (humanKeywords.some(kw => lowerMsg.includes(kw))) {
            return {
                text: "Entendido, te voy a comunicar con la contadora. En unos momentos ella revisará tu mensaje y te responderá directamente por este medio. ¡Muchas gracias!",
                handoff: true
            };
        }

        try {
            // Llamada envuelta en Bottleneck para respetar cuotas
            const result = await limiter.schedule(async () => {
                const chat = this.getChatSession(senderId);
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
                        return {
                            text: "Entendido, te voy a comunicar con la contadora. En unos momentos ella revisará tu caso y te responderá por este mismo medio.",
                            handoff: true
                        };
                    }
                }

                const responseText = result.response.text();
                return {
                    text: responseText ? responseText.trim() : "¿Podrías darme más detalles sobre tu consulta contable?",
                    handoff: false
                };
            }

            return {
                text: "Lo siento, hubo un problema procesando tu consulta. ¿Deseas que te comunique directamente con la contadora?",
                handoff: false
            };

        } catch (error) {
            console.warn(`⚠️ Error en llamada principal de Gemini (${this.modelName}):`, redactSensitiveData(error.message));

            // Modelos de respaldo en caso de saturación temporal o error 503/429
            const fallbackModels = ['gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gemini-3.1-flash-lite', 'gemini-flash-latest'];

            for (const fallbackModelName of fallbackModels) {
                if (fallbackModelName === this.modelName) continue;
                try {
                    console.log(`🔄 Probando modelo de respaldo: ${fallbackModelName}...`);
                    const fallbackModel = this.genAI.getGenerativeModel({
                        model: fallbackModelName,
                        systemInstruction: this.systemInstruction
                    });
                    const result = await fallbackModel.generateContent(message);
                    return {
                        text: result.response.text().trim(),
                        handoff: false
                    };
                } catch (fallbackError) {
                    // Continuar al siguiente modelo de respaldo
                }
            }

            return {
                text: "Hola, gracias por comunicarte con nuestro despacho de Contaduría Pública. En este momento tuvimos una pequeña intermitencia técnica. Por favor déjanos tu consulta y en breve te atenderemos.",
                handoff: false
            };
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
