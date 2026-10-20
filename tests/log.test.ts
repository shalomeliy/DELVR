import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, string>();
vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) });
vi.stubGlobal('navigator', { userAgent: 'test', language: 'he-IL', onLine: true, permissions: { query: async () => ({ state: 'granted' }) } });
vi.stubGlobal('screen', { width: 390, height: 844 });
vi.stubGlobal('devicePixelRatio', 3);
vi.stubGlobal('location', { origin: 'https://delvr-delta.vercel.app' });
vi.stubGlobal('matchMedia', () => ({ matches: false }));
vi.stubGlobal('window', {});

const { buildReport, clearLog, logError, logInfo } = await import('../src/services/log');

describe('diagnostic log', () => {
  beforeEach(() => clearLog());

  it('never contains the Google key', async () => {
    logError('maps_script_failed', { src: 'https://maps.googleapis.com/maps/api/js?key=AIzaSyDxPQdexpqqBGhjH8lxKiBvQrwhZMiadao&language=he' });
    logInfo('note', 'AIzaSyDxPQdexpqqBGhjH8lxKiBvQrwhZMiadao');
    const report = await buildReport({});
    expect(report).not.toMatch(/AIzaSy/);
    expect(report).toContain('[key]');
  });

  it('keeps errors with their message and the device info', async () => {
    logError('optimize_failed', new Error('Google לא הצליח'));
    const report = JSON.parse(await buildReport({ plan: { stops: [] } }));
    expect(report.device.userAgent).toBe('test');
    expect(report.log.at(-1)).toMatchObject({ level: 'error', event: 'optimize_failed', data: { message: 'Google לא הצליח' } });
  });

  it('keeps only the last 300 entries', async () => {
    for (let i = 0; i < 350; i++) logInfo('e', i);
    const report = JSON.parse(await buildReport({}));
    expect(report.log).toHaveLength(300);
    expect(report.log[0].data).toBe(50);
  });
});
