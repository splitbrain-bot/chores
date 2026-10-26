import type { Category } from '../types.ts';

/**
 * Toggle buttons for any number of categories, also none.
 *
 * @param props.categories all categories
 * @param props.value the selected ids
 * @param props.onChange receives the new selection
 */
export function CategoryPicker({ categories, value, onChange }:
    { categories: Category[]; value: number[]; onChange: (ids: number[]) => void }) {
    return (
        <div className="chips">
            {categories.map((c) => {
                const on = value.includes(c.id);
                return (
                    <button key={c.id} type="button" className={on ? 'chip on' : 'chip'} aria-pressed={on}
                        onClick={() => onChange(on ? value.filter((id) => id !== c.id) : [...value, c.id])}>
                        {c.name}
                    </button>
                );
            })}
        </div>
    );
}
