import 'dotenv/config';
import { geminiService } from './src/services/gemini.js';

async function test() {
    console.log("Testing Gemini API...");
    try {
        const res = await geminiService.generateResponse("test_user", "Hola, ¿qué servicios ofrecen?");
        console.log("Result:", res);
    } catch (e) {
        console.error("Error:", e);
    }
}
test();
