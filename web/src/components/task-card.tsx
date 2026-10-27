import {
    mdiCalendarAlert, mdiCheck, mdiClockOutline, mdiCog, mdiLightningBolt, mdiLinkVariant, mdiNumeric1BoxOutline,
    mdiSprout, mdiTrafficLight, mdiVolumeHigh, mdiWeatherPartlyCloudy,
} from '@mdi/js';
import type { CSSProperties, ReactNode } from 'react';
import { useApp } from '../context.ts';
import { blockedText, reasonText, seasonText } from '../format.ts';
import { dayMonth, num, t } from '../i18n.ts';
import { navigate } from '../router.ts';
import type { Category, ChoreWithNeed } from '../types.ts';
import { Icon } from './icon.tsx';

/** Icon of a condition without its own icon, per use in the chore. */
const CONDITION_ICONS = { conditionId: mdiTrafficLight, boostId: mdiLightningBolt, forecastId: mdiWeatherPartlyCloudy };

/** Height in pixels of one color in the stripe of a chore with more than one person. */
const DASH = 10;

/**
 * Shows the effort as five dots.
 *
 * @param props.effort the effort from 1 to 5
 */
function EffortDots({ effort }: { effort: number }) {
    return (
        <span className="dots" title={t('suggestions.effort', { n: effort })} aria-label={t('suggestions.effort', { n: effort })}>
            {[1, 2, 3, 4, 5].map((n) => <span key={n} className={n <= effort ? 'dot on' : 'dot'} />)}
        </span>
    );
}

/**
 * A small icon with a text. The compact layout shows only the icon.
 *
 * @param props.icon the icon
 * @param props.text the text, also the tooltip
 * @param props.urgent true to show the flag as urgent
 */
function Flag({ icon, text, urgent = false }: { icon: ReactNode; text: string; urgent?: boolean }) {
    return <span className={urgent ? 'flag urgent' : 'flag'} title={text}>{icon}<span className="text">{text}</span></span>;
}

/**
 * The icons of the categories of a chore. A category without an icon shows its name.
 *
 * @param props.categories the categories of the chore
 */
function Rooms({ categories }: { categories: Category[] }) {
    if (categories.length === 0) return null;
    return (
        <span className="rooms">
            {categories.map((c) => (
                <span key={c.id} className="room" title={c.name}>
                    {c.icon && <Icon name={c.icon} />}
                    <span className={c.icon ? 'room-name' : 'room-name always'}>{c.name}</span>
                </span>
            ))}
        </span>
    );
}

/**
 * Returns the text of the deadline of a chore, or null for no deadline.
 *
 * @param chore the chore
 */
function deadlineText(chore: ChoreWithNeed): string | null {
    if (chore.reason.code === 'deadline') return reasonText(chore);
    if (chore.deadlineAt !== null) return t('reason.deadline', { date: dayMonth(chore.deadlineAt) });
    if (chore.deadlineMd !== null) {
        const [month, day] = chore.deadlineMd.split('-').map(Number);
        return t('reason.deadline', { date: dayMonth(new Date(new Date().getFullYear(), month! - 1, day).getTime()) });
    }
    return null;
}

/**
 * One chore with all its information and the buttons Done and Later. The Now screen and the chore list use the
 * same markup, a parent with the class compact changes the layout.
 *
 * @param props.chore the chore
 * @param props.related the chores of the same group
 * @param props.onDone called when the user taps Done
 * @param props.onLater called when the user taps Later
 */
