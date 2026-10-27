import { useEffect, useState } from 'react';

/** Loaded path data per icon name. */
const cache = new Map<string, Promise<string | null>>();

/**
 * Loads the path data of a Material Design icon from the server. Each icon is loaded only once.
 *
 * @param name the icon name
 * @returns the path data, or null when the icon does not exist
 */
function loadPath(name: string): Promise<string | null> {
    let path = cache.get(name);
    if (!path) {
        path = fetch(`/mdi/${name}.svg`)
            .then((r) => (r.ok ? r.text() : ''))
            .then((svg) => / d="([^"]+)"/.exec(svg)?.[1] ?? null, () => null);
        cache.set(name, path);
    }
    return path;
}

/**
 * A Material Design icon in the text color. A fixed icon of the app gives its path data, an icon that the user
 * selected gives its name and is loaded when it shows the first time.
 *
 * @param props.path the path data of a bundled icon
 * @param props.name the name of an icon to load
 * @param props.label the text for screen readers and the tooltip, none for a decorative icon
 */
export function Icon({ path, name, label }: { path?: string; name?: string; label?: string }) {
    const [loaded, setLoaded] = useState<{ name: string; path: string | null } | null>(null);
    useEffect(() => {
        if (!name) return;
        let active = true;
        loadPath(name).then((p) => {
            if (active) setLoaded({ name, path: p });
        });
        return () => {
            active = false;
        };
    }, [name]);

    const d = name ? (loaded?.name === name ? loaded.path : null) : path;
    return (
        <svg className="icon" viewBox="0 0 24 24" role={label ? 'img' : undefined} aria-label={label}
            aria-hidden={label ? undefined : true}>
            {label && <title>{label}</title>}
            {d && <path d={d} />}
        </svg>
    );
}
