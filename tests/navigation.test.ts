import { afterEach, describe, expect, it, vi } from 'vitest';

const p = { lat: 31.9643211, lng: 34.8044321 };
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

describe('Waze links', () => {
  it('cleans Google\'s address into what a person types', async () => {
    const { wazeQuery } = await import('../src/services/navigation');
    expect(wazeQuery("רחוב זאב ז'בוטינסקי 3, רמת גן, 5252005")).toBe("זאב ז'בוטינסקי 3, רמת גן");
    expect(wazeQuery('אבן גבירול 7, ראשון לציון, ישראל')).toBe('אבן גבירול 7, ראשון לציון');
  });
  it('Android: intent link with the address, the exact point, navigate, and a web fallback', async () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/130' });
    const { wazeUrl } = await import('../src/services/navigation');
    const url = wazeUrl(p, 'אבן גבירול 7, ראשון לציון, 7524407');
    expect(url).toMatch(/^intent:\/\/\?q=[^&]+&ll=31\.964321%2C34\.804432&navigate=yes#Intent;scheme=waze;package=com\.waze;/);
    expect(decodeURIComponent(url.split('&ll=')[0].slice('intent://?q='.length))).toBe('אבן גבירול 7, ראשון לציון');
    expect(url).toContain('S.browser_fallback_url=' + encodeURIComponent('https://waze.com/ul?q='));
  });
  it('desktop: plain web link; without an address only the point', async () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/130' });
    const { wazeUrl } = await import('../src/services/navigation');
    expect(wazeUrl(p)).toBe('https://waze.com/ul?ll=31.964321%2C34.804432&navigate=yes&zoom=17');
  });
});
