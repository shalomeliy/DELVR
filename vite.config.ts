/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import type { IncomingMessage } from 'node:http';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Runs api/optimize.ts inside `npm run dev`, so the whole app works locally without Vercel.
function devApi(routesKey: string | undefined): Plugin {
  return {
    name: 'delvr-dev-api',
    configureServer(server) {
      server.middlewares.use('/api/optimize', async (req: IncomingMessage, res) => {
        const chunks: Buffer[] = [];
        for await (const c of req) chunks.push(c as Buffer);
        const { handleOptimize } = await server.ssrLoadModule('/api/_lib/optimize.ts');
        const request = new Request('http://localhost/api/optimize', { method: req.method, headers: { 'content-type': 'application/json' }, body: req.method === 'POST' ? Buffer.concat(chunks) : undefined });
        const response: Response = await handleOptimize(request, routesKey);
        res.statusCode = response.status;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(await response.text());
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    define: { 'import.meta.env.VITE_BUILD': JSON.stringify((process.env.VERCEL_GIT_COMMIT_SHA ?? 'dev').slice(0, 7)) },
    plugins: [
      react(),
      devApi(env.GOOGLE_ROUTES_KEY || env.VITE_GOOGLE_MAPS_KEY),
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: false,
        includeAssets: ['favicon.svg'],
        manifest: {
          name: 'Delvr - מסלול לשליח',
          short_name: 'Delvr',
          description: 'מקריאים כתובות בעברית ומקבלים את הסדר הכי מהיר',
          lang: 'he', dir: 'rtl',
          start_url: '/', display: 'standalone',
          background_color: '#ffffff', theme_color: '#1d4ed8',
          icons: [
            { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: { navigateFallbackDenylist: [/^\/api\//], skipWaiting: true, clientsClaim: true, cleanupOutdatedCaches: true },
      }),
    ],
    test: { include: ['tests/**/*.test.ts'] },
  };
});
