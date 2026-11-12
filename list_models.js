import 'dotenv/config';

async function listModels() {
    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            console.log("No GEMINI_API_KEY configured.");
            return;
        }
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        const data = await response.json();
        if (data.models) {
            console.log("Models:", data.models.map(m => m.name));
        } else {
            console.log("Response:", data);
        }
    } catch (e) {
        console.error(e);
    }
}
listModels();
