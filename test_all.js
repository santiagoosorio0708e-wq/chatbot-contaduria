import 'dotenv/config';
import { GoogleGenerativeAI } from '@google/generative-ai';

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.log("No GEMINI_API_KEY in .env");
  process.exit(0);
}

const genAI = new GoogleGenerativeAI(apiKey);

const modelsToTest = [
  "gemini-2.5-flash",
  "gemini-3.5-flash",
  "gemini-flash-latest",
  "gemini-3.1-flash-lite"
];

async function testAll() {
  for (const modelName of modelsToTest) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent("Hola");
      console.log(`[SUCCESS] ${modelName} is working! Response: ${result.response.text()}`);
    } catch (e) {
      console.log(`[FAILED] ${modelName} - ${e.message}`);
    }
  }
}

testAll();
