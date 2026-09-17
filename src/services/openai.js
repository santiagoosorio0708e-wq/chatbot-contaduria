const OpenAI = require('openai');
const { OPENAI_API_KEY } = require('../config');

const openai = new OpenAI({
    apiKey: OPENAI_API_KEY,
});

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
        type: "function",
        function: {
            name: "transfer_to_human",
            description: "Ejecuta esta función ÚNICAMENTE cuando el usuario solicita explícitamente hablar con un humano, asesor, contadora o dueña, o si hace una consulta muy compleja que requiere atención humana directa.",
            parameters: {
                type: "object",
                properties: {
                    reason: {
                        type: "string",
                        description: "La razón por la cual el usuario quiere hablar con el humano."
                    }
                },
                required: ["reason"]
            }
        }
    }
];

async function getChatbotResponse(message, conversationHistory) {
    // Formatear historial para OpenAI
    const messages = [
        { role: "system", content: SYSTEM_PROMPT },
        ...conversationHistory,
        { role: "user", content: message }
    ];

    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini", // o gpt-4o dependiendo del presupuesto
            messages: messages,
            tools: tools,
            tool_choice: "auto",
            temperature: 0.7,
        });

        const responseMessage = response.choices[0].message;

        // Comprobar si el modelo decidió llamar a la función
        if (responseMessage.tool_calls) {
            const toolCall = responseMessage.tool_calls[0];
            if (toolCall.function.name === "transfer_to_human") {
                return {
                    text: "Entendido, te voy a comunicar con la contadora. En unos momentos ella revisará tu caso y te responderá por este mismo medio.",
                    handoff: true
                };
            }
        }

        return {
            text: responseMessage.content,
            handoff: false
        };

    } catch (error) {
        console.error("Error con OpenAI API:", error);
        return {
            text: "Lo siento, en este momento estoy teniendo problemas técnicos. ¿Podrías intentar más tarde o solicitar hablar con la contadora?",
            handoff: false
        };
    }
}

module.exports = {
    getChatbotResponse
};
