import { useState } from 'react';
import { api } from '../api.ts';
import { t } from '../i18n.ts';

/** Returns a short name of the browser and the system, for example Firefox on Android. */
function deviceLabel(): string {
    const ua = navigator.userAgent;
    const browser = /Firefox\//.test(ua) ? 'Firefox' : /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome'
        : /Safari\//.test(ua) ? 'Safari' : 'Browser';
    const system = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows'
        : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
    return system ? `${browser} on ${system}` : browser;
}

/**
 * The login screen.
 *
 * @param props.onLogin receives the new token
 */
export function Login({ onLogin }: { onLogin: (token: string) => void }) {
    const [name, setName] = useState('');
    const [password, setPassword] = useState('');
    const [failed, setFailed] = useState(false);

    return (
        <main className="login">
            <h1>{t('app.name')}</h1>
            <form onSubmit={(e) => {
                e.preventDefault();
                api<{ token: string }>('POST', '/auth/login', { name, password, label: deviceLabel() })
                    .then((r) => onLogin(r.token), () => setFailed(true));
            }}>
                <label>{t('login.name')}
                    <input name="name" autoComplete="username" value={name} onChange={(e) => setName(e.target.value)} required />
                </label>
                <label>{t('login.password')}
                    <input name="password" type="password" autoComplete="current-password" value={password}
                        onChange={(e) => setPassword(e.target.value)} required />
                </label>
                {failed && <p className="error">{t('login.failed')}</p>}
                <button type="submit" className="primary">{t('login.submit')}</button>
            </form>
        </main>
    );
}
