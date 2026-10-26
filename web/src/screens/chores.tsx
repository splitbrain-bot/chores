import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.ts';
import { useApp } from '../context.ts';
import { blockedText } from '../format.ts';
import { num, t } from '../i18n.ts';
import { navigate } from '../router.ts';
import type { ChoreWithNeed } from '../types.ts';
import { useInterval } from '../use-interval.ts';

/**
 * One row of the chore list.
 *
 * @param props.chore the chore
 * @param props.onDone called after the done tap
 */
function ChoreRow({ chore, onDone }: { chore: ChoreWithNeed; onDone: () => void }) {
    const { tablet } = useApp();
    const blocked = blockedText(chore);
    return (
        <li className="chore-row">
            <button type="button" className="row-main" disabled={tablet} onClick={() => navigate(`/chores/${chore.id}`)}>
                <span className="name">{chore.name}</span>
                <span className="need" title={num(chore.need)}>
                    <span className={chore.need >= 1 ? 'bar due' : 'bar'} style={{ width: `${Math.min(chore.need, 2) * 50}%` }} />
                </span>
                {(blocked.length > 0 || chore.templateError) && (
                    <span className="blocked">
                        {[...blocked, ...(chore.templateError ? [t('chores.templateError')] : [])].join(', ')}
                    </span>
                )}
            </button>
            <button type="button" className="done" aria-label={t('chores.markDone')} title={t('chores.markDone')}
                onClick={() => api('POST', `/chores/${chore.id}/done`, { also: [] }).finally(onDone)}>✓</button>
        </li>
    );
}

/** The list of all chores, grouped by category. */
export function Chores() {
    const { categories, tablet } = useApp();
    const [chores, setChores] = useState<ChoreWithNeed[] | null>(null);
    const [query, setQuery] = useState('');
    const [dueOnly, setDueOnly] = useState(false);

    const load = useCallback(() => {
        api<{ chores: ChoreWithNeed[] }>('GET', '/chores').then((r) => setChores(r.chores), () => undefined);
    }, []);
    useEffect(load, [load]);
    useInterval(load, 60_000);

    if (!chores) return <p className="status">{t('common.loading')}</p>;
    const q = query.trim().toLocaleLowerCase();
    const visible = chores
        .filter((c) => (!q || c.name.toLocaleLowerCase().includes(q)) && (!dueOnly || c.need >= 1))
        .sort((a, b) => b.need - a.need);

    const groups = [
        ...categories.map((cat) => ({ key: String(cat.id), name: cat.name,
            chores: visible.filter((c) => c.categoryIds.includes(cat.id)) })),
        { key: 'none', name: t('chores.noCategory'), chores: visible.filter((c) => c.categoryIds.length === 0) },
    ].filter((g) => g.chores.length > 0);

    return (
        <section className="chores">
            <div className="toolbar">
                <input type="search" placeholder={t('chores.search')} aria-label={t('chores.search')} value={query}
                    onChange={(e) => setQuery(e.target.value)} />
                <label className="check">
                    <input type="checkbox" checked={dueOnly} onChange={(e) => setDueOnly(e.target.checked)} />
                    {t('chores.dueOnly')}
                </label>
                {!tablet && <button type="button" onClick={() => navigate('/chores/new')}>{t('chores.new')}</button>}
            </div>
            {groups.length === 0 && <p className="empty">{t('chores.empty')}</p>}
            {groups.map((g) => (
                <section key={g.key}>
                    <h2>{g.name}</h2>
                    <ul className="chore-list">
                        {g.chores.map((c) => <ChoreRow key={c.id} chore={c} onDone={load} />)}
                    </ul>
                </section>
            ))}
        </section>
    );
}
