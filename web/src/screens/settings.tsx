import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.ts';
import { useApp } from '../context.ts';
import { conditionStatusText } from '../format.ts';
import { t, time, weekdayName } from '../i18n.ts';
import type { ConditionStatus, Person, Settings, Token } from '../types.ts';

/** Weekdays in the order of the slot table, 0 is Sunday. */
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0];

type Tab = 'capacity' | 'parameters' | 'persons' | 'categories' | 'conditions' | 'tokens';

/**
 * Loads the settings and stores changes.
 */
function useSettings(): [Settings | null, (s: Settings) => Promise<void>, string | null] {
    const [settings, setSettings] = useState<Settings | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    useEffect(() => {
        api<{ settings: Settings }>('GET', '/settings').then((r) => setSettings(r.settings), () => undefined);
    }, []);
    const save = useCallback(async (s: Settings) => {
        try {
            const r = await api<{ settings: Settings }>('PUT', '/settings', s);
            setSettings(r.settings);
            setMessage(t('settings.saved'));
        } catch (err) {
            setMessage(t('common.error', { message: (err as Error).message }));
        }
    }, []);
    return [settings, save, message];
}

/**
 * The table of the capacity slots.
 *
 * @param props.settings the settings
 * @param props.onSave stores the settings
 */
function CapacityTab({ settings, onSave }: { settings: Settings; onSave: (s: Settings) => void }) {
    const [slots, setSlots] = useState(settings.capacity_slots);
    const update = (i: number, values: Partial<Settings['capacity_slots'][number]>) =>
        setSlots(slots.map((s, j) => (j === i ? { ...s, ...values } : s)));
    return (
        <form onSubmit={(e) => {
            e.preventDefault();
            onSave({ ...settings, capacity_slots: slots });
        }}>
            <div className="table-scroll">
            <table className="slots">
                <thead>
                    <tr>
                        {WEEKDAYS.map((d) => <th key={d} className="day">{weekdayName(d)}</th>)}
                        <th>{t('settings.from')}</th><th>{t('settings.to')}</th>
                        <th>{t('settings.minutes')}</th><th>{t('settings.energy')}</th><th />
                    </tr>
                </thead>
                <tbody>
                    {slots.map((s, i) => (
                        <tr key={i}>
                            {WEEKDAYS.map((d) => (
                                <td key={d} className="day">
                                    <input type="checkbox" aria-label={weekdayName(d)} checked={s.days.includes(d)}
                                        onChange={(e) => update(i, { days: e.target.checked
                                            ? WEEKDAYS.filter((w) => w === d || s.days.includes(w))
                                            : s.days.filter((w) => w !== d) })} />
                                </td>
                            ))}
                            <td><input type="time" value={s.from} onChange={(e) => update(i, { from: e.target.value })} /></td>
                            <td><input type="time" value={s.to} onChange={(e) => update(i, { to: e.target.value })} /></td>
                            <td><input type="number" min={0} value={s.minutes} onChange={(e) => update(i, { minutes: Number(e.target.value) })} /></td>
                            <td><input type="number" min={0} max={5} value={s.energy} onChange={(e) => update(i, { energy: Number(e.target.value) })} /></td>
                            <td><button type="button" className="link" onClick={() => setSlots(slots.filter((_, j) => j !== i))}>{t('common.delete')}</button></td>
                        </tr>
                    ))}
                </tbody>
            </table>
            </div>
            <p className="hint">{t('settings.holidaySlots')}</p>
            <div className="actions">
                <button type="button" onClick={() => setSlots([...slots, { days: [6, 0], from: '08:00', to: '12:00', minutes: 60, energy: 3 }])}>
                    {t('settings.addSlot')}
                </button>
                <button type="submit" className="primary">{t('common.save')}</button>
            </div>
        </form>
    );
}

/**
 * The tuning values as a list of inputs.
 *
 * @param props.settings the settings
 * @param props.onSave stores the settings
 */
