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
function redactSensitiveData(data) {
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
function safeJsonParse(jsonString, fallback = null) {
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
function safeJsonStringify(obj, space = 0) {
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
function sanitizeInput(input, maxLength = 1000) {
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
function escapeHtml(str) {
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
function serializeForScript(data) {
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
function createRateLimiter(options = {}) {
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

module.exports = {
    redactSensitiveData,
    safeJsonParse,
    safeJsonStringify,
    sanitizeInput,
    escapeHtml,
    serializeForScript,
    createRateLimiter
};
