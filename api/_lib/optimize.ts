// Route ordering on top of Google Routes API computeRoutes.
// Pure logic with an injected fetch, so it runs in the Vercel function, the Vite dev server and tests alike.

export interface LatLngIn { lat: number; lng: number }
export interface StopIn extends LatLngIn { id: string; order?: 'first' | 'auto' | 'last' }
export interface OptimizeInput { origin: LatLngIn; destination?: LatLngIn | null; stops: StopIn[] }
export interface OptimizeOutput {
  order: string[];
  legs: { durationSec: number; distanceM: number }[];
  totalDurationSec: number;
  totalDistanceM: number;
  polyline?: string;
}

export const MAX_STOPS = 25;
const ROUTES_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const FIELDS = 'routes.optimizedIntermediateWaypointIndex,routes.legs.duration,routes.legs.distanceMeters,routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline';

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

const inIsrael = (p: LatLngIn) => p.lat > 29.4 && p.lat < 33.4 && p.lng > 34.2 && p.lng < 35.95;
const isPoint = (p: unknown): p is LatLngIn =>
  !!p && typeof (p as LatLngIn).lat === 'number' && typeof (p as LatLngIn).lng === 'number' && Number.isFinite((p as LatLngIn).lat) && Number.isFinite((p as LatLngIn).lng);

export function validate(body: unknown): OptimizeInput {
  const b = body as OptimizeInput;
  if (!b || !isPoint(b.origin)) throw new HttpError(400, 'חסרה נקודת יציאה');
  if (b.destination != null && !isPoint(b.destination)) throw new HttpError(400, 'נקודת הסיום לא תקינה');
  if (!Array.isArray(b.stops) || b.stops.length === 0) throw new HttpError(400, 'אין עצירות לסדר');
  if (b.stops.length > MAX_STOPS) throw new HttpError(400, `אפשר לסדר עד ${MAX_STOPS} עצירות בבת אחת`);
  const ids = new Set<string>();
  for (const s of b.stops) {
    if (!isPoint(s) || typeof s.id !== 'string' || !s.id || ids.has(s.id)) throw new HttpError(400, 'עצירה לא תקינה');
    ids.add(s.id);
  }
  for (const p of [b.origin, b.destination, ...b.stops]) if (p && !inIsrael(p)) throw new HttpError(400, 'כל הכתובות צריכות להיות בישראל');
  return { origin: b.origin, destination: b.destination ?? null, stops: b.stops.map((s) => ({ id: s.id, lat: s.lat, lng: s.lng, order: s.order ?? 'auto' })) };
}

const wp = (p: LatLngIn) => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } });
const sec = (d?: string) => (d ? parseInt(d, 10) || 0 : 0);

interface GRoute {
  optimizedIntermediateWaypointIndex?: number[];
  legs?: { duration?: string; distanceMeters?: number }[];
  duration?: string; distanceMeters?: number;
  polyline?: { encodedPolyline?: string };
}

async function computeRoute(fetchFn: typeof fetch, key: string, origin: LatLngIn, destination: LatLngIn, mids: LatLngIn[], optimize: boolean): Promise<GRoute> {
  const res = await fetchFn(ROUTES_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': FIELDS },
    body: JSON.stringify({
      origin: wp(origin), destination: wp(destination), intermediates: mids.map(wp),
      travelMode: 'DRIVE', routingPreference: 'TRAFFIC_AWARE',
      optimizeWaypointOrder: optimize && mids.length > 1,
      languageCode: 'he', regionCode: 'IL', units: 'METRIC',
    }),
  });
  if (res.status === 429) throw new HttpError(429, 'נגמרה מכסת הסידורים של Google להיום');
  if (!res.ok) {
    const detail = (await res.json().catch(() => null)) as { error?: { status?: string } } | null;
    const why = detail?.error?.status === 'PERMISSION_DENIED' ? '. בדוק ש-Routes API מופעל בפרויקט' : '';
    throw new HttpError(502, `Google לא הצליח לחשב מסלול (${res.status}${detail?.error?.status ? ' ' + detail.error.status : ''})${why}`);
  }
  const data = (await res.json()) as { routes?: GRoute[] };
  if (!data.routes?.[0]) throw new HttpError(502, 'Google לא מצא מסלול נסיעה בין הכתובות');
  return data.routes[0];
}

/**
 * Google cannot pin a waypoint, so only the 'auto' stops are optimized, between the last 'first'
 * stop and the first 'last' stop. With pins, a second (non-optimized) call gives the full legs.
 */
export async function optimizeRoute(input: OptimizeInput, key: string, fetchFn: typeof fetch = fetch): Promise<OptimizeOutput> {
  const end = input.destination ?? input.origin;
  const firsts = input.stops.filter((s) => s.order === 'first');
  const lasts = input.stops.filter((s) => s.order === 'last');
  const autos = input.stops.filter((s) => s.order !== 'first' && s.order !== 'last');

  const from = firsts.at(-1) ?? input.origin;
  const to = lasts[0] ?? end;
  const opt = await computeRoute(fetchFn, key, from, to, autos, true);
  const idx = opt.optimizedIntermediateWaypointIndex?.length === autos.length ? opt.optimizedIntermediateWaypointIndex : autos.map((_, i) => i);
  const ordered = [...firsts, ...idx.map((i) => autos[i]), ...lasts];

  const full = firsts.length || lasts.length ? await computeRoute(fetchFn, key, input.origin, end, ordered, false) : opt;
  const legs = (full.legs ?? []).map((l) => ({ durationSec: sec(l.duration), distanceM: l.distanceMeters ?? 0 }));
  return {
    order: ordered.map((s) => s.id),
    legs,
    totalDurationSec: sec(full.duration) || legs.reduce((a, l) => a + l.durationSec, 0),
    totalDistanceM: full.distanceMeters ?? legs.reduce((a, l) => a + l.distanceM, 0),
    polyline: full.polyline?.encodedPolyline,
  };
}

// Best-effort abuse guard. Counters live in one function instance's memory, so they reset on cold
// starts and are not shared between instances; Google's own quota is the hard limit.
const DAILY_CAP = 150, PER_MINUTE = 10;
const state = { day: '', count: 0, ips: new Map<string, number[]>() };

export function checkLimits(ip: string, now = Date.now()) {
  const day = new Date(now).toISOString().slice(0, 10);
  if (state.day !== day) { state.day = day; state.count = 0; }
  if (state.count >= DAILY_CAP) throw new HttpError(429, 'הגענו לתקרת הסידורים היומית. נסה שוב מחר');
  const recent = (state.ips.get(ip) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= PER_MINUTE) throw new HttpError(429, 'יותר מדי סידורים בדקה. חכה רגע ונסה שוב');
  recent.push(now); state.ips.set(ip, recent); state.count++;
}

export async function handleOptimize(request: Request, key: string | undefined, fetchFn: typeof fetch = fetch): Promise<Response> {
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
  try {
    if (!key) throw new HttpError(500, 'השרת לא מוגדר: חסר GOOGLE_ROUTES_KEY');
    const input = validate(await request.json().catch(() => null));
    checkLimits(request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'local');
    return json(200, await optimizeRoute(input, key, fetchFn));
  } catch (e) {
    if (e instanceof HttpError) return json(e.status, { error: e.message });
    return json(502, { error: 'Google לא הצליח לחשב מסלול' });
  }
}
