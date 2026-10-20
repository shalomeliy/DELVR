import type { LatLng } from '../domain/types';
import { logInfo, logWarn, logError } from './log';
import { loadMaps } from './maps';

export type GeocodeResult =
  | { ok: true; address: string; location: LatLng }
  | { ok: false; reason: string; address?: string; location?: LatLng };

const norm = (s: string) => s.replace(/[-־]/g, ' ').replace(/קרית/g, 'קריית').replace(/["'״׳]/g, '').replace(/\s+/g, ' ').trim();

/** Same city if one name contains the other ("תל אביב" vs "תל אביב-יפו"). */
export function sameCity(a: string, b: string) {
  const x = norm(a), y = norm(b);
  return !!x && !!y && (x.includes(y) || y.includes(x));
}

type Component = { long_name: string; types: string[] };
export interface RawResult {
  formatted_address: string;
  partial_match?: boolean;
  address_components: Component[];
  location: LatLng;
}

/**
 * The user's rule: anything Google does not recognize as a full address goes back to the courier.
 * Full = has a house number, is not a partial match, and lands in the city that was said.
 */
export function judge(r: RawResult | undefined, city: string | null): GeocodeResult {
  if (!r) return { ok: false, reason: 'Google לא מצא את הכתובת' };
  const comp = (t: string) => r.address_components.find((c) => c.types.includes(t))?.long_name;
  const base = { address: r.formatted_address, location: r.location };
  if (!comp('street_number')) return { ok: false, reason: 'Google לא מצא את מספר הבית', ...base };
  const locality = comp('locality');
  if (city && locality && !sameCity(city, locality)) return { ok: false, reason: `Google מצא את זה ב${locality} ולא ב${city}`, ...base };
  if (r.partial_match) return { ok: false, reason: 'Google לא בטוח שזו הכתובת', ...base };
  return { ok: true, ...base };
}

export async function geocode(query: string, city: string | null): Promise<GeocodeResult> {
  const maps = await loadMaps();
  try {
    const { results } = await new maps.Geocoder().geocode({ address: query, componentRestrictions: { country: 'IL' }, language: 'he', region: 'IL' });
    const top = results[0];
    const verdict = judge(top && {
      formatted_address: top.formatted_address.replace(/, ישראל$/, ''),
      partial_match: top.partial_match,
      address_components: top.address_components,
      location: top.geometry.location.toJSON(),
    }, city);
    (verdict.ok ? logInfo : logWarn)('geocode', { query, city, ok: verdict.ok, reason: verdict.ok ? undefined : verdict.reason, google: top?.formatted_address, partial: top?.partial_match, results: results.length });
    return verdict;
  } catch (e) {
    const code = (e as { code?: string }).code;
    logError('geocode_failed', { query, city, code, message: (e as Error).message });
    if (code === 'ZERO_RESULTS') return { ok: false, reason: 'Google לא מצא את הכתובת' };
    if (code === 'REQUEST_DENIED') throw new Error('Google דחה את הבקשה. בדוק ש-Geocoding API מופעל בפרויקט');
    throw new Error(`שגיאה מ-Google: ${code ?? (e as Error).message}`);
  }
}

export async function reverseGeocode(at: LatLng): Promise<string | undefined> {
  const maps = await loadMaps();
  const { results } = await new maps.Geocoder().geocode({ location: at, language: 'he' });
  return results[0]?.formatted_address.replace(/, ישראל$/, '');
}
