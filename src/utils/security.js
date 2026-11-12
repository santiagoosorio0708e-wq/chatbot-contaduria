/**
 * Módulo de Utilidades de Seguridad para Node.js y JSON
 * 
 * Implementa defensas contra:
 * - Prototype Pollution (__proto__, constructor, prototype)
 * - Inyección y XSS en respuestas HTML / plantillas
 * - Inyección de caracteres de control y Null-Bytes (\0)
 * - Filtración accidental de API keys y datos sensibles en logs / JSON
 * - Ataques de denegación de servicio (DoS) por JSON bombs o payloads masivos
 * - Ataques de fuerza bruta / escaneo masivo (Rate Limiter deslizante en memoria)
 */

// Regex para detectar y ofuscar patrones de API Keys (como Google Gemini / AIza...)
const API_KEY_REGEX = /AIza[0-9A-Za-z-_]{35}|AQ\.[0-9A-Za-z-_]{40,}|key=[0-9A-Za-z-_]{20,}/gi;

/**
 * Sanitiza texto o errores eliminando cualquier rastro de API keys o credenciales.
 * @param {string|Error|any} data 
 * @returns {string} Texto seguro sin credenciales
 */
export function redactSensitiveData(data) {
    if (!data) return '';
    let str = typeof data === 'string' ? data : (data.stack || data.message || JSON.stringify(data));
    return str.replace(API_KEY_REGEX, '[REDACTED_API_KEY]');
}

/**
 * Parser de JSON seguro con protección integrada contra Prototype Pollution.
 * Elimina cualquier clave peligrosa (__proto__, constructor, prototype).
 * 
 * @param {string} jsonString - Cadena JSON a parsear
 * @param {any} [fallback=null] - Valor de respaldo en caso de error de parseo
 * @returns {any} Objeto parseado seguro o fallback
 */
export function safeJsonParse(jsonString, fallback = null) {
    if (typeof jsonString !== 'string' || !jsonString.trim()) {
        return fallback;
    }

    try {
        const parsed = JSON.parse(jsonString, (key, value) => {
            // Protección contra Prototype Pollution
            if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
                return undefined;
            }
            return value;
        });

        // Asegurar que el prototipo raíz no haya sido contaminado
        if (parsed && typeof parsed === 'object') {
            Object.setPrototypeOf(parsed, Object.prototype);
        }

        return parsed;
    } catch {
        return fallback;
    }
}

/**
 * Serializador JSON seguro que previene excepciones por referencias circulares
 * y ofusca campos sensibles.
 * 
 * @param {any} obj - Objeto a convertir a JSON
 * @param {number|string} [space=0] - Indentación
 * @returns {string} Cadena JSON segura
 */
export function safeJsonStringify(obj, space = 0) {
    const seen = new WeakSet();
    const sensitiveKeys = new Set(['key', 'apiKey', 'api_key', 'gemini_api_key', 'token', 'secret', 'password', 'authorization']);

    try {
        return JSON.stringify(obj, (key, value) => {
            // Prevenir Prototype Pollution en la salida
            if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
                return undefined;
            }

            // Ocultar campos sensibles
            if (typeof key === 'string' && sensitiveKeys.has(key.toLowerCase())) {
                return '[REDACTED]';
            }

            // Prevenir errores por referencias circulares
            if (typeof value === 'object' && value !== null) {
                if (seen.has(value)) {
                    return '[Circular]';
                }
                seen.add(value);
            }

            // Si es un string, sanitizar posibles API keys expuestas
            if (typeof value === 'string') {
                return redactSensitiveData(value);
            }

            return value;
        }, space);
    } catch (e) {
        return '{"error":"Error al serializar JSON"}';
    }
}

/**
 * Sanitiza texto entrante (de WhatsApp, parámetros HTTP, etc.):
 * - Elimina bytes nulos (\0) y caracteres de control no permitidos
 * - Limita la longitud máxima para prevenir DoS por consumo de memoria / tokens
 * 
 * @param {string} input - Texto a sanitizar
 * @param {number} [maxLength=1000] - Longitud máxima permitida
 * @returns {string} Texto limpio y recortado
 */
export function sanitizeInput(input, maxLength = 1000) {
    if (typeof input !== 'string') return '';

    // Eliminar caracteres nulos (\0), bytes de control peligrosos excepto salto de línea y tabulador
    let cleaned = input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

    cleaned = cleaned.trim();

    // Limitar longitud
    if (cleaned.length > maxLength) {
        cleaned = cleaned.slice(0, maxLength);
    }

    return cleaned;
}

