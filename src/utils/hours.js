const { BUSINESS_HOURS_START, BUSINESS_HOURS_END } = require('../config');

function isWithinBusinessHours() {
    // Obtenemos la hora actual en Colombia (Bogotá)
    const options = { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit', hour12: false };
    const formatter = new Intl.DateTimeFormat('es-CO', options);
    const timeStr = formatter.format(new Date()); // ej. "14:30"
    
    // Comparación simple de strings "HH:mm" funciona correctamente si ambos tienen el mismo formato 24h
    return timeStr >= BUSINESS_HOURS_START && timeStr <= BUSINESS_HOURS_END;
}

module.exports = {
    isWithinBusinessHours
};
