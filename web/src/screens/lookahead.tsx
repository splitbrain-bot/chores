import { useEffect, useState } from 'react';
import { api } from '../api.ts';
import { hintText } from '../format.ts';
import { t, time, weekdayDate } from '../i18n.ts';
import type { Hint } from '../types.ts';

/** All look-ahead hints of the next days, grouped by day. */
export function Lookahead() {
    const [data, setData] = useState<{ hints: Hint[]; forecastAge: number | null } | null>(null);
    useEffect(() => {
        api<{ hints: Hint[]; forecastAge: number | null }>('GET', '/lookahead').then(setData, () => undefined);
    }, []);
    if (!data) return <p className="status">{t('common.loading')}</p>;

    const days = [...new Set(data.hints.map((h) => h.date))];
    return (
        <section className="lookahead">
            <h1>{t('lookahead.title')}</h1>
            {data.forecastAge !== null && <p className="meta">{t('lookahead.forecastAge', { time: time(Date.now() - data.forecastAge) })}</p>}
            {days.length === 0 && <p className="empty">{t('lookahead.empty')}</p>}
            {days.map((d) => (
                <section key={d}>
                    <h2>{weekdayDate(d)}</h2>
                    <ul>
                        {data.hints.filter((h) => h.date === d).map((h) => (
                            <li key={h.choreId}>{h.choreName} <span className="reason">({hintText(h)})</span></li>
                        ))}
                    </ul>
                </section>
            ))}
        </section>
    );
}
