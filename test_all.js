require('dotenv').config();
const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const modelsToTest = [
  "gemini-flash-latest",
  "gemini-pro-latest",
  "gemini-2.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-2.5-pro"
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
