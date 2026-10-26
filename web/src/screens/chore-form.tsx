import { useEffect, useState, type ReactNode } from 'react';
import { api } from '../api.ts';
import { CategoryPicker } from '../components/category-picker.tsx';
import { useApp } from '../context.ts';
import { hasKey, num, t, time } from '../i18n.ts';
import { navigate } from '../router.ts';
import type { ChoreInput } from '../../../src/schemas/chore.ts';
import type { ChoreEvent, ChoreWithNeed, Person } from '../types.ts';

/** Values of the form. Text inputs hold strings, empty strings stand for no value. */
interface FormState {
    name: string;
    groupKey: string;
    kind: ChoreInput['kind'];
    growth: ChoreInput['growth'];
    interval: string;
    intervalMin: string;
    intervalMax: string;
    counterEntity: string;
    importance: ChoreInput['importance'];
    deadlineMd: string;
    deadlineAt: string;
    deadlineLeadDays: string;
    conditionTemplate: string;
    boostTemplate: string;
    forecastTemplate: string;
    durationMin: string;
    effort: string;
    assignment: ChoreInput['assignment'];
    personIds: number[];
    categoryIds: number[];
    seasonFrom: string;
    seasonTo: string;
    noisy: boolean;
    notes: string;
    lastDoneAt: string;
}

const EMPTY: FormState = {
    name: '', groupKey: '', kind: 'recurring', growth: 'usage', interval: '7', intervalMin: '', intervalMax: '',
    counterEntity: '', importance: 'normal', deadlineMd: '', deadlineAt: '', deadlineLeadDays: '14',
    conditionTemplate: '', boostTemplate: '', forecastTemplate: '', durationMin: '15', effort: '2', assignment: 'any',
    personIds: [], categoryIds: [], seasonFrom: '', seasonTo: '', noisy: false, notes: '', lastDoneAt: '',
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
        name: c.name, groupKey: s(c.groupKey), kind: c.kind, growth: c.growth, interval: s(c.interval),
        intervalMin: s(c.intervalMin), intervalMax: s(c.intervalMax), counterEntity: s(c.counterEntity),
        importance: c.importance, deadlineMd: s(c.deadlineMd),
        deadlineAt: c.deadlineAt === null ? '' : toLocalInput(c.deadlineAt).slice(0, 10),
        deadlineLeadDays: String(c.deadlineLeadDays), conditionTemplate: s(c.conditionTemplate),
        boostTemplate: s(c.boostTemplate), forecastTemplate: s(c.forecastTemplate), durationMin: String(c.durationMin),
        effort: String(c.effort), assignment: c.assignment, personIds: c.personIds, categoryIds: c.categoryIds,
        seasonFrom: s(c.seasonFrom), seasonTo: s(c.seasonTo), noisy: c.noisy, notes: s(c.notes),
        lastDoneAt: toLocalInput(c.lastDoneAt),
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
    return {
        name: f.name.trim(), groupKey: text(f.groupKey), kind: f.kind, growth: f.growth,
        interval: f.kind === 'one_time' ? null : number(f.interval),
        intervalMin: number(f.intervalMin), intervalMax: number(f.intervalMax),
        counterEntity: f.growth === 'counter' ? text(f.counterEntity) : null, importance: f.importance,
        deadlineMd: text(f.deadlineMd),
        deadlineAt: f.deadlineAt ? new Date(`${f.deadlineAt}T23:59:59`).getTime() : null,
        deadlineLeadDays: Number(f.deadlineLeadDays), conditionTemplate: text(f.conditionTemplate),
        boostTemplate: text(f.boostTemplate), forecastTemplate: text(f.forecastTemplate),
        durationMin: Number(f.durationMin), effort: Number(f.effort), assignment: f.assignment,
        personIds: f.personIds, categoryIds: f.categoryIds, seasonFrom: number(f.seasonFrom), seasonTo: number(f.seasonTo),
        noisy: f.noisy, notes: text(f.notes), lastDoneAt: f.lastDoneAt ? new Date(f.lastDoneAt).getTime() : undefined,
    };
}

/**
 * A labelled form field.
 *
 * @param props.label the label text
 * @param props.children the input
 */
function Field({ label, children }: { label: string; children: ReactNode }) {
    return <label className="field"><span>{label}</span>{children}</label>;
}

/**
 * Formats a template result.
 *
 * @param result 1, 0 or null
 */
