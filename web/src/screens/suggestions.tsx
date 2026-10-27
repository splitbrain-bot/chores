import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.ts';
import { TaskDialog, type TaskAction } from '../components/done-flow.tsx';
import { TaskCard } from '../components/task-card.tsx';
import { hintText } from '../format.ts';
import { t, time, weekdayDate } from '../i18n.ts';
import type { SuggestionsResponse } from '../types.ts';
import { useInterval } from '../use-interval.ts';

/** The main screen with the suggestions for now. */
export function Suggestions() {
    const [data, setData] = useState<SuggestionsResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [action, setAction] = useState<TaskAction | null>(null);

    const load = useCallback(() => {
        api<SuggestionsResponse>('GET', '/suggestions').then((r) => {
            setData(r);
            setError(null);
        }, (err: Error) => setError(err.message));
    }, []);
    const close = useCallback(() => {
        setAction(null);
        load();
    }, [load]);

    useEffect(load, [load]);
    useInterval(load, 60_000);

    if (!data) return <p className="status">{error ? t('common.error', { message: error }) : t('common.loading')}</p>;
    const home = data.presence.filter((p) => p.home);

    return (
        <section className="suggestions">
            <header className="status-bar">
                <span className="badges">
                    {home.length > 0
                        ? home.map((p) => <span key={p.personId} className="badge">{p.name}</span>)
                        : <span className="badge away">{t('suggestions.nobodyHome')}</span>}
                </span>
                <span className="capacity">{t('suggestions.capacity', { ...data.capacity })}</span>
            </header>

            <div className="task-list">
                {data.suggestions.map(({ chore, also }) => (
                    <TaskCard key={chore.id} chore={chore} related={also}
                        onDone={() => setAction({ kind: 'done', chore, related: also })}
                        onLater={() => setAction({ kind: 'later', chore, related: also })} />
                ))}
            </div>
            {action && <TaskDialog action={action} onClose={close} />}
            {data.suggestions.length === 0 && (
                <div className="empty">
                    {data.capacity.minutes === 0 && data.nextSlotAt
                        ? <>
                            <p>{t('suggestions.nothingNow')}</p>
                            <p>{t('suggestions.nextSlot', { time: time(data.nextSlotAt) })}</p>
                        </>
                        : <p>{t('suggestions.allDone')}</p>}
                </div>
            )}

            {data.hints.length > 0 && (
                <section className="outlook">
                    <h2>{t('suggestions.outlook')}</h2>
                    <ul>
                        {data.hints.map((h) => (
                            <li key={`${h.choreId}-${h.date}`}>
                                <strong>{weekdayDate(h.date)}</strong>: {h.choreName} <span className="reason">({hintText(h)})</span>
                            </li>
                        ))}
                    </ul>
                </section>
            )}
        </section>
    );
}
