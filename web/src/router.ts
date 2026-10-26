import { useSyncExternalStore } from 'react';

/**
 * Subscribes to the changes of the location.
 *
 * @param callback called after a change
 */
function subscribe(callback: () => void): () => void {
    window.addEventListener('popstate', callback);
    return () => window.removeEventListener('popstate', callback);
}

/**
 * Goes to a path of the app.
 *
 * @param path the path, for example /chores/12
 */
export function navigate(path: string): void {
    if (path === location.pathname) return;
    history.pushState(null, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
}

/** Returns the current path and renders again when it changes. */
export function usePath(): string {
    return useSyncExternalStore(subscribe, () => location.pathname);
}

/**
 * Matches a path against a pattern with parameters, for example /chores/:id.
 *
 * @param pattern the pattern
 * @param path the path
 * @returns the parameters, or null when the path does not match
 */
export function match(pattern: string, path: string): Record<string, string> | null {
    const p = pattern.split('/');
    const s = path.split('/');
    if (p.length !== s.length) return null;
    const params: Record<string, string> = {};
    for (let i = 0; i < p.length; i++) {
        if (p[i]!.startsWith(':')) params[p[i]!.slice(1)] = decodeURIComponent(s[i]!);
        else if (p[i] !== s[i]) return null;
    }
    return params;
}
