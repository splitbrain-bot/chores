import { de } from './strings/de.ts';
import { en, type StringKey } from './strings/en.ts';

/** Language of the app: German when the browser language starts with de, English otherwise. */
export const lang: 'de' | 'en' = navigator.language.toLowerCase().startsWith('de') ? 'de' : 'en';

const strings: Record<StringKey, string> = lang === 'de' ? de : en;

/**
 * Returns a translated string with the placeholders replaced.
 *
 * @param key the string key
 * @param params values for the placeholders
 */
export function t(key: StringKey, params: Record<string, string | number> = {}): string {
    return strings[key].replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? `{${name}}`));
}

/**
 * Tells if a string key exists.
 *
 * @param key the possible key
 */
export function hasKey(key: string): key is StringKey {
    return key in strings;
}

/**
 * Formats a number with at most one decimal.
 *
 * @param n the number
 */
export function num(n: number): string {
    return n.toLocaleString(lang, { maximumFractionDigits: 1 });
}

/**
 * Formats a time as weekday and clock time, or only the clock time for today.
 *
 * @param ts milliseconds since the epoch
 */
export function time(ts: number): string {
    const d = new Date(ts);
    const today = new Date().toDateString() === d.toDateString();
    return d.toLocaleString(lang, today
        ? { hour: '2-digit', minute: '2-digit' }
        : { weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/**
 * Formats a date as day and month.
 *
 * @param ts milliseconds since the epoch
 */
export function dayMonth(ts: number): string {
    return new Date(ts).toLocaleDateString(lang, { day: 'numeric', month: 'numeric' });
}

/**
 * Formats a local date YYYY-MM-DD with the weekday.
 *
 * @param date the local date
 */
export function weekdayDate(date: string): string {
    return new Date(`${date}T12:00:00`).toLocaleDateString(lang, { weekday: 'long', day: 'numeric', month: 'numeric' });
}

/**
 * Returns the short name of a weekday.
 *
 * @param day the weekday, 0 is Sunday
 */
export function weekdayName(day: number): string {
    // 2026-11-01 is a Sunday
    return new Date(2026, 10, 1 + day).toLocaleDateString(lang, { weekday: 'short' });
}
