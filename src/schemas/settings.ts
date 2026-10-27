import { z } from 'zod';

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

/** Schema of a capacity slot. */
export const slotSchema = z.object({
    days: z.array(z.number().int().min(0).max(6)).min(1).describe('Weekdays, 0 is Sunday. Holidays use Sunday.'),
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
    }, { message: 'Unknown time zone' })
        .describe('IANA time zone for the slots, the deadlines and the notifications, for example Europe/Berlin'),
    'slope.optional': z.number().min(0)
        .describe('Increase of the need level per interval after the interval is over, for optional chores'),
    'slope.normal': z.number().min(0)
        .describe('Increase of the need level per interval after the interval is over, for normal chores'),
    'slope.important': z.number().min(0)
        .describe('Increase of the need level per interval after the interval is over, for important chores'),
    'slope.critical': z.number().min(0)
        .describe('Increase of the need level per interval after the interval is over, for critical chores'),
    one_time_reference_days: z.number().positive()
        .describe('Days after its creation at which a one-time task gets the need level 1'),
    handover_after_hours: z.number().min(0)
        .describe('Hours of absence after which the persons at home can get the chores of an absent person'),
    handover_distance_km: z.number().min(0)
        .describe('Distance from home in km after which the persons at home can get the chores of an absent person'),
    suggest_threshold: z.number().min(0)
        .describe('Lowest need level for a suggestion. 1 means that the interval is over'),
    also_threshold: z.number().min(0)
        .describe('Lowest need level for a chore of the same group to show as also possible with a suggestion'),
    suggestion_count: z.number().int().min(1).max(10)
        .describe('Highest number of suggestions'),
    capacity_slots: z.array(slotSchema)
        .describe('Free minutes and energy of each person in time windows on some weekdays'),
    hangover_effort: z.number().int().min(1).max(6)
        .describe('Lowest effort of a done chore that decreases the energy of the person by 1 on the next day'),
    earlier_window_seconds: z.number().int().min(1).max(60)
        .describe('Seconds after a done tap in which the button necessary earlier shows'),
    earlier_max_need: z.number().min(0)
        .describe('Highest need level of a done event that allows the tap necessary earlier'),
    one_time_snooze_days: z.number().positive()
        .describe('Days that not yet pauses a one-time task. Each further not yet doubles the time, up to 56 days'),
    lookahead_days: z.number().int().min(1).max(14)
        .describe('Number of days of the look-ahead'),
    notify_hour: z.number().int().min(0).max(23)
        .describe('Local hour of the notifications'),
    notify_lookahead: z.boolean()
        .describe('Send the look-ahead hints for the weekend on Thursday'),
    holiday_calendar: z.string()
        .describe('Home Assistant calendar entity with the holidays'),
    holiday_state: z.string()
        .describe('State for the regional public holidays, for example Berlin'),
    weather_entity: z.string()
        .describe('Home Assistant weather entity for the daily forecast'),
    forecast_refresh_minutes: z.number().int().min(5)
        .describe('Minutes between two reads of the forecast'),
    calendar_refresh_minutes: z.number().int().min(1)
        .describe('Minutes between two reads of the calendars of the persons'),
    ha_frame_ancestors: z.array(z.url())
        .describe('Origins that can show the app in a frame, for example the URL of Home Assistant'),
});
