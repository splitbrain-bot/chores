import { useEffect, useState, type ReactNode } from 'react';
import { api } from '../api.ts';
import { CategoryPicker } from '../components/category-picker.tsx';
import { EffortPicker } from '../components/effort-picker.tsx';
import { SeasonPicker } from '../components/season-picker.tsx';
import { useApp } from '../context.ts';
import { conditionStatusText } from '../format.ts';
import { hasKey, num, t, time } from '../i18n.ts';
import { navigate } from '../router.ts';
import type { ChoreInput } from '../../../src/schemas/chore.ts';
import type { ChoreEvent, ChoreWithNeed, ConditionStatus, Person } from '../types.ts';

/** Values of the form. Text inputs hold strings, empty strings stand for no value. */
interface FormState {
    name: string;
    kind: ChoreInput['kind'];
    interval: string;
    pausesWhenAway: boolean;
    /** Yearly deadline MM-DD for a recurring chore, or a date YYYY-MM-DD for a one-time task. */
    deadline: string;
    requiresId: string;
    triggerId: string;
    durationMin: string;
    effort: string;
    personIds: number[];
    categoryIds: number[];
    seasonMonths: number[];
    noisy: boolean;
    notes: string;
    lastDoneAt: string;
}

const EMPTY: FormState = {
    name: '', kind: 'recurring', interval: '7', pausesWhenAway: true, deadline: '', requiresId: '', triggerId: '',
    durationMin: '15', effort: '2', personIds: [], categoryIds: [], seasonMonths: [], noisy: false, notes: '',
    lastDoneAt: '',
};

/**
 * Formats a timestamp for a datetime-local input.
 *
 * @param ts milliseconds since the epoch
 */
function toLocalInput(ts: number): string {
    const d = new Date(ts - new Date(ts).getTimezoneOffset() * 60_000);
    return d.toISOString().slice(0, 16);
}

/**
 * Converts a chore to form values.
 *
 * @param c the chore
 */
function toForm(c: ChoreWithNeed): FormState {
    const s = (v: number | string | null) => (v === null ? '' : String(v));
    return {
        name: c.name, kind: c.kind, interval: s(c.interval), pausesWhenAway: c.pausesWhenAway,
        deadline: c.deadlineAt !== null ? toLocalInput(c.deadlineAt).slice(0, 10) : s(c.deadlineMd),
        requiresId: s(c.requiresId), triggerId: s(c.triggerId), durationMin: String(c.durationMin),
        effort: String(c.effort), personIds: c.personIds, categoryIds: c.categoryIds,
        seasonMonths: c.seasonMonths, noisy: c.noisy, notes: s(c.notes),
        lastDoneAt: c.lastDoneAt === null ? '' : toLocalInput(c.lastDoneAt),
    };
}

/**
 * Converts form values to the API input.
 *
 * @param f the form values
 */
function toInput(f: FormState): ChoreInput {
    const text = (v: string) => (v.trim() === '' ? null : v.trim());
    const number = (v: string) => (v.trim() === '' ? null : Number(v));
    const deadline = text(f.deadline);
    return {
        name: f.name.trim(), kind: f.kind,
        interval: f.kind === 'one_time' ? null : number(f.interval),
        pausesWhenAway: f.pausesWhenAway,
        deadline: deadline === null ? null : f.kind === 'one_time' ? new Date(`${deadline}T23:59:59`).getTime() : deadline,
        requiresId: number(f.requiresId), triggerId: number(f.triggerId),
        durationMin: Number(f.durationMin), effort: Number(f.effort),
        personIds: f.personIds, categoryIds: f.categoryIds, seasonMonths: f.seasonMonths,
        noisy: f.noisy, notes: text(f.notes),
        lastDoneAt: f.kind === 'recurring' && f.lastDoneAt ? new Date(f.lastDoneAt).getTime() : null,
    };
}

/**
 * A labelled form field. A group of buttons gets a named group instead of a label.
 *
 * @param props.label the label text
 * @param props.group true for a group of buttons
 * @param props.children the input
 */
function Field({ label, group = false, children }: { label: string; group?: boolean; children: ReactNode }) {
    if (group) return <div className="field" role="group" aria-label={label}><span>{label}</span>{children}</div>;
    return <label className="field"><span>{label}</span>{children}</label>;
}

/**
 * The form for a new or an existing chore.
 *
 * @param props.id the chore id, or null for a new chore
 */
