import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.ts';
import { TaskDialog, type TaskAction } from '../components/done-flow.tsx';
import { TaskCard } from '../components/task-card.tsx';
import { hintText } from '../format.ts';
import { t, time, weekdayDate } from '../i18n.ts';
import type { ChoreWithNeed, Hint } from '../types.ts';
import { useInterval } from '../use-interval.ts';

/** Response of the look-ahead endpoint. */
interface LookaheadResponse {
    hints: Hint[];
    forecastAge: number | null;
}

/** All look-ahead hints of the next days as task cards, grouped by day. */
export function Lookahead() {
    const [data, setData] = useState<{ lookahead: LookaheadResponse; chores: ChoreWithNeed[] } | null>(null);
    const [action, setAction] = useState<TaskAction | null>(null);

    const load = useCallback(() => {
        Promise.all([
            api<LookaheadResponse>('GET', '/lookahead'),
            api<{ chores: ChoreWithNeed[] }>('GET', '/chores'),
        ]).then(([lookahead, { chores }]) => setData({ lookahead, chores }), () => undefined);
    }, []);
    const close = useCallback(() => {
        setAction(null);
        load();
    }, [load]);
    useEffect(load, [load]);
    useInterval(load, 60_000);

    if (!data) return <p className="status">{t('common.loading')}</p>;
    const { lookahead, chores } = data;
    const related = (chore: ChoreWithNeed) => chores.filter((c) => c.name === chore.name && c.id !== chore.id);
    const entries = lookahead.hints.flatMap((hint) => {
        const chore = chores.find((c) => c.id === hint.choreId);
        return chore ? [{ hint, chore }] : [];
    });
    const days = [...new Set(entries.map((e) => e.hint.date))];

    return (
        <section className="lookahead">
            <h1>{t('lookahead.title')}</h1>
            {lookahead.forecastAge !== null && (
                <p className="meta">{t('lookahead.forecastAge', { time: time(Date.now() - lookahead.forecastAge) })}</p>
            )}
            {days.length === 0 && <p className="empty">{t('lookahead.empty')}</p>}
            {days.map((d) => (
                <section key={d}>
                    <h2>{weekdayDate(d)}</h2>
                    <div className="task-list compact">
                        {entries.filter((e) => e.hint.date === d).map(({ hint, chore }) => (
                            <TaskCard key={chore.id} chore={chore} related={related(chore)} hint={hintText(hint)}
                                onDone={() => setAction({ kind: 'done', chore, related: related(chore) })}
                                onLater={() => setAction({ kind: 'later', chore, related: related(chore) })} />
                        ))}
                    </div>
                </section>
            ))}
            {action && <TaskDialog action={action} onClose={close} />}
        </section>
    );
}