export function TaskCard({ chore, related, onDone, onLater }:
    { chore: ChoreWithNeed; related: ChoreWithNeed[]; onDone: () => void; onLater: () => void }) {
    const { tablet, categories, persons, conditions } = useApp();
    const rooms = (cs: ChoreWithNeed) => categories.filter((c) => cs.categoryIds.includes(c.id));

    const assigned = persons.filter((p) => chore.personIds.includes(p.id));
    const stripe = assigned.length === 1
        ? assigned[0]!.color
        : assigned.length > 1
            ? `repeating-linear-gradient(to bottom, ${assigned.map((p, i) => `${p.color} ${i * DASH}px ${(i + 1) * DASH}px`).join(', ')})`
            : undefined;

    const deadline = deadlineText(chore);
    const flags = [
        deadline && <Flag key="deadline" icon={<Icon path={mdiCalendarAlert} />} text={deadline}
            urgent={chore.reason.code === 'deadline'} />,
        chore.seasonMonths.length > 0 && <Flag key="season" icon={<Icon path={mdiSprout} />}
            text={t('suggestions.season', { months: seasonText(chore.seasonMonths) })} />,
        ...(['conditionId', 'boostId', 'forecastId'] as const).map((key) => {
            const condition = conditions.find((c) => c.id === chore[key]);
            if (!condition) return null;
            const icon = condition.icon ? <Icon name={condition.icon} /> : <Icon path={CONDITION_ICONS[key]} />;
            return <Flag key={key} icon={icon} text={condition.name} />;
        }),
        chore.noisy && <Flag key="noisy" icon={<Icon path={mdiVolumeHigh} />} text={t('suggestions.noisy')} />,
    ].filter(Boolean);

    const status = [...blockedText(chore), ...(chore.templateError ? [t('chores.templateError')] : [])];
    const relatedText = (r: ChoreWithNeed) => (r.categoryIds.length > 0
        ? `${r.name} (${rooms(r).map((c) => c.name).join(', ')})` : r.name);
    const [firstLine, ...moreLines] = (chore.notes ?? '').split('\n');

    return (
        <article className={chore.possible ? 'task' : 'task blocked'}>
            <span className="stripe" style={{ '--stripe': stripe } as CSSProperties}
                title={t('suggestions.assigned', { names: assigned.map((p) => p.name).join(', ') || t('suggestions.anybody') })} />
            <div className="head">
                <Rooms categories={rooms(chore)} />
                <h2>
                    {tablet
                        ? chore.name
                        : <a href={`/chores/${chore.id}`} onClick={(e) => {
                            e.preventDefault();
                            navigate(`/chores/${chore.id}`);
                        }}>{chore.name}</a>}
                </h2>
                {chore.kind === 'one_time' && (
                    <span className="one-time"><Icon path={mdiNumeric1BoxOutline} label={t('suggestions.oneTime')} /></span>
                )}
            </div>
            {!tablet && (
                <button type="button" className="edit" aria-label={t('suggestions.edit')} title={t('suggestions.edit')}
                    onClick={() => navigate(`/chores/${chore.id}`)}><Icon path={mdiCog} /></button>
            )}
            <div className="meta">
                <span>{t('common.minutes', { n: chore.durationMin })}</span>
                <EffortDots effort={chore.effort} />
            </div>
            {flags.length > 0 && <div className="flags">{flags}</div>}
            <div className="need" title={num(chore.need)}>
                <span className={chore.need >= 1 ? 'bar due' : 'bar'} style={{ width: `${Math.min(chore.need, 2) * 50}%` }} />
            </div>
            <div className="sub">
                {status.length > 0 && <span className="blocked-by">{status.map((s) => <span key={s}>{s}</span>)}</span>}
                {related.length > 0 && (
                    <div className="related" title={related.map(relatedText).join(', ')}>
                        <Icon path={mdiLinkVariant} />
                        <span className="label">{t('suggestions.also')}: </span>
                        <ul>
                            {related.map((r) => (
                                // the compact layout shows only the categories when the title is the same
                                <li key={r.id} className={r.name === chore.name && r.categoryIds.length > 0 ? 'same-name' : undefined}>
                                    <span className="name">{r.name}</span>
                                    {r.categoryIds.length > 0 && (
                                        <span className="categories">{rooms(r).map((c) => c.name).join(', ')}</span>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
                {chore.notes && (moreLines.length > 0
                    ? <details className="notes"><summary>{firstLine}</summary><p>{moreLines.join('\n')}</p></details>
                    : <p className="notes">{firstLine}</p>)}
            </div>
            <div className="actions">
                <button type="button" className="primary" aria-label={t('suggestions.done')} title={t('suggestions.done')}
                    onClick={onDone}>
                    <Icon path={mdiCheck} /><span className="label">{t('suggestions.done')}</span>
                </button>
                <button type="button" aria-label={t('suggestions.later')} title={t('suggestions.later')} onClick={onLater}>
                    <Icon path={mdiClockOutline} /><span className="label">{t('suggestions.later')}</span>
                </button>
            </div>
        </article>
    );
}
