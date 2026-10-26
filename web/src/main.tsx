import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './app.tsx';
import { lang } from './i18n.ts';
import './styles/app.css';

document.documentElement.lang = lang;
registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <App />
    </StrictMode>,
);
