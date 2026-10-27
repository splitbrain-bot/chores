import { dayMonth, hasKey, monthName, num, t, time, weekdayName } from './i18n.ts';
import type { ChoreWithNeed, ConditionStatus, Hint, Suggestion } from './types.ts';

/**
 * Returns the explanation of the need level of a chore.
 *
 * @param chore the chore
 */
export function reasonText(chore: ChoreWithNeed | Suggestion['chore']): string {
    const r = chore.reason;
    switch (r.code) {
        case 'interval':
            return t('reason.interval', { interval: num(r.interval), elapsed: num(r.elapsed), unit: t(`unit.${r.unit}`),
                need: num(chore.need) });
        case 'deadline':
            // the deadline is the start of the day after the due date
            return t(r.overdueDays > 0 ? 'reason.overdue' : 'reason.deadline', { date: dayMonth(r.deadline - 1) });
        case 'boost':
            return t('reason.boost');
        case 'one_time':
            return t('reason.oneTime', { days: Math.floor(r.ageDays) });
    }
}

/**
 * Returns the translated reasons that keep a chore out of the suggestions.
 *
 * @param chore the chore
 */
export function blockedText(chore: ChoreWithNeed): string[] {
    return chore.blockedBy.map((code) => {
        if (code === 'snoozed' && chore.snoozedUntil) return t('blocked.snoozed', { time: time(chore.snoozedUntil) });
        const key = `blocked.${code}`;
        return hasKey(key) ? t(key) : code;
    });
}

/**
 * Returns the translated reasons of a look-ahead hint.
 *
 * @param hint the hint
 */
export function hintText(hint: Hint): string {
    return hint.reasons.map((r) => {
        switch (r.code) {
            case 'weather':
                return t('hint.weather', { condition: r.condition ?? '',
                    temperature: r.temperature !== null ? `${num(r.temperature)} °C` : '' }).trim();
            case 'free_time':
                return t('hint.free_time', { minutes: r.minutes });
            default:
                return t(`hint.${r.code}`);
        }
    }).filter(Boolean).join(', ');
}

/**
 * Formats a template result.
 *
 * @param result 1 or true for yes, 0 or false for no, null for no result
 */
function resultText(result: number | boolean | null): string {
    if (result === null) return t('condition.noResult');
    return result === 1 || result === true ? t('common.yes') : t('common.no');
}

/**
 * Returns the status of a condition: the current result of a state condition, or the result per day of a forecast
 * condition.
 *
 * @param condition the condition with its status
 */
export function conditionStatusText(condition: ConditionStatus): string {
    if (condition.kind === 'state') return t('condition.result', { result: resultText(condition.result) });
    if (condition.forecast.length === 0) return t('condition.noForecast');
    return t('condition.forecast', { days: condition.forecast
        .map((d) => `${weekdayName(new Date(`${d.date}T12:00:00`).getDay())} ${resultText(d.result)}`).join(', ') });
}

/**
 * Returns the months of a season as ranges of consecutive months, for example "Mar–May, Nov–Feb".
 *
 * @param months the months of the season, 1 is January
 */
export function seasonText(months: readonly number[]): string {
    // month 0 is December and month 13 is January, so that a range can go across the new year
    const on = (m: number) => months.includes(((m + 11) % 12) + 1);
    return months.filter((m) => !on(m - 1)).map((start) => {
        let end = start;
        while (on(end + 1) && (end % 12) + 1 !== start) end = (end % 12) + 1;
        return start === end ? monthName(start) : `${monthName(start)}–${monthName(end)}`;
    }).join(', ');
}

/**
 * Returns black or white, whichever is easier to read on a background color.
 *
 * @param color the background color as #rrggbb
 */
export function textColorOn(color: string): string {
    const [r, g, b] = [1, 3, 5].map((i) => {
        const c = parseInt(color.slice(i, i + 2), 16) / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b! > 0.179 ? '#000000' : '#ffffff';
}
