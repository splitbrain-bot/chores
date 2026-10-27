import { t } from '../i18n.ts';

/**
 * Five circles to select the effort of a chore. A click on a circle sets the effort to its number.
 *
 * @param props.value the effort from 1 to 5
 * @param props.label the name of the group
 * @param props.onChange receives the new effort
 */
export function EffortPicker({ value, label, onChange }: { value: number; label: string; onChange: (effort: number) => void }) {
    return (
        <div className="dots effort-picker" role="radiogroup" aria-label={label}>
            {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" role="radio" aria-checked={n === value} className={n <= value ? 'dot on' : 'dot'}
                    aria-label={t('suggestions.effort', { n })} title={t('suggestions.effort', { n })}
                    onClick={() => onChange(n)} />
            ))}
        </div>
    );
}