function ParametersTab({ settings, onSave }: { settings: Settings; onSave: (s: Settings) => void }) {
    const [values, setValues] = useState<Settings>(settings);
    const keys = (Object.keys(settings) as (keyof Settings)[])
        .filter((k): k is Exclude<keyof Settings, 'capacity_slots'> => k !== 'capacity_slots');
    return (
        <form className="parameters" onSubmit={(e) => {
            e.preventDefault();
            onSave(values);
        }}>
            {keys.map((key) => {
                const value = values[key];
                const set = (v: unknown) => setValues({ ...values, [key]: v });
                return (
                    <label key={key} className="field">
                        <span>{key}</span>
                        {typeof value === 'boolean'
                            ? <input type="checkbox" checked={value} onChange={(e) => set(e.target.checked)} />
                            : typeof value === 'number'
                                ? <input type="number" step="any" value={value} onChange={(e) => set(Number(e.target.value))} />
                                : Array.isArray(value)
                                    ? <input value={value.join(' ')} onChange={(e) => set(e.target.value.split(/\s+/).filter(Boolean))} />
                                    : <input value={String(value)} onChange={(e) => set(e.target.value)} />}
                        <small className="hint">{t(`param.${key}`)}</small>
                    </label>
                );
            })}
            <div className="actions"><button type="submit" className="primary">{t('common.save')}</button></div>
        </form>
    );
}

/** Values of the person form. */
type PersonForm = { name: string; haEntity: string; distanceEntity: string; calendarEntity: string; notifyAction: string;
    password: string };

/**
 * The form of one person.
 *
 * @param props.person the person, or null for a new person
 * @param props.onSaved called after the save
 */
function PersonEditor({ person, onSaved }: { person: Person | null; onSaved: () => void }) {
    const [f, setF] = useState<PersonForm>({
        name: person?.name ?? '', haEntity: person?.haEntity ?? '', distanceEntity: person?.distanceEntity ?? '',
        calendarEntity: person?.calendarEntity ?? '', notifyAction: person?.notifyAction ?? '', password: '',
    });
    const [error, setError] = useState<string | null>(null);
    const field = (key: keyof PersonForm, type = 'text') => (
        <label className="field">
            <span>{t(`settings.person.${key}`)}</span>
            <input type={type} value={f[key]} onChange={(e) => setF({ ...f, [key]: e.target.value })}
                autoComplete={type === 'password' ? 'new-password' : undefined} />
        </label>
    );
    return (
        <form className="person" onSubmit={(e) => {
            e.preventDefault();
            const body = {
                name: f.name, haEntity: f.haEntity || null, distanceEntity: f.distanceEntity || null,
                calendarEntity: f.calendarEntity || null, notifyAction: f.notifyAction || null,
                ...(f.password ? { password: f.password } : {}),
            };
            const request = person ? api('PATCH', `/persons/${person.id}`, body) : api('POST', '/persons', body);
            request.then(() => {
                setF({ ...f, password: '' });
                onSaved();
            }, (err: Error) => setError(err.message));
        }}>
            {field('name')}{field('haEntity')}{field('distanceEntity')}{field('calendarEntity')}{field('notifyAction')}
            {field('password', 'password')}
            {error && <p className="error">{t('common.error', { message: error })}</p>}
            <button type="submit">{person ? t('common.save') : t('settings.person.add')}</button>
        </form>
    );
}

/** The list of the persons with their forms. */
function PersonsTab() {
    const [persons, setPersons] = useState<Person[]>([]);
    const load = useCallback(() => {
        api<{ persons: Person[] }>('GET', '/persons').then((r) => setPersons(r.persons), () => undefined);
    }, []);
    useEffect(load, [load]);
    return (
        <div>
            {persons.map((p) => <PersonEditor key={`${p.id}-${p.name}`} person={p} onSaved={load} />)}
            <PersonEditor key={`new-${persons.length}`} person={null} onSaved={load} />
        </div>
    );
}

