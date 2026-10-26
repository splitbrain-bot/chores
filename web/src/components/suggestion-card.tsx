import { useCallback, useState } from 'react';
import { api } from '../api.ts';
import { useApp } from '../context.ts';
import { reasonText } from '../format.ts';
import { t } from '../i18n.ts';
import type { Suggestion } from '../types.ts';
import { DoneConfirmation, PostponeReasons } from './done-flow.tsx';

/**
 * Shows the effort as five dots.
 *
 * @param props.effort the effort from 1 to 5
 */
export function EffortDots({ effort }: { effort: number }) {
    return (
        <span className="dots" title={t('suggestions.effort', { n: effort })} aria-label={t('suggestions.effort', { n: effort })}>
            {[1, 2, 3, 4, 5].map((n) => <span key={n} className={n <= effort ? 'dot on' : 'dot'} />)}
        </span>
    );
}

/**
 * One suggestion with the buttons Done and Later.
 *
 * @param props.suggestion the suggestion
 * @param props.earlierWindowSeconds the time for the button "necessary earlier"
 * @param props.onStart called when the user taps Done or Later
 * @param props.onFinished called when the card is done or postponed, or the user cancels the postpone
 */
export function SuggestionCard({ suggestion, earlierWindowSeconds, onStart, onFinished }:
    { suggestion: Suggestion; earlierWindowSeconds: number; onStart: () => void; onFinished: () => void }) {
    const { categories } = useApp();
    const { chore, also } = suggestion;
    const [checked, setChecked] = useState<number[]>([]);
    const [mode, setMode] = useState<'idle' | 'later' | 'sending'>('idle');
    const [eventId, setEventId] = useState<number | null>(null);
    const close = useCallback(() => onFinished(), [onFinished]);

    const names = categories.filter((c) => chore.categoryIds.includes(c.id)).map((c) => c.name);

    if (eventId !== null) {
        return (
            <article className="card">
                <h2>{chore.name}</h2>
                <DoneConfirmation eventId={eventId} seconds={earlierWindowSeconds} onClose={close} />
            </article>
        );
    }

    return (
        <article className="card">
            <h2>{chore.name}</h2>
            <p className="meta">
                {names.length > 0 && <span className="categories">{names.join(', ')}</span>}
                <span>{t('common.minutes', { n: chore.durationMin })}</span>
                <EffortDots effort={chore.effort} />
            </p>
            <p className="reason">{reasonText(chore)}</p>
            {also.length > 0 && (
                <fieldset className="also">
                    <legend>{t('suggestions.also')}</legend>
                    {also.map((a) => (
                        <label key={a.id}>
                            <input type="checkbox" checked={checked.includes(a.id)} onChange={(e) => setChecked(e.target.checked
                                ? [...checked, a.id] : checked.filter((id) => id !== a.id))} />
                            {a.name}
                            {a.categoryIds.length > 0 && (
                                <span className="categories"> · {categories.filter((c) => a.categoryIds.includes(c.id))
                                    .map((c) => c.name).join(', ')}</span>
                            )}
                        </label>
                    ))}
                </fieldset>
            )}
            {mode === 'later'
                ? <PostponeReasons choreId={chore.id} onDone={close} onCancel={() => {
                    setMode('idle');
                    onFinished();
                }} />
                : (
                    <div className="actions">
                        <button type="button" className="primary" disabled={mode === 'sending'} onClick={() => {
                            onStart();
                            setMode('sending');
                            api<{ events: { choreId: number; eventId: number }[] }>('POST', `/chores/${chore.id}/done`,
                                { also: checked })
                                .then((r) => setEventId(r.events.find((e) => e.choreId === chore.id)!.eventId), close);
                        }}>{t('suggestions.done')}</button>
                        <button type="button" onClick={() => {
                            onStart();
                            setMode('later');
                        }}>{t('suggestions.later')}</button>
                    </div>
                )}
        </article>
    );
}
