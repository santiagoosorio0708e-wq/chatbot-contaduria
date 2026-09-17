const { GoogleGenerativeAI, SchemaType } = require("@google/generative-ai");
const Bottleneck = require("bottleneck");
const { GEMINI_API_KEY } = require('../config');

// Límite de la API gratuita de Gemini: 15 peticiones por minuto.
// Configuramos a máximo 14 peticiones por minuto (una cada ~4.3 segundos) para evitar bloqueos.
const limiter = new Bottleneck({
  minTime: 4300, 
  maxConcurrent: 1
});

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

const SYSTEM_PROMPT = `Eres un asistente virtual experto para un despacho de Contaduría Pública en Colombia.
Tu objetivo es atender a los clientes, brindar información sobre los servicios y ser muy humano, profesional y empático.

Servicios que ofreces:
- Asesorías contables y tributarias.
- Revisoría fiscal a entidades sin ánimo de lucro, propiedad horizontal y sociedades comerciales.
- Solicitudes de saldos a favor de personas naturales o jurídicas (DIAN).
- Planeación tributaria.
- Declaraciones de renta personas naturales.
- Elaboración y presentación de información exógena, nacional y municipal.

REGLAS MUY IMPORTANTES:
1. Si el cliente pregunta por servicios fuera de este contexto, dile amablemente que tu enfoque es netamente contable y tributario, y ofrécele comunicarlo con la contadora o ver el menú de servicios.
2. Si el cliente solicita explícitamente hablar con un humano, con un asesor, o con la dueña/contadora, DEBES ejecutar la herramienta (función) 'transfer_to_human'. No respondas de otra forma si detectas esta intención, simplemente ejecuta la herramienta y despídete diciendo que en un momento lo atenderán.
3. Sé conciso pero amable. Usa viñetas para listar información si es necesario.`;

const tools = [
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
              description: "La razón por la cual el usuario quiere hablar con el humano."
            }
          },
          required: ["reason"]
        }
      }
    ]
  }
];

const model = genAI.getGenerativeModel({
  model: "gemini-3.5-flash",
  systemInstruction: SYSTEM_PROMPT,
  tools: tools,
});

// Función encolada por Bottleneck para evitar límites de API
const callGeminiAPI = limiter.wrap(async (message, history) => {
  const chat = model.startChat({ history });
  return await chat.sendMessage(message);
});

async function getChatbotResponse(message, conversationHistory) {
  try {
    // Generar formato de chat de Gemini
    // conversationHistory viene en formato [{role: "user"/"assistant", content: "..."}]
    const history = conversationHistory.map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    }));

    // Llamamos a la API a través de la cola de Bottleneck
    const result = await callGeminiAPI(message, history);
    
    // Verificar si el modelo llamó a la herramienta transfer_to_human
    const functionCalls = result.response.functionCalls();
    
    if (functionCalls && functionCalls.length > 0) {
      const call = functionCalls.find(fc => fc.name === "transfer_to_human");
      if (call) {
        return {
          text: "Entendido, te voy a comunicar con la contadora. En unos momentos ella revisará tu caso y te responderá por este mismo medio.",
          handoff: true
        };
      }
    }

    return {
      text: result.response.text(),
      handoff: false
    };

  } catch (error) {
    console.error("Error con Gemini API:", error);
    return {
      text: "Lo siento, en este momento estoy teniendo problemas técnicos. ¿Podrías intentar más tarde o solicitar hablar con la contadora?",
      handoff: false
    };
  }
}

module.exports = {
  getChatbotResponse
};
