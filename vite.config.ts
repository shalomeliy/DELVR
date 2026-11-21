/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import type { IncomingMessage } from 'node:http';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Runs api/optimize.ts and api/transcribe-stops.ts inside `npm run dev`, so the whole app works locally without Vercel.
function devApi(routesKey: string | undefined, env: Record<string, string>): Plugin {
  return {
    name: 'passit-dev-api',
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
      // The voice endpoint gets the raw recording and the caller's Supabase token, as on Vercel.
      server.middlewares.use('/api/transcribe-stops', async (req: IncomingMessage, res) => {
        const chunks: Buffer[] = [];
        for await (const c of req) chunks.push(c as Buffer);
        const { handleTranscribe } = await server.ssrLoadModule('/api/_lib/transcribe.ts');
        const { default: Anthropic } = await import('@anthropic-ai/sdk');
        const headers: Record<string, string> = {};
        for (const h of ['content-type', 'authorization']) if (req.headers[h]) headers[h] = String(req.headers[h]);
        const request = new Request(`http://localhost${(req as IncomingMessage & { originalUrl?: string }).originalUrl ?? req.url ?? ''}`, { method: req.method, headers, body: req.method === 'POST' ? Buffer.concat(chunks) : undefined });
        const response: Response = await handleTranscribe(request, {
          openaiKey: env.OPENAI_API_KEY,
          anthropic: env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }) : null,
          supabaseUrl: env.VITE_SUPABASE_URL,
          supabaseAnonKey: env.VITE_SUPABASE_ANON_KEY,
        });
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
      devApi(env.GOOGLE_ROUTES_KEY || env.VITE_GOOGLE_MAPS_KEY, env),
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: false,
        includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
        manifest: {
          name: 'PassIT - מסלול לשליח',
          short_name: 'PassIT',
          description: 'מקריאים כתובות בעברית ומקבלים את הסדר הכי מהיר',
          lang: 'he', dir: 'rtl',
          start_url: '/', display: 'standalone',
          background_color: '#0A0E17', theme_color: '#0A0E17',
          icons: [
            { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: 'maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: { navigateFallbackDenylist: [/^\/api\//, /^\/spikes\//], skipWaiting: true, clientsClaim: true, cleanupOutdatedCaches: true },
      }),
    ],
    // The voice spike is its own page, so it can be tried on phones without touching the app.
    build: { rolldownOptions: { input: { main: 'index.html', voice: 'spikes/voice-transcribe/index.html' } } },
    test: { include: ['tests/**/*.test.ts'] },
  };
});