/** The list of the categories. */
function CategoriesTab() {
    const { categories, reloadCategories } = useApp();
    const [name, setName] = useState('');
    return (
        <div>
            <ul className="categories-list">
                {categories.map((c) => (
                    <li key={c.id}>
                        <input defaultValue={c.name} aria-label={t('settings.person.name')} onBlur={(e) => {
                            if (e.target.value.trim() && e.target.value !== c.name) {
                                api('PATCH', `/categories/${c.id}`, { name: e.target.value.trim() }).finally(reloadCategories);
                            }
                        }} />
                        <button type="button" className="link" onClick={() => {
                            api('DELETE', `/categories/${c.id}`).finally(reloadCategories);
                        }}>{t('common.delete')}</button>
                    </li>
                ))}
            </ul>
            <form onSubmit={(e) => {
                e.preventDefault();
                api('POST', '/categories', { name, sort: categories.length }).then(() => setName('')).finally(reloadCategories);
            }}>
                <input value={name} onChange={(e) => setName(e.target.value)} aria-label={t('settings.category.add')} required />
                <button type="submit">{t('settings.category.add')}</button>
            </form>
        </div>
    );
}

/** Values of the condition form. */
type ConditionForm = { name: string; kind: ConditionStatus['kind']; template: string };

/**
 * The form of one condition with its status. The kind of an existing condition cannot change.
 *
 * @param props.condition the condition, or null for a new condition
 * @param props.onSaved called after a save or a delete
 */
function ConditionEditor({ condition, onSaved }: { condition: ConditionStatus | null; onSaved: () => void }) {
    const [f, setF] = useState<ConditionForm>({
        name: condition?.name ?? '', kind: condition?.kind ?? 'state', template: condition?.template ?? '',
    });
    const [error, setError] = useState<string | null>(null);
    const send = (request: Promise<unknown>) => request.then(onSaved, (err: Error) => setError(err.message));
    return (
        <form className="condition" onSubmit={(e) => {
            e.preventDefault();
            send(condition
                ? api('PATCH', `/conditions/${condition.id}`, { name: f.name, template: f.template })
                : api('POST', '/conditions', f));
        }}>
            <label className="field">
                <span>{t('settings.condition.name')}</span>
                <input value={f.name} required onChange={(e) => setF({ ...f, name: e.target.value })} />
            </label>
            <label className="field">
                <span>{t('settings.condition.kind')}</span>
                <select value={f.kind} disabled={condition !== null}
                    onChange={(e) => setF({ ...f, kind: e.target.value as ConditionForm['kind'] })}>
                    <option value="state">{t('settings.condition.kind.state')}</option>
                    <option value="forecast">{t('settings.condition.kind.forecast')}</option>
                </select>
            </label>
            <label className="field">
                <span>{t('settings.condition.template')}</span>
                <textarea rows={2} value={f.template} required onChange={(e) => setF({ ...f, template: e.target.value })} />
            </label>
            {f.kind === 'forecast' && <p className="hint">{t('settings.condition.forecastHint')}</p>}
            {condition && (
                <p className="template-result">
                    {conditionStatusText(condition)}
                    {condition.error && <span className="error"> {condition.error}</span>}
                    <br />
                    {t('settings.condition.usedBy', { n: condition.choreIds.length })}
                </p>
            )}
            {error && <p className="error">{t('common.error', { message: error })}</p>}
            <div className="actions">
                <button type="submit">{condition ? t('common.save') : t('settings.condition.add')}</button>
                {condition && (
                    <button type="button" className="link" onClick={() => send(api('DELETE', `/conditions/${condition.id}`))}>
                        {t('common.delete')}
                    </button>
                )}
            </div>
        </form>
    );
}

/** The list of the conditions with their forms. */
function ConditionsTab() {
    const [conditions, setConditions] = useState<ConditionStatus[]>([]);
    const load = useCallback(() => {
        api<{ conditions: ConditionStatus[] }>('GET', '/conditions').then((r) => setConditions(r.conditions), () => undefined);
    }, []);
    useEffect(load, [load]);
    return (
        <div>
            {conditions.map((c) => <ConditionEditor key={`${c.id}-${c.name}-${c.template}`} condition={c} onSaved={load} />)}
            <ConditionEditor key={`new-${conditions.length}`} condition={null} onSaved={load} />
        </div>
    );
}

