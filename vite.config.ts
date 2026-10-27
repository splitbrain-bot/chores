import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
    root: 'web',
    plugins: [
        react(),
        VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['icons/*.png', 'icons/*.svg'],
            manifest: {
                name: 'Chores',
                short_name: 'Chores',
                description: 'Suggestions for the household chores',
                display: 'standalone',
                start_url: '/',
                scope: '/',
                theme_color: '#2e7d5b',
                background_color: '#f6f5f1',
                icons: [
                    { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
                    { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
                    { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
                ],
            },
            workbox: {
                globPatterns: ['**/*.{js,css,html,png,svg,ico}'],
                navigateFallback: '/index.html',
                navigateFallbackDenylist: [/^\/api\//, /^\/mcp/],
                runtimeCaching: [],
            },
        }),
    ],
    build: {
        outDir: 'dist',
        emptyOutDir: true,
    },
    server: {
        proxy: {
            '/api': 'http://localhost:3000',
            '/mcp': 'http://localhost:3000',
            '/mdi': 'http://localhost:3000',
        },
    },
});