function resultText(result: number | null): string {
    if (result === null) return '–';
    return result === 1 ? t('common.yes') : t('common.no');
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
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        api<{ persons: Person[] }>('GET', '/persons').then((r) => setPersons(r.persons), () => undefined);
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
    const select = <K extends 'kind' | 'growth' | 'importance' | 'assignment'>(key: K, options: FormState[K][]) => (
        <select name={key} value={form[key]} onChange={(e) => set(key, e.target.value as FormState[K])}>
            {options.map((o) => <option key={o} value={o}>{t(`form.${key}.${o}` as never)}</option>)}
        </select>
    );
    const unit = form.growth === 'counter' ? t('unit.cycles') : t('unit.days');

    if (id !== null && !chore) return <p className="status">{error ? t('common.error', { message: error }) : t('common.loading')}</p>;

    return (
        <form className="chore-form" onSubmit={(e) => {
            e.preventDefault();
            const request = id === null ? api('POST', '/chores', toInput(form)) : api('PATCH', `/chores/${id}`, toInput(form));
            request.then(() => navigate('/chores'), (err: Error) => setError(err.message));
        }}>
            <h1>{id === null ? t('form.titleNew') : t('form.titleEdit')}</h1>
            {error && <p className="error">{t('common.error', { message: error })}</p>}

            <Field label={t('form.name')}>{input('name', 'text', { required: true })}</Field>
            <Field label={t('form.categories')}>
                <CategoryPicker categories={categories} value={form.categoryIds} onChange={(ids) => set('categoryIds', ids)} />
            </Field>
            <div className="row">
                <Field label={t('form.kind')}>{select('kind', ['recurring', 'one_time'])}</Field>
                <Field label={t('form.growth')}>{select('growth', ['usage', 'time', 'counter'])}</Field>
                <Field label={t('form.importance')}>{select('importance', ['optional', 'normal', 'important', 'critical'])}</Field>
            </div>
            {form.kind === 'recurring' && (
                <div className="row">
                    <Field label={`${t('form.interval')} (${unit})`}>{input('interval', 'number', { step: 'any', min: 0, required: true })}</Field>
                    <Field label={t('form.intervalMin')}>{input('intervalMin', 'number', { step: 'any', min: 0 })}</Field>
                    <Field label={t('form.intervalMax')}>{input('intervalMax', 'number', { step: 'any', min: 0 })}</Field>
                </div>
            )}
            {form.growth === 'counter' && (
                <Field label={t('form.counterEntity')}>{input('counterEntity', 'text', { required: true })}</Field>
            )}
            <div className="row">
                <Field label={t('form.durationMin')}>{input('durationMin', 'number', { min: 1, required: true })}</Field>
                <Field label={t('form.effort')}>{input('effort', 'number', { min: 1, max: 5, required: true })}</Field>
            </div>
            <div className="row">
                <Field label={t('form.assignment')}>{select('assignment', ['any', 'all'])}</Field>
                <Field label={t('form.persons')}>
                    <div className="chips">
                        <button type="button" className={form.personIds.length === 0 ? 'chip on' : 'chip'}
                            aria-pressed={form.personIds.length === 0}
                            onClick={() => set('personIds', [])}>{t('form.allPersons')}</button>
                        {persons.map((p) => {
                            const on = form.personIds.includes(p.id);
                            return (
                                <button key={p.id} type="button" className={on ? 'chip on' : 'chip'} aria-pressed={on}
                                    onClick={() => set('personIds', on ? form.personIds.filter((x) => x !== p.id)
                                        : [...form.personIds, p.id])}>{p.name}</button>
                            );
                        })}
                    </div>
                </Field>
            </div>
            <div className="row">
                <Field label={t('form.seasonFrom')}>{input('seasonFrom', 'number', { min: 1, max: 12 })}</Field>
                <Field label={t('form.seasonTo')}>{input('seasonTo', 'number', { min: 1, max: 12 })}</Field>
            </div>
            <label className="check">
                <input type="checkbox" name="noisy" checked={form.noisy} onChange={(e) => set('noisy', e.target.checked)} />
                {t('form.noisy')}
            </label>
            <div className="row">
                <Field label={t('form.deadlineMd')}>{input('deadlineMd', 'text', { pattern: '\\d{2}-\\d{2}', placeholder: '11-15' })}</Field>
                <Field label={t('form.deadlineAt')}>{input('deadlineAt', 'date')}</Field>
                <Field label={t('form.deadlineLeadDays')}>{input('deadlineLeadDays', 'number', { min: 0 })}</Field>
            </div>
            <Field label={t('form.groupKey')}>{input('groupKey')}</Field>

            {(['conditionTemplate', 'boostTemplate', 'forecastTemplate'] as const).map((key) => (
                <Field key={key} label={t(`form.${key}`)}>
                    <textarea name={key} rows={2} value={form[key]} onChange={(e) => set(key, e.target.value)} />
                    {chore && key !== 'forecastTemplate' && chore[key] && (
                        <small className="template-result">
                            {t('form.templateResult', { result: resultText(key === 'conditionTemplate' ? chore.conditionResult
                                : chore.boostResult) })}
                            {chore.templateError && <span className="error"> {chore.templateError}</span>}
                        </small>
                    )}
                </Field>
            ))}
            <Field label={t('form.notes')}>
                <textarea name="notes" rows={3} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
            </Field>
            <Field label={t('form.lastDoneAt')}>{input('lastDoneAt', 'datetime-local')}</Field>

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
