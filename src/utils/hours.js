import fs from 'fs';
import { DateTime } from 'luxon';
import { 
    SCHEDULE_CONFIG_PATH, 
    TIMEZONE, 
    ENABLE_SCHEDULE_RESTRICTION, 
    OFF_HOURS_COOLDOWN_MINUTES 
} from '../config/index.js';

class ScheduleGuard {
    constructor() {
        this.config = this.loadConfig();
        this.offHoursNotifiedUsers = new Map(); // senderId -> timestamp ms
    }

    loadConfig() {
        try {
            if (fs.existsSync(SCHEDULE_CONFIG_PATH)) {
                const data = fs.readFileSync(SCHEDULE_CONFIG_PATH, 'utf8');
                return JSON.parse(data);
            }
        } catch (error) {
            console.error('⚠️ Error al leer schedule.json, usando valores por defecto:', error.message);
        }

        return {
            timezone: 'America/Bogota',
            weeklySchedule: {
                monday: { name: 'Lunes', isOpen: true, ranges: [{ start: '08:30', end: '12:30' }, { start: '14:00', end: '18:00' }] },
                tuesday: { name: 'Martes', isOpen: true, ranges: [{ start: '08:30', end: '12:30' }, { start: '14:00', end: '18:00' }] },
                wednesday: { name: 'Miércoles', isOpen: true, ranges: [{ start: '08:30', end: '12:30' }, { start: '14:00', end: '18:00' }] },
                thursday: { name: 'Jueves', isOpen: true, ranges: [{ start: '08:30', end: '12:30' }, { start: '14:00', end: '18:00' }] },
                friday: { name: 'Viernes', isOpen: true, ranges: [{ start: '08:30', end: '12:30' }, { start: '14:00', end: '18:00' }] },
                saturday: { name: 'Sábado', isOpen: false, ranges: [] },
                sunday: { name: 'Domingo', isOpen: false, ranges: [] }
            },
            offHoursMessage: '📊 *Despacho de Contaduría Pública*\n\n¡Hola! En este momento nos encontramos fuera de nuestro horario de atención (Lunes a Viernes de 8:30 AM a 12:30 PM y de 2:00 PM a 6:00 PM).\n\nTan pronto iniciemos nuestra jornada laboral, con mucho gusto atenderemos y responderemos tu solicitud. ¡Gracias por escribirnos!'
        };
    }

    getTimezone() {
        return TIMEZONE || this.config.timezone || 'America/Bogota';
    }

    getNow(customDateTime = null) {
        const tz = this.getTimezone();
        if (customDateTime) {
            return DateTime.fromISO(customDateTime, { zone: tz });
        }
        return DateTime.now().setZone(tz);
    }

    getDayKey(weekdayNumber) {
        // luxon: 1 = Lunes, 7 = Domingo
        const daysMap = {
            1: 'monday',
            2: 'tuesday',
            3: 'wednesday',
            4: 'thursday',
            5: 'friday',
            6: 'saturday',
            7: 'sunday'
        };
        return daysMap[weekdayNumber] || 'monday';
    }

    isWithinOperatingHours(customDateTime = null) {
        if (!ENABLE_SCHEDULE_RESTRICTION) {
            return {
                isOpen: true,
                reason: 'Restricción de horario desactivada en variables de entorno'
            };
        }

        const now = this.getNow(customDateTime);
        const dayKey = this.getDayKey(now.weekday);
        const dayConfig = this.config.weeklySchedule?.[dayKey];

        if (!dayConfig || !dayConfig.isOpen) {
            return {
                isOpen: false,
                currentTime: now.toFormat('yyyy-MM-dd HH:mm:ss (cccc)'),
                timezone: this.getTimezone(),
                reason: `Cerrado el día ${dayConfig?.name || dayKey}`
            };
        }

        const currentMinutes = now.hour * 60 + now.minute;

        for (const range of dayConfig.ranges || []) {
            const [startH, startM] = range.start.split(':').map(Number);
            const [endH, endM] = range.end.split(':').map(Number);

            const startMinutes = startH * 60 + startM;
            const endMinutes = endH * 60 + endM;

            if (currentMinutes >= startMinutes && currentMinutes <= endMinutes) {
                return {
                    isOpen: true,
                    currentTime: now.toFormat('yyyy-MM-dd HH:mm:ss (cccc)'),
                    timezone: this.getTimezone(),
                    activeRange: range
                };
            }
        }

        return {
            isOpen: false,
            currentTime: now.toFormat('yyyy-MM-dd HH:mm:ss (cccc)'),
            timezone: this.getTimezone(),
            reason: `Fuera del rango laboral del día ${dayConfig.name}`
        };
    }

    getOffHoursMessage() {
        return this.config.offHoursMessage;
    }

    shouldSendOffHoursNotification(senderId) {
        const cooldownMs = OFF_HOURS_COOLDOWN_MINUTES * 60 * 1000;
        const nowMs = Date.now();

        // Limpiar mapa si es muy grande
        if (this.offHoursNotifiedUsers.size > 200) {
            const oldestKeys = Array.from(this.offHoursNotifiedUsers.keys()).slice(0, 50);
            for (const k of oldestKeys) this.offHoursNotifiedUsers.delete(k);
        }

        const lastNotified = this.offHoursNotifiedUsers.get(senderId);

        if (!lastNotified || (nowMs - lastNotified) > cooldownMs) {
            this.offHoursNotifiedUsers.set(senderId, nowMs);
            return true;
        }

        return false;
    }
}

export const scheduleGuard = new ScheduleGuard();

// Función de compatibilidad simple
export function isWithinBusinessHours() {
    return scheduleGuard.isWithinOperatingHours().isOpen;
}
