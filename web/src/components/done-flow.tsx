import { useEffect, useState } from 'react';
import { api } from '../api.ts';
import { t } from '../i18n.ts';

/**
 * The confirmation after a done tap with the button "necessary earlier". It closes itself after the window.
 *
 * @param props.eventId the done event of the main chore
 * @param props.earlier true when the done event allows the tap "necessary earlier"
 * @param props.seconds the time in which the button is shown
 * @param props.onClose called when the confirmation is over
 */
export function DoneConfirmation({ eventId, earlier, seconds, onClose }:
    { eventId: number; earlier: boolean; seconds: number; onClose: () => void }) {
    const [thanks, setThanks] = useState(false);

    useEffect(() => {
        const timer = setTimeout(onClose, (thanks || !earlier ? 2 : seconds) * 1000);
        return () => clearTimeout(timer);
    }, [thanks, earlier, seconds, onClose]);

    return (
        <div className="confirm">
            <p>{thanks ? t('suggestions.earlierThanks') : t('suggestions.doneConfirm')}</p>
            {earlier && !thanks && (
                <button type="button" onClick={() => {
                    api('POST', `/events/${eventId}/earlier`).finally(() => setThanks(true));
                }}>{t('suggestions.earlier')}</button>
            )}
        </div>
    );
}

/**
 * The three postpone reasons.
 *
 * @param props.choreId the chore
 * @param props.onDone called after the postpone
 * @param props.onCancel called when no reason was chosen
 */
export function PostponeReasons({ choreId, onDone, onCancel }: { choreId: number; onDone: () => void; onCancel: () => void }) {
    const send = (reason: 'no_time' | 'no_energy' | 'not_yet') => {
        api('POST', `/chores/${choreId}/postpone`, { reason }).finally(onDone);
    };
    return (
        <div className="reasons">
            <button type="button" onClick={() => send('no_time')}>{t('suggestions.noTime')}</button>
            <button type="button" onClick={() => send('no_energy')}>{t('suggestions.noEnergy')}</button>
            <button type="button" onClick={() => send('not_yet')}>{t('suggestions.notYet')}</button>
            <button type="button" className="link" onClick={onCancel}>{t('common.cancel')}</button>
        </div>
    );
}
