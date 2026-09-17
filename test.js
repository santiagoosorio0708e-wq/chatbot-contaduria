require('dotenv').config();
const { getChatbotResponse } = require('./src/services/gemini');

async function test() {
    console.log("Testing Gemini API...");
    try {
        const res = await getChatbotResponse("Hola", []);
        console.log("Result:", res);
    } catch (e) {
        console.error("Error:", e);
    }
}
test();
