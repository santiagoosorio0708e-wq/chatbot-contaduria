const { 
    BUSINESS_MORNING_START, BUSINESS_MORNING_END, 
    BUSINESS_AFTERNOON_START, BUSINESS_AFTERNOON_END 
} = require('../config');

function isWithinBusinessHours() {
    // Obtenemos la hora actual en Colombia (Bogotá)
    const options = { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit', hour12: false };
    const formatter = new Intl.DateTimeFormat('es-CO', options);
    const timeStr = formatter.format(new Date()); // ej. "14:30"
    
    const isMorning = timeStr >= BUSINESS_MORNING_START && timeStr <= BUSINESS_MORNING_END;
    const isAfternoon = timeStr >= BUSINESS_AFTERNOON_START && timeStr <= BUSINESS_AFTERNOON_END;

    // return isMorning || isAfternoon;
    return true; // TEMPORALMENTE ACTIVADO 24/7 PARA PRUEBAS
}

module.exports = {
    isWithinBusinessHours
};
