// Spike: can one Routes API call replace geocoding every address one by one?
// Throwaway code. Runs on the user's PC with the keys in ../../.env.local. Writes result.md next to this file.
//
// A: today's way. Geocoding API once per address, judged by the app's rule (house number, city, no partial match).
// B: the candidate. One computeRoutes call with every address as text, so Google geocodes them inside the route.
// Compared per address: does B flag the same addresses as A, and how far apart are the two points.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseTranscript } from '../../src/domain/parser.js';
import { CASES } from '../../tests/test-cases.js';

const here = path.dirname(fileURLToPath(import.meta.url));

export function readEnv(file) {
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(fs.readFileSync(file, 'utf8').split(/\r?\n/).filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]));
}

/** Real dictations from tests/test-cases.js, plus two that must be flagged. Max 26: 1 origin + 25 stops. */
export function addresses() {
  const real = CASES.filter((c) => c.name.includes('אמיתית')).flatMap((c) => parseTranscript(c.text, { defaultCity: c.defaultCity }).map((a) => a.geocodeQuery));
  const unique = [...new Set(real)];
  const bad = ['הרצל, רחובות', 'ויצמן 3, באר שבע'];   // no house number; a city where that address may not exist
  return [...unique.slice(0, 24), ...bad];
}

const R = 6371e3, rad = (d) => (d * Math.PI) / 180;
export const meters = (a, b) => {
  const x = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(x)));
};
const sameCity = (a, b) => { const n = (s) => s.replace(/[-־]/g, ' ').replace(/קרית/g, 'קריית').replace(/["'״׳]/g, '').replace(/\s+/g, ' ').trim(); const x = n(a), y = n(b); return x.includes(y) || y.includes(x); };

export async function geocodeOne(query, key, fetchFn = fetch) {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&language=he&region=il&components=country:IL&key=${encodeURIComponent(key)}`;
  const data = await (await fetchFn(url)).json();
  if (data.status !== 'OK') return { ok: false, why: data.status + (data.error_message ? ` (${data.error_message})` : '') };
  const top = data.results[0];
  const comp = (t) => top.address_components.find((c) => c.types.includes(t))?.long_name;
  const city = query.split(',').at(-1).trim();
  const why = !comp('street_number') ? 'אין מספר בית' : comp('locality') && !sameCity(city, comp('locality')) ? `עיר אחרת: ${comp('locality')}` : top.partial_match ? 'התאמה חלקית' : '';
  return { ok: !why, why, address: top.formatted_address, location: top.geometry.location };
}

const FIELDS = 'routes.optimizedIntermediateWaypointIndex,routes.legs.startLocation,routes.legs.endLocation,routes.duration,routes.distanceMeters,geocodingResults';
const EXACT = ['street_address', 'premise', 'subpremise'];

export async function routeByAddress(list, key, fetchFn = fetch) {
  const [origin, ...stops] = list;
  const res = await fetchFn('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': FIELDS },
    body: JSON.stringify({
      origin: { address: origin }, destination: { address: origin }, intermediates: stops.map((a) => ({ address: a })),
      travelMode: 'DRIVE', routingPreference: 'TRAFFIC_AWARE', optimizeWaypointOrder: true, languageCode: 'he', regionCode: 'IL',
    }),
  });
  const data = await res.json();
  if (!res.ok) return { error: `${res.status} ${data.error?.status ?? ''} ${data.error?.message ?? ''}`.trim(), raw: data };
  const route = data.routes?.[0];
  const order = route?.optimizedIntermediateWaypointIndex ?? stops.map((_, i) => i);
  const per = stops.map((a, i) => {
    const g = (data.geocodingResults?.intermediates ?? []).find((x) => (x.intermediateWaypointRequestIndex ?? 0) === i) ?? {};
    const leg = route?.legs?.[order.indexOf(i)];
    const ll = leg?.endLocation?.latLng;
    const types = g.type ?? [];
    const why = g.geocoderStatus?.code ? `לא נמצא (${g.geocoderStatus.message ?? g.geocoderStatus.code})` : g.partialMatch ? 'התאמה חלקית' : !types.some((t) => EXACT.includes(t)) ? `סוג: ${types.join('/') || 'לא ידוע'}` : '';
    return { address: a, ok: !why, why, types, location: ll && { lat: ll.latitude, lng: ll.longitude } };
  });
  return { per, durationSec: parseInt(route?.duration ?? '0', 10), distanceM: route?.distanceMeters, originGeo: data.geocodingResults?.origin };
}

export function report(list, A, B, callsA) {
  const stops = list.slice(1);
  const lines = ['# תוצאות ספייק: כתובות ישר לסידור', '', `הורץ ב-${new Date().toLocaleString('he-IL')}. ${stops.length} עצירות + נקודת יציאה.`, ''];
  if (B.error) return [...lines, `**בקשת הסידור נכשלה:** ${B.error}`, '', 'כשכתובת אחת לא נמצאת, ייתכן שכל הבקשה נכשלת. זה כשלעצמו ממצא.', ''].join('\n');
  let agree = 0; const dist = [];
  const rows = stops.map((addr, i) => {
    const a = A[i + 1], b = B.per[i];
    const same = a.ok === b.ok; if (same) agree++;
    const d = a.location && b.location ? meters(a.location, b.location) : null; if (d != null && a.ok) dist.push(d);
    return `| ${addr} | ${a.ok ? 'תקין' : 'לתיקון: ' + a.why} | ${b.ok ? 'תקין' : 'לתיקון: ' + b.why} | ${d ?? '-'} | ${same ? '' : '**שונה**'} |`;
  });
  dist.sort((x, y) => x - y);
  const median = dist.length ? dist[Math.floor(dist.length / 2)] : null;
  const pct = Math.round((agree / stops.length) * 100);
  const far = dist.filter((d) => d > 100).length;
  return [...lines,
    '## סיכום', '',
    '| מדד | תוצאה | סף ל-GO |', '|---|---|---|',
    `| הסכמה על "תקין / לתיקון" | ${agree}/${stops.length} (${pct}%) | 90% ומעלה |`,
    `| מרחק חציוני בין הנקודות (כתובות תקינות) | ${median ?? '-'} מ' | עד 50 מ' |`,
    `| כתובות שהנקודה שלהן רחוקה יותר מ-100 מ' | ${far} | 0 |`,
    `| קריאות שהניסוי שלח | Geocoding: ${callsA}, Compute Routes: 1 | |`, '',
    '## בדיקת חיוב (מחר)', '',
    `ב-Google Cloud: Billing > Reports, מסננים לתאריך של היום ומקבצים לפי SKU. אם Geocoding מראה **יותר מ-${callsA}** בקשות מהיום, Google מחייב גם על הכתובות שבתוך בקשת הסידור, והחיסכון לא קיים. אם מופיע בדיוק ${callsA}, זה חינם בתוך הסידור. (אם השתמשת באפליקציה היום, תוסיף את מה ששלחת בה.)`, '',
    '## לכל כתובת', '',
    '| כתובת | A: אימות נפרד (היום) | B: בתוך הסידור | מרחק (מ\') | |', '|---|---|---|---|---|',
    ...rows, ''].join('\n');
}

async function main() {
  const env = { ...readEnv(path.join(here, '../../.env.local')), ...process.env };
  const routesKey = env.GOOGLE_ROUTES_KEY || env.VITE_GOOGLE_MAPS_KEY;
  const geoKey = env.SPIKE_GEOCODE_KEY || env.VITE_GOOGLE_MAPS_KEY || env.GOOGLE_ROUTES_KEY;
  if (!routesKey) { console.log('No key. Run set-google-key.bat first.'); process.exit(1); }
  const list = addresses();
  console.log(`A: geocoding ${list.length} addresses one by one...`);
  const A = [];
  for (const q of list) A.push(await geocodeOne(q, geoKey));
  if (A.every((a) => !a.ok && /REQUEST_DENIED/.test(a.why))) {
    console.log('Geocoding was denied for this key:', A[0].why);
    console.log('The browser key is probably locked to websites. Put a key that allows Geocoding API in .env.local as SPIKE_GEOCODE_KEY=... and run again.');
    process.exit(1);
  }
  console.log('B: one route request with all addresses as text...');
  const B = await routeByAddress(list, routesKey);
  const out = path.join(here, 'result.md');
  fs.writeFileSync(out, report(list, A, B, list.length));
  fs.writeFileSync(path.join(here, 'result.json'), JSON.stringify({ list, A, B }, null, 2));
  console.log('Done. Results: ' + out);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
