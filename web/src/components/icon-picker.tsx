import { useEffect, useState } from 'react';
import { t } from '../i18n.ts';
import { Icon } from './icon.tsx';

/** Highest number of icons in the result list. */
const MAX_RESULTS = 60;

/** All icon names with their search words, loaded once. */
let index: Promise<[string, string][]> | null = null;

/** Loads the list of all icons. */
function loadIndex(): Promise<[string, string][]> {
    index ??= fetch('/mdi/index.json').then((r) => r.json() as Promise<[string, string][]>).catch(() => {
        index = null;
        return [];
    });
    return index;
}

/**
 * A button with the selected icon that opens a search for all Material Design icons.
 *
 * @param props.value the selected icon name, null for no icon
 * @param props.onChange receives the new icon name, or null for no icon
 */
export function IconPicker({ value, onChange }: { value: string | null; onChange: (name: string | null) => void }) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [icons, setIcons] = useState<[string, string][]>([]);

    useEffect(() => {
        if (open) loadIndex().then(setIcons);
    }, [open]);

    const q = query.trim().toLowerCase();
    const results = q ? icons.filter(([name, words]) => name.includes(q) || words.includes(q)).slice(0, MAX_RESULTS) : [];
    const select = (name: string | null) => {
        onChange(name);
        setOpen(false);
        setQuery('');
    };

    return (
        <div className="icon-picker">
            <button type="button" className="icon-button" aria-label={t('icon.select')} title={value ?? t('icon.none')}
                aria-expanded={open} onClick={() => setOpen(!open)}>
                {value ? <Icon name={value} /> : <span className="icon-empty">?</span>}
            </button>
            {open && (
                <div className="icon-panel">
                    <div className="icon-search">
                        <input type="search" autoFocus placeholder={t('icon.search')} aria-label={t('icon.search')}
                            value={query} onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={(e) => {
                                // the picker can be part of a form that Enter must not submit
                                if (e.key === 'Enter') e.preventDefault();
                            }} />
                        <button type="button" className="link" onClick={() => select(null)}>{t('icon.none')}</button>
                    </div>
                    <div className="icon-results">
                        {results.map(([name]) => (
                            <button key={name} type="button" className={name === value ? 'on' : ''} title={name}
                                aria-label={name} onClick={() => select(name)}>
                                <Icon name={name} />
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
