import { z } from 'zod';

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

/** Schema of a capacity slot. */
export const slotSchema = z.object({
    dayType: z.enum(['workday', 'weekend']),
    from: time,
    to: time,
    minutes: z.number().int().min(0).max(1440),
    energy: z.number().int().min(0).max(5),
}).refine((s) => s.from < s.to, { message: 'A slot must end after its start' });

/** Schema of all settings. */
export const settingsSchema = z.object({
    time_zone: z.string().refine((tz) => {
        try {
            new Intl.DateTimeFormat('en', { timeZone: tz });
            return true;
        } catch {
            return false;
        }
    }, { message: 'Unknown time zone' }),
    'slope.optional': z.number().min(0),
    'slope.normal': z.number().min(0),
    'slope.important': z.number().min(0),
    'slope.critical': z.number().min(0),
    one_time_reference_days: z.number().positive(),
    handover_after_hours: z.number().min(0),
    handover_distance_km: z.number().min(0),
    suggest_threshold: z.number().min(0),
    also_threshold: z.number().min(0),
    suggestion_count: z.number().int().min(1).max(10),
    capacity_slots: z.array(slotSchema),
    hangover_effort: z.number().int().min(1).max(6),
    earlier_window_seconds: z.number().int().min(1).max(60),
    one_time_snooze_days: z.number().positive(),
    lookahead_days: z.number().int().min(1).max(14),
    notify_hour: z.number().int().min(0).max(23),
    notify_lookahead: z.boolean(),
    holiday_calendar: z.string(),
    holiday_state: z.string(),
    weather_entity: z.string(),
    forecast_refresh_minutes: z.number().int().min(5),
    calendar_refresh_minutes: z.number().int().min(1),
    ha_frame_ancestors: z.array(z.url()),
});
