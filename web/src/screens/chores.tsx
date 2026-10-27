import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.ts';
import { TaskDialog, type TaskAction } from '../components/done-flow.tsx';
import { TaskCard } from '../components/task-card.tsx';
import { useApp } from '../context.ts';
import { t } from '../i18n.ts';
import { navigate } from '../router.ts';
import type { ChoreWithNeed } from '../types.ts';
import { useInterval } from '../use-interval.ts';

/** The list of all chores, grouped by category or by group key. */
export function Chores() {
    const { categories, tablet } = useApp();
    const [chores, setChores] = useState<ChoreWithNeed[] | null>(null);
    const [query, setQuery] = useState('');
    const [dueOnly, setDueOnly] = useState(false);
    const [groupBy, setGroupBy] = useState<'category' | 'groupKey'>('category');
    const [action, setAction] = useState<TaskAction | null>(null);

    const load = useCallback(() => {
        api<{ chores: ChoreWithNeed[] }>('GET', '/chores').then((r) => setChores(r.chores), () => undefined);
    }, []);
    const close = useCallback(() => {
        setAction(null);
        load();
    }, [load]);
    useEffect(load, [load]);
    useInterval(load, 60_000);

    if (!chores) return <p className="status">{t('common.loading')}</p>;
    const related = (chore: ChoreWithNeed) => (chore.groupKey === null ? []
        : chores.filter((c) => c.groupKey === chore.groupKey && c.id !== chore.id));
    const q = query.trim().toLocaleLowerCase();
    const visible = chores
        .filter((c) => (!q || c.name.toLocaleLowerCase().includes(q)) && (!dueOnly || c.need >= 1))
        .sort((a, b) => b.need - a.need);

    const groupKeys = [...new Set(visible.map((c) => c.groupKey).filter((k) => k !== null))].sort((a, b) => a.localeCompare(b));
    const groups = (groupBy === 'category'
        ? [
            ...categories.map((cat) => ({ key: String(cat.id), name: cat.name,
                chores: visible.filter((c) => c.categoryIds.includes(cat.id)) })),
            { key: 'none', name: t('chores.noCategory'), chores: visible.filter((c) => c.categoryIds.length === 0) },
        ]
        : [
            ...groupKeys.map((k) => ({ key: k, name: k, chores: visible.filter((c) => c.groupKey === k) })),
            { key: 'none', name: t('chores.noGroupKey'), chores: visible.filter((c) => c.groupKey === null) },
        ]).filter((g) => g.chores.length > 0);

    return (
        <section className="chores">
            <div className="toolbar">
                <input type="search" placeholder={t('chores.search')} aria-label={t('chores.search')} value={query}
                    onChange={(e) => setQuery(e.target.value)} />
                <label className="check">
                    <input type="checkbox" checked={dueOnly} onChange={(e) => setDueOnly(e.target.checked)} />
                    {t('chores.dueOnly')}
                </label>
                <select aria-label={t('chores.groupBy')} value={groupBy}
                    onChange={(e) => setGroupBy(e.target.value as 'category' | 'groupKey')}>
                    <option value="category">{t('chores.groupBy.category')}</option>
                    <option value="groupKey">{t('chores.groupBy.groupKey')}</option>
                </select>
                {!tablet && <button type="button" onClick={() => navigate('/chores/new')}>{t('chores.new')}</button>}
            </div>
            {groups.length === 0 && <p className="empty">{t('chores.empty')}</p>}
            {groups.map((g) => (
                <section key={g.key}>
                    <h2>{g.name}</h2>
                    <div className="task-list compact">
                        {g.chores.map((c) => (
                            <TaskCard key={c.id} chore={c} related={related(c)}
                                onDone={() => setAction({ kind: 'done', chore: c, related: related(c) })}
                                onLater={() => setAction({ kind: 'later', chore: c, related: related(c) })} />
                        ))}
                    </div>
                </section>
            ))}
            {action && <TaskDialog action={action} onClose={close} />}
        </section>
    );
}
