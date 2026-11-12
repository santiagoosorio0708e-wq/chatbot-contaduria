import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
import { sanitizeInput } from '../utils/security.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rawApiKey = process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.trim() : '';
const isConfigured = Boolean(rawApiKey);

if (!isConfigured) {
    console.warn("[Config Advertencia] GEMINI_API_KEY no está definida en las variables de entorno.");
    console.warn("[Config Advertencia] El servidor HTTP continuará activo para permitir verificaciones de salud de Render.");
}

export const GEMINI_API_KEY = rawApiKey;
export const IS_CONFIGURED = isConfigured;
export const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
export const PORT = parseInt(process.env.PORT, 10) || 3000;
export const NODE_ENV = sanitizeInput(process.env.NODE_ENV || 'production', 30);
export const TIMEZONE = process.env.TIMEZONE || 'America/Bogota';
export const USE_PAIRING_CODE = process.env.USE_PAIRING_CODE === 'true';
export const PHONE_NUMBER = (process.env.PHONE_NUMBER || '').replace(/[^0-9]/g, '');
export const OFF_HOURS_COOLDOWN_MINUTES = parseInt(process.env.OFF_HOURS_COOLDOWN_MINUTES || '60', 10);
export const ENABLE_SCHEDULE_RESTRICTION = process.env.ENABLE_SCHEDULE_RESTRICTION !== 'false';
export const AUTH_FOLDER_PATH = path.resolve(__dirname, '../../auth_info');
export const CONTEXT_FILE_PATH = path.resolve(__dirname, '../../config/accounting_services_context.md');
export const SCHEDULE_CONFIG_PATH = path.resolve(__dirname, '../../config/schedule.json');
