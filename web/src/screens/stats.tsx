import { useEffect, useState } from 'react';
import { api } from '../api.ts';
import { dayMonth, monthName, num, t } from '../i18n.ts';
import type { WeekStats } from '../types.ts';

/**
 * Returns the timestamp of the noon of a local date.
 *
 * @param date local date YYYY-MM-DD
 */
function noon(date: string): number {
    return new Date(`${date}T12:00:00`).getTime();
}

/**
 * The numbers of one week.
 *
 * @param props.title the name of the week
 * @param props.week the week, absent while there is no week
 */
function WeekTile({ title, week }: { title: string; week: WeekStats | undefined }) {
    return (
        <section className="week-tile">
            <h2>{title}</h2>
            <p><strong>{num(week?.tasks ?? 0)}</strong> {t('stats.tasks')}</p>
            <p><strong>{num(week?.effort ?? 0)}</strong> {t('stats.effort')}</p>
        </section>
    );
}

/** The two values of a week, with the class name of the line and the label. */
const SERIES = [
    { key: 'tasks', label: 'stats.tasks' },
    { key: 'effort', label: 'stats.effort' },
] as const;

/**
 * A line chart with the done chores and the effort points per week, and the name of the month below the first week
 * of each new month.
 *
 * @param props.weeks the weeks, oldest first
 */
function WeekChart({ weeks }: { weeks: WeekStats[] }) {
    const [hover, setHover] = useState<number | null>(null);
    const max = Math.max(1, ...weeks.map((w) => w.effort));
    const last = weeks.length - 1;
    const x = (i: number) => (i / last) * 100;
    const y = (v: number) => (v / max) * 100;
    const week = hover === null ? null : weeks[hover]!;

    return (
        <section className="week-chart">
            <h2>{t('stats.perWeek')}</h2>
            <div className="legend">
                {SERIES.map((s) => <span key={s.key}><span className={`line-key ${s.key}`} />{t(s.label)}</span>)}
            </div>
            <div className="plot" onPointerLeave={() => setHover(null)} onPointerMove={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setHover(Math.min(last, Math.max(0, Math.round(((e.clientX - rect.left) / rect.width) * last))));
            }}>
                <span className="max">{num(max)}</span>
                <svg viewBox={`0 0 ${last} ${max}`} preserveAspectRatio="none" aria-hidden="true">
                    {SERIES.map((s) => (
                        <polyline key={s.key} className={s.key} vectorEffect="non-scaling-stroke"
                            points={weeks.map((w, i) => `${i},${max - w[s.key]}`).join(' ')} />
                    ))}
                </svg>
                {week && (
                    <>
                        <div className="crosshair" style={{ left: `${x(hover!)}%` }} />
                        {SERIES.map((s) => (
                            <div key={s.key} className={`dot ${s.key}`}
                                style={{ left: `${x(hover!)}%`, bottom: `${y(week[s.key])}%` }} />
                        ))}
                        <div className="tooltip" style={x(hover!) < 50
                            ? { left: `calc(${x(hover!)}% + 8px)` } : { right: `calc(${100 - x(hover!)}% + 8px)` }}>
                            <p>{t('stats.week', { date: dayMonth(noon(week.start)) })}</p>
                            {SERIES.map((s) => (
                                <p key={s.key}>
                                    <span className={`line-key ${s.key}`} /><strong>{num(week[s.key])}</strong> {t(s.label)}
                                </p>
                            ))}
                        </div>
                    </>
                )}
            </div>
            <div className="months">
                {weeks.map((w, i) => {
                    const month = Number(w.start.slice(5, 7));
                    if (i === 0 || month === Number(weeks[i - 1]!.start.slice(5, 7))) return null;
                    return <span key={w.start} style={{ left: `${x(i)}%`, transform: `translateX(-${x(i)}%)` }}>
                        {monthName(month)}</span>;
                })}
            </div>
        </section>
    );
}

/** The done chores and effort points of the logged-in person per calendar week. */
export function Stats() {
    const [weeks, setWeeks] = useState<WeekStats[] | null>(null);

    useEffect(() => {
        api<{ weeks: WeekStats[] }>('GET', '/stats').then((r) => setWeeks(r.weeks), () => undefined);
    }, []);

    if (!weeks) return <p className="status">{t('common.loading')}</p>;
    return (
        <section className="stats">
            <h1>{t('stats.title')}</h1>
            <div className="week-tiles">
                <WeekTile title={t('stats.thisWeek')} week={weeks.at(-1)} />
                <WeekTile title={t('stats.lastWeek')} week={weeks.at(-2)} />
            </div>
            <WeekChart weeks={weeks} />
        </section>
    );
}
