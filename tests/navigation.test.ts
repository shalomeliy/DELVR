import { afterEach, describe, expect, it, vi } from 'vitest';

const p = { lat: 31.9643211, lng: 34.8044321 };
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

describe('Waze links', () => {
  it('Android: intent link with exact point, navigate, and a web fallback', async () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/130' });
    const { wazeUrl } = await import('../src/services/navigation');
    const url = wazeUrl(p, 'אבן גבירול 7, ראשון לציון');
    expect(url).toMatch(/^intent:\/\/\?ll=31\.964321%2C34\.804432&navigate=yes#Intent;scheme=waze;package=com\.waze;/);
    const fallback = decodeURIComponent(url.split('S.browser_fallback_url=')[1].replace(/;end$/, ''));
    expect(fallback).toContain('https://waze.com/ul?ll=31.964321%2C34.804432&navigate=yes');
    expect(decodeURIComponent(fallback)).toContain('אבן גבירול 7');
  });
  it('desktop: plain web link', async () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/130' });
    const { wazeUrl } = await import('../src/services/navigation');
    expect(wazeUrl(p)).toBe('https://waze.com/ul?ll=31.964321%2C34.804432&navigate=yes&zoom=17');
  });
});
