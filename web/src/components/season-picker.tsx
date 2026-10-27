import { seasonText } from '../format.ts';
import { monthName, t } from '../i18n.ts';

/** The months, 1 is January. */
const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

/**
 * Twelve month buttons to select the months of a season. A tap switches a month on or off.
 *
 * @param props.months the months of the season, empty for the whole year
 * @param props.onChange receives the new months, sorted
 */
export function SeasonPicker({ months, onChange }: { months: number[]; onChange: (months: number[]) => void }) {
    return (
        <div className="season-picker">
            <div className="months">
                {MONTHS.map((m) => {
                    const on = months.includes(m);
                    return (
                        <button key={m} type="button" className={on ? 'chip on' : 'chip'} aria-pressed={on}
                            onClick={() => onChange(MONTHS.filter((x) => (x === m ? !on : months.includes(x))))}>
                            {monthName(m)}
                        </button>
                    );
                })}
            </div>
            <small className="hint">
                {months.length > 0 ? t('suggestions.season', { months: seasonText(months) }) : t('form.season.whole')}
                {months.length > 0 && (
                    <button type="button" className="link" onClick={() => onChange([])}>{t('form.season.whole')}</button>
                )}
            </small>
        </div>
    );
}