/**
 * Escapa caracteres especiales de HTML para prevenir ataques XSS al renderizar en el navegador.
 * 
 * @param {string} str - Cadena potencialmente insegura
 * @returns {string} Cadena con entidades HTML escapadas
 */
export function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Genera un string JSON seguro para incrustar dentro de etiquetas <script> en HTML,
 * previniendo que secuencias como </script> o <!-- cierren la etiqueta prematuramente.
 * 
 * @param {any} data - Datos a serializar en el script
 * @returns {string} JSON seguro para HTML
 */
export function serializeForScript(data) {
    const json = safeJsonStringify(data);
    return json
        .replace(/</g, '\\u003c')
        .replace(/>/g, '\\u003e')
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029');
}

/**
 * Fábrica de Rate Limiter deslizante en memoria con limpieza periódica automática.
 * No requiere Redis ni bases de datos externas, ideal para contenedores ligeros.
 * 
 * @param {object} options
 * @param {number} [options.windowMs=60000] - Ventana de tiempo en milisegundos (por defecto 1 min)
 * @param {number} [options.maxRequests=60] - Máximo de peticiones permitidas por IP en la ventana
 * @returns {function(string): boolean} Función que recibe la IP y devuelve true si está permitida, false si excedió el límite
 */
export function createRateLimiter(options = {}) {
    const windowMs = options.windowMs || 60000;
    const maxRequests = options.maxRequests || 60;
    const ipHits = new Map();

    // Limpieza periódica para evitar fugas de memoria por acumulación de IPs
    const cleanupInterval = setInterval(() => {
        const now = Date.now();
        for (const [ip, record] of ipHits.entries()) {
            if (now - record.startTime > windowMs) {
                ipHits.delete(ip);
            }
        }
    }, Math.max(windowMs, 30000));

    if (cleanupInterval.unref) {
        cleanupInterval.unref(); // No impedir el apagado limpio del proceso
    }

    return function isAllowed(ip) {
        const now = Date.now();
        const clientIp = ip || 'unknown-client';
        const record = ipHits.get(clientIp);

        if (!record || now - record.startTime > windowMs) {
            ipHits.set(clientIp, { startTime: now, count: 1 });
            return true;
        }

        record.count += 1;
        if (record.count > maxRequests) {
            return false;
        }

        return true;
    };
}

// Regex para identificar emoticonos, emojis compuestos y modificadores Unicode
export const EMOJI_REGEX = /[\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Emoji_Component}\uFE0F\u200D\u20E3\s]/gu;

/**
 * Comprueba si una cadena contiene únicamente emoticonos/emojis o espacios en blanco.
 * @param {string} text
 * @returns {boolean}
 */
export function isPureEmoji(text) {
    if (typeof text !== 'string') return false;
    const stripped = text.replace(EMOJI_REGEX, '').trim();
    return stripped.length === 0;
}

/**
 * Detecta si un mensaje consiste en una sola letra, caracteres repetidos o palabras ininteligibles (gibberish/teclado).
 * @param {string} text
 * @returns {boolean}
 */
export function isUnintelligibleOrSingleChar(text) {
    if (!text || typeof text !== 'string') return true;
    const clean = text.trim();

    // 1. Longitud de 1 solo carácter (ej: 'a', 'x', '?', '1')
    if (clean.length <= 1) return true;

    // 2. Solo caracteres idénticos repetidos (ej: 'aaaaa', '.....', 'zzzz')
    if (/^(.)\1+$/i.test(clean)) return true;

    // 3. Solo signos de puntuación o símbolos sin letras ni números (ej: '???', '...', '!!!', '¿¿')
    if (/^[\p{P}\p{S}]+$/u.test(clean)) return true;

    // 4. Evaluación de una sola palabra
    const words = clean.split(/\s+/);
    if (words.length === 1) {
        const w = words[0].toLowerCase();

        // Si es puramente numérico pero tiene menos de 6 dígitos (ej: '12', '9', '42')
        if (/^\d+$/.test(w)) {
            return w.length < 6;
        }

        // Palabras legítimas ultra cortas de 2 letras en español:
        const validTwoLetters = ['si', 'sí', 'no', 'ok', 'ya', 'en', 'de', 'mi', 'un', 'va', 'he', 'ir', 'es', 'al'];
        if (w.length === 2) {
            return !validTwoLetters.includes(w);
        }

        // Si tiene 3 o más letras pero no contiene ninguna vocal (ej: 'sdf', 'qwrt', 'jkl')
        // En español todas las palabras tienen al menos una vocal
        if (w.length >= 3 && !/[aeiouáéíóúü]/i.test(w)) {
            return true;
        }

        // Patrones típicos de teclado al azar (keyboard smash)
        const smashPatterns = ['asdf', 'asdfg', 'asdfgh', 'qwerty', 'zxcv', 'qwert', 'lkjh', 'ghjk', 'hjkñ'];
        if (smashPatterns.some(p => w.includes(p))) {
            return true;
        }
    }

    return false;
}