/** The list of the tokens with the forms for new device and MCP tokens. */
function TokensTab() {
    const [tokens, setTokens] = useState<Token[]>([]);
    const [persons, setPersons] = useState<Person[]>([]);
    const [created, setCreated] = useState<{ kind: 'shared' | 'mcp'; plain: string } | null>(null);
    const [label, setLabel] = useState('');
    const [personId, setPersonId] = useState('');
    const load = useCallback(() => {
        api<{ tokens: Token[] }>('GET', '/tokens').then((r) => setTokens(r.tokens), () => undefined);
    }, []);
    useEffect(() => {
        load();
        api<{ persons: Person[] }>('GET', '/persons').then((r) => setPersons(r.persons), () => undefined);
    }, [load]);
    const create = (kind: 'shared' | 'mcp') => {
        const body = { kind, label: label || t(`settings.token.kind.${kind}`),
            personId: kind === 'mcp' && personId ? Number(personId) : null };
        api<{ plain: string }>('POST', '/tokens', body).then((r) => {
            setCreated({ kind, plain: r.plain });
            setLabel('');
            load();
        });
    };
    const personName = (id: number | null) => persons.find((p) => p.id === id)?.name ?? '';

    return (
        <div>
            <div className="table-scroll">
            <table className="tokens">
                <thead>
                    <tr>
                        <th>{t('settings.token.label')}</th><th>{t('settings.token.kind')}</th>
                        <th>{t('settings.token.person')}</th><th>{t('settings.token.lastUsed')}</th><th />
                    </tr>
                </thead>
                <tbody>
                    {tokens.map((tk) => (
                        <tr key={tk.id} className={tk.revokedAt ? 'revoked' : ''}>
                            <td>{tk.label}</td>
                            <td>{t(`settings.token.kind.${tk.kind}`)}</td>
                            <td>{personName(tk.personId)}</td>
                            <td>{tk.lastUsedAt ? time(tk.lastUsedAt) : t('settings.token.never')}</td>
                            <td>
                                {tk.revokedAt
                                    ? t('settings.token.revoked')
                                    : <button type="button" className="link" onClick={() => {
                                        api('DELETE', `/tokens/${tk.id}`).finally(load);
                                    }}>{t('settings.token.revoke')}</button>}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
            </div>
            <div className="token-form">
                <label className="field"><span>{t('settings.token.label')}</span>
                    <input value={label} onChange={(e) => setLabel(e.target.value)} />
                </label>
                <label className="field"><span>{t('settings.token.person')} (MCP)</span>
                    <select value={personId} onChange={(e) => setPersonId(e.target.value)}>
                        <option value="">–</option>
                        {persons.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                </label>
                <div className="actions">
                    <button type="button" onClick={() => create('shared')}>{t('settings.token.createShared')}</button>
                    <button type="button" onClick={() => create('mcp')}>{t('settings.token.createMcp')}</button>
                </div>
            </div>
            {created && (
                <div className="created-token">
                    {created.kind === 'shared'
                        ? <>
                            <p>{t('settings.token.sharedUrl')}</p>
                            <code>{`${location.origin}/?token=${created.plain}`}</code>
                        </>
                        : <>
                            <p>{t('settings.token.mcpToken')}</p>
                            <code>{created.plain}</code>
                            <code>{`claude mcp add --transport http chores ${location.origin}/mcp --header "Authorization: Bearer ${created.plain}"`}</code>
                        </>}
                </div>
            )}
        </div>
    );
}

/** The settings screen with its tabs. */
export function SettingsScreen() {
    const [tab, setTab] = useState<Tab>('capacity');
    const [settings, save, message] = useSettings();
    const tabs: Tab[] = ['capacity', 'parameters', 'persons', 'categories', 'conditions', 'tokens'];
    return (
        <section className="settings">
            <div className="tabs" role="tablist">
                {tabs.map((k) => (
                    <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'active' : ''}
                        onClick={() => setTab(k)}>{t(`settings.${k}`)}</button>
                ))}
            </div>
            {message && <p className="message">{message}</p>}
            {tab === 'capacity' && settings && <CapacityTab settings={settings} onSave={save} />}
            {tab === 'parameters' && settings && <ParametersTab settings={settings} onSave={save} />}
            {tab === 'persons' && <PersonsTab />}
            {tab === 'categories' && <CategoriesTab />}
            {tab === 'conditions' && <ConditionsTab />}
            {tab === 'tokens' && <TokensTab />}
        </section>
    );
}
