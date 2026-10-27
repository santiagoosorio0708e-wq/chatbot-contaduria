require('dotenv').config();

const { sanitizeInput } = require('../utils/security');

// Validar formato de hora HH:MM (24 horas)
function validateTimeFormat(timeStr, defaultTime) {
    if (typeof timeStr === 'string' && /^([01]\d|2[0-3]):([0-5]\d)$/.test(timeStr.trim())) {
        return timeStr.trim();
    }
    return defaultTime;
}

const rawApiKey = process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.trim() : '';
const isConfigured = Boolean(rawApiKey);

if (!isConfigured) {
    console.warn("[Config Advertencia] GEMINI_API_KEY no está definida en las variables de entorno.");
    console.warn("[Config Advertencia] El servidor HTTP continuará activo para permitir verificaciones de salud de Render.");
}

module.exports = {
    GEMINI_API_KEY: rawApiKey,
    IS_CONFIGURED: isConfigured,
    PORT: parseInt(process.env.PORT, 10) || 3000,
    NODE_ENV: sanitizeInput(process.env.NODE_ENV || 'development', 30),
    BUSINESS_MORNING_START: validateTimeFormat(process.env.BUSINESS_MORNING_START, '08:30'),
    BUSINESS_MORNING_END: validateTimeFormat(process.env.BUSINESS_MORNING_END, '12:30'),
    BUSINESS_AFTERNOON_START: validateTimeFormat(process.env.BUSINESS_AFTERNOON_START, '14:00'),
    BUSINESS_AFTERNOON_END: validateTimeFormat(process.env.BUSINESS_AFTERNOON_END, '18:00'),
    PUPPETEER_EXECUTABLE_PATH: process.env.PUPPETEER_EXECUTABLE_PATH ? process.env.PUPPETEER_EXECUTABLE_PATH.trim() : undefined,
    WWEBJS_DATA_PATH: process.env.WWEBJS_DATA_PATH ? process.env.WWEBJS_DATA_PATH.trim() : './.wwebjs_auth'
};