export function ChoreForm({ id }: { id: number | null }) {
    const { categories } = useApp();
    const [form, setForm] = useState<FormState>(EMPTY);
    const [chore, setChore] = useState<ChoreWithNeed | null>(null);
    const [events, setEvents] = useState<ChoreEvent[]>([]);
    const [persons, setPersons] = useState<Person[]>([]);
    const [conditions, setConditions] = useState<ConditionStatus[]>([]);
    const [names, setNames] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        api<{ persons: Person[] }>('GET', '/persons').then((r) => setPersons(r.persons), () => undefined);
        api<{ conditions: ConditionStatus[] }>('GET', '/conditions').then((r) => setConditions(r.conditions), () => undefined);
        api<{ names: string[] }>('GET', '/chores/names').then((r) => setNames(r.names), () => undefined);
        if (id === null) return;
        api<{ chore: ChoreWithNeed; events: ChoreEvent[] }>('GET', `/chores/${id}`).then((r) => {
            setChore(r.chore);
            setEvents(r.events);
            setForm(toForm(r.chore));
        }, (err: Error) => setError(err.message));
    }, [id]);

    const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));
    const input = (key: keyof FormState, type = 'text', extra: Record<string, unknown> = {}) => (
        <input name={key} type={type} value={String(form[key])} onChange={(e) => set(key, e.target.value as never)} {...extra} />
    );
    const check = (key: 'pausesWhenAway' | 'noisy', label: string) => (
        <label className="check">
            <input type="checkbox" name={key} checked={form[key]} onChange={(e) => set(key, e.target.checked)} />
            {label}
        </label>
    );

    if (id !== null && !chore) return <p className="status">{error ? t('common.error', { message: error }) : t('common.loading')}</p>;

    return (
        <form className="chore-form" onSubmit={(e) => {
            e.preventDefault();
            const request = id === null ? api('POST', '/chores', toInput(form)) : api('PATCH', `/chores/${id}`, toInput(form));
            request.then(() => navigate('/chores'), (err: Error) => setError(err.message));
        }}>
            <h1>{id === null ? t('form.titleNew') : t('form.titleEdit')}</h1>
            {error && <p className="error">{t('common.error', { message: error })}</p>}

            <Field label={t('form.name')}>
                {input('name', 'text', { required: true, list: 'chore-names', autoComplete: 'off' })}
                <datalist id="chore-names">{names.map((n) => <option key={n} value={n} />)}</datalist>
                <small className="hint">{t('form.nameHint')}</small>
            </Field>
            <Field label={t('form.categories')} group>
                <CategoryPicker categories={categories} value={form.categoryIds} onChange={(ids) => set('categoryIds', ids)} />
            </Field>
            <div className="row">
                <Field label={t('form.kind')}>
                    <select name="kind" value={form.kind} onChange={(e) => set('kind', e.target.value as FormState['kind'])}>
                        <option value="recurring">{t('form.kind.recurring')}</option>
                        <option value="one_time">{t('form.kind.one_time')}</option>
                    </select>
                </Field>
                {form.kind === 'recurring' && (
                    <Field label={t('form.interval')}>{input('interval', 'number', { step: 'any', min: 0, required: true })}</Field>
                )}
            </div>
            {form.kind === 'recurring' && check('pausesWhenAway', t('form.pausesWhenAway'))}
            <div className="row">
                <Field label={t('form.durationMin')}>{input('durationMin', 'number', { min: 1, required: true })}</Field>
                <Field label={t('form.effort')} group>
                    <EffortPicker value={Number(form.effort)} label={t('form.effort')} onChange={(n) => set('effort', String(n))} />
                </Field>
            </div>
            <Field label={t('form.persons')} group>
                <div className="chips">
                    {persons.map((p) => {
                        const on = form.personIds.includes(p.id);
                        return (
                            <button key={p.id} type="button" className={on ? 'chip on' : 'chip'} aria-pressed={on}
                                onClick={() => set('personIds', on ? form.personIds.filter((x) => x !== p.id)
                                    : [...form.personIds, p.id])}>{p.name}</button>
                        );
                    })}
                </div>
                <small className="hint">{t('form.personsHint')}</small>
            </Field>
            <Field label={t('form.season')} group>
                <SeasonPicker months={form.seasonMonths} onChange={(months) => set('seasonMonths', months)} />
            </Field>
            {check('noisy', t('form.noisy'))}
            <Field label={form.kind === 'recurring' ? t('form.deadlineMd') : t('form.deadlineAt')}>
                {form.kind === 'recurring'
                    ? input('deadline', 'text', { pattern: '\\d{2}-\\d{2}', placeholder: '11-15' })
                    : input('deadline', 'date')}
                <small className="hint">{t('form.deadlineHint')}</small>
            </Field>

            {(['requiresId', 'triggerId'] as const).map((key) => {
                const selected = conditions.find((c) => String(c.id) === form[key]);
                return (
                    <Field key={key} label={t(`form.${key}`)}>
                        <select name={key} value={form[key]} onChange={(e) => set(key, e.target.value)}>
                            <option value="">–</option>
                            {conditions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                        <small className="hint">
                            {t(`form.${key}Hint`)}
                            {selected && <> {conditionStatusText(selected)}</>}
                            {selected?.error && <span className="error"> {selected.error}</span>}
                        </small>
                    </Field>
                );
            })}
            <Field label={t('form.notes')}>
                <textarea name="notes" rows={3} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
            </Field>
            {form.kind === 'recurring' && <Field label={t('form.lastDoneAt')}>{input('lastDoneAt', 'datetime-local')}</Field>}

            <div className="actions">
                <button type="submit" className="primary">{t('common.save')}</button>
                <button type="button" onClick={() => navigate('/chores')}>{t('common.cancel')}</button>
                {id !== null && (
                    <button type="button" className="danger" onClick={() => {
                        if (confirm(t('form.deleteConfirm'))) api('DELETE', `/chores/${id}`).then(() => navigate('/chores'));
                    }}>{t('common.delete')}</button>
                )}
            </div>

            {events.length > 0 && (
                <section className="history">
                    <h2>{t('form.history')}</h2>
                    <ul>
                        {events.map((e) => (
                            <li key={e.id}>
                                {time(e.at)}: {t(`form.event.${e.type}`)}
                                {e.reason && hasKey(`suggestions.${camel(e.reason)}`) && ` (${t(`suggestions.${camel(e.reason)}` as never)})`}
                                {e.intervalBefore !== null && e.intervalAfter !== null && e.intervalBefore !== e.intervalAfter
                                    && `, ${t('form.intervalChange', { before: num(e.intervalBefore), after: num(e.intervalAfter) })}`}
                            </li>
                        ))}
                    </ul>
                </section>
            )}
        </form>
    );
}

/**
 * Converts a snake case reason to the camel case of the string keys.
 *
 * @param reason the postpone reason
 */
function camel(reason: string): string {
    return reason.replace(/_(\w)/g, (_, c: string) => c.toUpperCase());
}
