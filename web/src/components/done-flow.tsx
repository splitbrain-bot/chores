import { useEffect, useRef, useState, type ReactNode } from 'react';
import { api } from '../api.ts';
import { useApp } from '../context.ts';
import { t } from '../i18n.ts';
import type { ChoreWithNeed } from '../types.ts';

/** A chore for which the user opened the dialog Done or Later. */
export interface TaskAction {
    kind: 'done' | 'later';
    chore: ChoreWithNeed;
    /** Chores of the same group that the user can mark as done together with the chore. */
    related: ChoreWithNeed[];
}

/** Response of the done endpoint. */
interface DoneResponse {
    events: { choreId: number; eventId: number; earlier: boolean }[];
}

/**
 * A modal dialog that is open while it is shown.
 *
 * @param props.title the heading
 * @param props.onClose called when the user closes the dialog with the Escape key or a click outside
 * @param props.children the content
 */
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
    const ref = useRef<HTMLDialogElement>(null);
    useEffect(() => {
        const dialog = ref.current;
        if (!dialog) return;
        dialog.showModal();
        return () => dialog.close();
    }, []);
    return (
        <dialog ref={ref} className="task-dialog" aria-label={title} onCancel={(e) => {
            e.preventDefault();
            onClose();
        }} onClick={(e) => {
            if (e.target === ref.current) onClose();
        }}>
            <h2>{title}</h2>
            {children}
        </dialog>
    );
}

/**
 * The question after a done tap if the chore was necessary earlier.
 *
 * @param props.eventId the done event of the main chore
 * @param props.onClose called when the question is answered or closed
 */
function DoneConfirmation({ eventId, onClose }: { eventId: number; onClose: () => void }) {
    return (
        <div className="confirm">
            <p>{t('suggestions.doneConfirm')}</p>
            <div className="actions">
                <button type="button" onClick={() => {
                    api('POST', `/events/${eventId}/earlier`).finally(onClose);
                }}>{t('suggestions.earlier')}</button>
                <button type="button" className="primary" onClick={onClose}>{t('common.close')}</button>
            </div>
        </div>
    );
}

/**
 * The dialog after a tap on Done. With related chores it first asks which of them were done too, then it sends
 * the done event. When the done event allows the tap "necessary earlier", the dialog asks for it. Otherwise it
 * closes at once.
 *
 * @param props.chore the chore
 * @param props.related the chores of the same group
 * @param props.onClose called when the dialog is over
 */
function DoneDialog({ chore, related, onClose }: { chore: ChoreWithNeed; related: ChoreWithNeed[]; onClose: () => void }) {
    const { categories } = useApp();
    const [checked, setChecked] = useState<number[]>([]);
    const [sending, setSending] = useState(false);
    const [done, setDone] = useState<{ eventId: number } | null>(null);

    const send = (also: number[]) => {
        setSending(true);
        api<DoneResponse>('POST', `/chores/${chore.id}/done`, { also }).then((r) => {
            const event = r.events.find((e) => e.choreId === chore.id)!;
            if (event.earlier) setDone({ eventId: event.eventId });
            else onClose();
        }, onClose);
    };
    // without related chores there is nothing to ask, the effect runs only once even in the strict mode
    const started = useRef(false);
    useEffect(() => {
        if (related.length > 0 || started.current) return;
        started.current = true;
        send([]);
    });

    return (
        <Modal title={chore.name} onClose={onClose}>
            {done
                ? <DoneConfirmation eventId={done.eventId} onClose={onClose} />
                : related.length > 0 && (
                    <form onSubmit={(e) => {
                        e.preventDefault();
                        send(checked);
                    }}>
                        <fieldset className="also">
                            <legend>{t('suggestions.alsoDone')}</legend>
                            {related.map((a) => (
                                <label key={a.id}>
                                    <input type="checkbox" checked={checked.includes(a.id)} onChange={(e) => setChecked(
                                        e.target.checked ? [...checked, a.id] : checked.filter((id) => id !== a.id))} />
                                    {a.name}
                                    {a.categoryIds.length > 0 && (
                                        <span className="categories"> · {categories.filter((c) => a.categoryIds.includes(c.id))
                                            .map((c) => c.name).join(', ')}</span>
                                    )}
                                </label>
                            ))}
                        </fieldset>
                        <div className="actions">
                            <button type="button" className="link" onClick={onClose}>{t('common.cancel')}</button>
                            <button type="submit" className="primary" disabled={sending}>{t('suggestions.done')}</button>
                        </div>
                    </form>
                )}
        </Modal>
    );
}

/**
 * The dialog after a tap on Later with the three postpone reasons.
 *
 * @param props.chore the chore
 * @param props.onClose called when the dialog is over
 */
function LaterDialog({ chore, onClose }: { chore: ChoreWithNeed; onClose: () => void }) {
    const send = (reason: 'no_time' | 'no_energy' | 'not_yet') => {
        api('POST', `/chores/${chore.id}/postpone`, { reason }).finally(onClose);
    };
    return (
        <Modal title={chore.name} onClose={onClose}>
            <p>{t('suggestions.whyLater')}</p>
            <div className="reasons">
                <button type="button" onClick={() => send('no_time')}>{t('suggestions.noTime')}</button>
                <button type="button" onClick={() => send('no_energy')}>{t('suggestions.noEnergy')}</button>
                <button type="button" onClick={() => send('not_yet')}>{t('suggestions.notYet')}</button>
                <button type="button" className="link" onClick={onClose}>{t('common.cancel')}</button>
            </div>
        </Modal>
    );
}

/**
 * The dialog Done or Later of a chore.
 *
 * @param props.action the chore and the kind of dialog
 * @param props.onClose called when the dialog is over
 */
export function TaskDialog({ action, onClose }: { action: TaskAction; onClose: () => void }) {
    return action.kind === 'done'
        ? <DoneDialog chore={action.chore} related={action.related} onClose={onClose} />
        : <LaterDialog chore={action.chore} onClose={onClose} />;
}
