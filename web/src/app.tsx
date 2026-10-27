import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api, clearToken, getToken, setToken } from './api.ts';
import { AppContext } from './context.ts';
import { t } from './i18n.ts';
import { match, navigate, usePath } from './router.ts';
import { ChoreForm } from './screens/chore-form.tsx';
import { Chores } from './screens/chores.tsx';
import { Login } from './screens/login.tsx';
import { Lookahead } from './screens/lookahead.tsx';
import { SettingsScreen } from './screens/settings.tsx';
import { Suggestions } from './screens/suggestions.tsx';
import type { Category, ConditionStatus, Me, Person } from './types.ts';

/** Moves a token from the URL to the storage and removes it from the URL. */
function takeTokenFromUrl(): void {
    const url = new URL(location.href);
    const token = url.searchParams.get('token');
    if (!token) return;
    setToken(token);
    url.searchParams.delete('token');
    history.replaceState(null, '', url.pathname + url.search + url.hash);
}

takeTokenFromUrl();

/** The app with the login gate, the navigation and the screens. */
export function App() {
    const path = usePath();
    const [me, setMe] = useState<Me | null>(null);
    const [categories, setCategories] = useState<Category[]>([]);
    const [persons, setPersons] = useState<Person[]>([]);
    const [conditions, setConditions] = useState<ConditionStatus[]>([]);
    const [error, setError] = useState<string | null>(null);

    const loadMe = useCallback(() => {
        if (!getToken()) {
            setMe(null);
            navigate('/login');
            return;
        }
        api<Me>('GET', '/auth/me').then(setMe, (err: Error) => setError(err.message));
    }, []);

    const reloadCategories = useCallback(() => {
        api<{ categories: Category[] }>('GET', '/categories').then((r) => setCategories(r.categories), () => undefined);
    }, []);

    const reloadPersons = useCallback(() => {
        api<{ persons: Person[] }>('GET', '/persons').then((r) => setPersons(r.persons), () => undefined);
    }, []);

    const reloadConditions = useCallback(() => {
        api<{ conditions: ConditionStatus[] }>('GET', '/conditions').then((r) => setConditions(r.conditions), () => undefined);
    }, []);

    useEffect(loadMe, [loadMe]);
    useEffect(() => {
        if (!me) return;
        reloadCategories();
        reloadPersons();
        reloadConditions();
    }, [me, reloadCategories, reloadPersons, reloadConditions]);

    const tablet = me?.kind === 'shared';
    useEffect(() => {
        document.documentElement.classList.toggle('tablet', tablet);
        document.title = t('app.name');
    }, [tablet]);

    if (path === '/login') {
        return <Login onLogin={(token) => {
            setToken(token);
            navigate('/');
            loadMe();
        }} />;
    }
    if (!me) return <p className="status">{error ? t('common.error', { message: error }) : t('common.loading')}</p>;

    let screen: ReactNode;
    let params: Record<string, string> | null;
    if (path === '/') screen = <Suggestions />;
    else if (path === '/chores') screen = <Chores />;
    else if (!tablet && path === '/chores/new') screen = <ChoreForm id={null} />;
    else if (!tablet && (params = match('/chores/:id', path))) screen = <ChoreForm key={params.id} id={Number(params.id)} />;
    else if (!tablet && path === '/lookahead') screen = <Lookahead />;
    else if (!tablet && path === '/settings') screen = <SettingsScreen />;
    else screen = <Suggestions />;

    const links: [string, string][] = tablet
        ? [['/', t('nav.suggestions')], ['/chores', t('nav.chores')]]
        : [['/', t('nav.suggestions')], ['/chores', t('nav.chores')], ['/lookahead', t('nav.lookahead')],
            ['/settings', t('nav.settings')]];

    return (
        <AppContext.Provider value={{ me, tablet, categories, reloadCategories, persons, reloadPersons, conditions,
            reloadConditions }}>
            <nav className="nav">
                {links.map(([href, label]) => (
                    <a key={href} href={href} className={href === path ? 'active' : ''} onClick={(e) => {
                        e.preventDefault();
                        navigate(href);
                    }}>{label}</a>
                ))}
                {!tablet && (
                    <button type="button" className="link" onClick={() => {
                        clearToken();
                        setMe(null);
                        navigate('/login');
                    }}>{t('nav.logout')}</button>
                )}
            </nav>
            <main>{screen}</main>
        </AppContext.Provider>
    );
}
