import { useState } from 'react';
import { monthName, t } from '../i18n.ts';

/** The months, 1 is January. */
const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

/**
 * Tells if a month is in a season. A season with a last month before its first month goes across the new year.
 *
 * @param month the month
 * @param from the first month of the season
 * @param to the last month of the season
 */
function inSeason(month: number, from: number, to: number): boolean {
    return from <= to ? month >= from && month <= to : month >= from || month <= to;
}

/**
 * Twelve month buttons to select a season. The first tap sets the first month, the second tap sets the last month.
 *
 * @param props.from the first month, null for the whole year
 * @param props.to the last month, null for the whole year
 * @param props.onChange receives the new first and last month, both null for the whole year
 */
export function SeasonPicker({ from, to, onChange }:
    { from: number | null; to: number | null; onChange: (from: number | null, to: number | null) => void }) {
    const [waiting, setWaiting] = useState(false);
    const season = from !== null && to !== null;

    return (
        <div className="season-picker">
            <div className="months">
                {MONTHS.map((m) => {
                    const on = season && inSeason(m, from, to);
                    return (
                        <button key={m} type="button" className={on ? 'chip on' : 'chip'} aria-pressed={on} onClick={() => {
                            if (waiting && from !== null) onChange(from, m);
                            else onChange(m, m);
                            setWaiting(!waiting);
                        }}>{monthName(m)}</button>
                    );
                })}
            </div>
            <small className="hint">
                {waiting
                    ? t('form.season.last')
                    : season ? t('suggestions.season', { from: monthName(from), to: monthName(to) }) : t('form.season.whole')}
                {season && (
                    <button type="button" className="link" onClick={() => {
                        onChange(null, null);
                        setWaiting(false);
                    }}>{t('form.season.whole')}</button>
                )}
            </small>
        </div>
    );
}