/**
 * Resuelve de forma precisa y fidedigna la información de contacto de WhatsApp para un cliente.
 * Previene la generación de enlaces rotos 'wa.me/' con LIDs internos de 15 dígitos (@lid).
 * 
 * @param {string} senderId - JID de WhatsApp (ej: '573101234567@s.whatsapp.net' o '233908297838713@lid')
 * @param {string} [pushName='Cliente'] - Nombre público visible de WhatsApp
 * @param {Array<{role: string, content: string}>} [history=[]] - Historial de mensajes para extraer teléfonos provistos en el chat
 * @param {Map<string, string>} [knownLidMap=null] - Mapa opcional de LID a número de teléfono
 * @returns {{ phone: string|null, display: string, isDirectLink: boolean, note?: string }}
 */
export function resolveWhatsAppContact(senderId, pushName = 'Cliente', history = [], knownLidMap = null) {
    if (!senderId || typeof senderId !== 'string') {
        return {
            phone: null,
            display: pushName || 'Cliente',
            isDirectLink: false
        };
    }

    const cleanSender = senderId.trim();

    // 1. Si es un JID estándar de WhatsApp con número telefónico (@s.whatsapp.net o @c.us)
    if (cleanSender.endsWith('@s.whatsapp.net') || cleanSender.endsWith('@c.us')) {
        const rawPhone = cleanSender.split('@')[0].replace(/\D/g, '');
        if (rawPhone.length >= 8 && rawPhone.length <= 15) {
            return {
                phone: rawPhone,
                display: `+${rawPhone} (https://wa.me/${rawPhone})`,
                isDirectLink: true
            };
        }
    }

    // 2. Si es un LID (@lid) y tenemos mapeado su número real de teléfono
    if (knownLidMap && knownLidMap.has(cleanSender)) {
        const mappedRaw = knownLidMap.get(cleanSender).replace(/\D/g, '');
        if (mappedRaw.length >= 8 && mappedRaw.length <= 15) {
            return {
                phone: mappedRaw,
                display: `+${mappedRaw} (https://wa.me/${mappedRaw})`,
                isDirectLink: true
            };
        }
    }

    // 3. Si en el historial de la conversación el cliente escribió su número de teléfono celular (ej: Colombia: 3XX...)
    const fullConversationText = (Array.isArray(history) ? history : [])
        .map(h => (typeof h === 'string' ? h : h.content || ''))
        .join(' ');

    const colombianCellMatch = fullConversationText.match(/(?:(?:\+|00)?57\s*)?(3\d{2}[\s.-]?\d{3}[\s.-]?\d{4})\b/);
    if (colombianCellMatch) {
        const cleanCol = colombianCellMatch[1].replace(/\D/g, '');
        if (cleanCol.length === 10) {
            return {
                phone: `57${cleanCol}`,
                display: `+57 ${cleanCol} (https://wa.me/57${cleanCol}) [Número suministrado en chat]`,
                isDirectLink: true
            };
        }
    }

    // Cualquier otro número internacional de 10 a 13 dígitos escrito en el chat
    const genericPhoneMatch = fullConversationText.match(/\b(?:\+|00)?([1-9]\d{9,12})\b/);
    if (genericPhoneMatch) {
        const cleanGen = genericPhoneMatch[1].replace(/\D/g, '');
        if (cleanGen.length < 14) {
            return {
                phone: cleanGen,
                display: `+${cleanGen} (https://wa.me/${cleanGen}) [Número suministrado en chat]`,
                isDirectLink: true
            };
        }
    }

    // 4. Si el usuario está bajo privacidad (@lid) y no se tiene número de teléfono
    // NUNCA generar un enlace roto tipo https://wa.me/233...
    return {
        phone: null,
        display: `Chat directo en WhatsApp (${pushName || 'Cliente'}) [Número oculto por privacidad]`,
        isDirectLink: false,
        note: `El cliente tiene su número oculto por privacidad en WhatsApp. Para escribirle, abre la conversación existente con "${pushName || 'Cliente'}".`
    };
}

