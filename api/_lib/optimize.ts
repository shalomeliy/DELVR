// Route ordering on top of Google Routes API computeRoutes.
// Pure logic with an injected fetch, so it runs in the Vercel function, the Vite dev server and tests alike.

export interface LatLngIn { lat: number; lng: number }
/** dueAt: "בול בזמן", epoch ms the courier must be at this stop by. Such a stop is placed by time, not by order. */
export interface StopIn extends LatLngIn { id: string; order?: 'first' | 'auto' | 'last'; dueAt?: number }
/** open: the route ends at the last stop instead of returning to the origin or a destination. */
/**
 * scooter: Google has no motorcycle routing in Israel (TWO_WHEELER is not offered there), so a scooter is a
 * car that keeps off highways, and between two orders the shorter one in km wins. car: the faster one wins.
 */
export type Vehicle = 'scooter' | 'car';
/** departAt: when the courier leaves the origin (epoch ms); needed only for stops with a time. */
export interface OptimizeInput { origin: LatLngIn; destination?: LatLngIn | null; open?: boolean; vehicle?: Vehicle; departAt?: number; stops: StopIn[] }
/** How a timed stop works out: estimated arrival, minutes waiting when early, minutes late when the time cannot be met. */
export interface DeadlineOut { id: string; dueAt: number; etaAt: number; waitSec: number; lateSec: number }
export interface OptimizeOutput {
  order: string[];
  legs: { durationSec: number; distanceM: number }[];
  totalDurationSec: number;
  totalDistanceM: number;
  polyline?: string;
  /** Which order won: Google's own optimizer or the geometric sweep checked against Google. */
  picked?: 'google' | 'sweep';
  /** One entry per timed stop, in route order. */
  deadlines?: DeadlineOut[];
  /** Total time spent waiting at timed stops reached early. Not part of totalDurationSec (driving only). */
  waitSec?: number;
}

export const MAX_STOPS = 25;
export const MAX_TIMED = 5;
/** Minutes a courier spends at each stop, used only to estimate arrival at timed stops. */
export const SERVICE_SEC = 180;
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
    if (s.dueAt != null && !(typeof s.dueAt === 'number' && Number.isFinite(s.dueAt))) throw new HttpError(400, 'שעה לא תקינה בעצירה');
    ids.add(s.id);
  }
  if (b.stops.filter((s) => s.dueAt != null).length > MAX_TIMED) throw new HttpError(400, `אפשר לקבוע שעה לעד ${MAX_TIMED} עצירות במסלול`);
  for (const p of [b.origin, b.destination, ...b.stops]) if (p && !inIsrael(p)) throw new HttpError(400, 'כל הכתובות צריכות להיות בישראל');
  return { origin: b.origin, destination: b.destination ?? null, open: b.open === true && b.destination == null, vehicle: b.vehicle === 'car' ? 'car' : 'scooter',
    departAt: typeof b.departAt === 'number' && Number.isFinite(b.departAt) ? b.departAt : undefined,
    stops: b.stops.map((s) => ({ id: s.id, lat: s.lat, lng: s.lng, order: s.order ?? 'auto', ...(s.dueAt != null ? { dueAt: s.dueAt } : {}) })) };
}

const wp = (p: LatLngIn) => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } });
const sec = (d?: string) => (d ? parseInt(d, 10) || 0 : 0);

interface GRoute {
  optimizedIntermediateWaypointIndex?: number[];
  legs?: { duration?: string; distanceMeters?: number }[];
  duration?: string; distanceMeters?: number;
  polyline?: { encodedPolyline?: string };
}

async function computeRoute(fetchFn: typeof fetch, key: string, vehicle: Vehicle, origin: LatLngIn, destination: LatLngIn, mids: LatLngIn[], optimize: boolean): Promise<GRoute> {
  const res = await fetchFn(ROUTES_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': FIELDS },
    body: JSON.stringify({
      origin: wp(origin), destination: wp(destination), intermediates: mids.map(wp),
      travelMode: 'DRIVE', routingPreference: 'TRAFFIC_AWARE',
      ...(vehicle === 'scooter' ? { routeModifiers: { avoidHighways: true } } : {}),
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

const R = 6371e3, rad = (d: number) => (d * Math.PI) / 180;
function distanceM(a: LatLngIn, b: LatLngIn) {
  const x = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

/**
 * A second opinion on the order: nearest neighbour then 2-opt on straight-line distance, with both ends
 * fixed. Google's optimizer is a heuristic tuned for cars and sometimes leaves a far stop for the end and
 * reaches the destination by a highway detour; a sweep that ends near the destination avoids that.
 * Returns indexes into mids.
 */
export function sweepOrder(from: LatLngIn, to: LatLngIn, mids: LatLngIn[]): number[] {
  const n = mids.length;
  if (n < 2) return mids.map((_, i) => i);
  const left = new Set(mids.map((_, i) => i));
  const path: number[] = [];
  let at = from;
  while (left.size) {
    let best = -1;
    for (const i of left) if (best < 0 || distanceM(at, mids[i]) < distanceM(at, mids[best])) best = i;
    path.push(best); left.delete(best); at = mids[best];
  }
  const pt = (k: number) => (k < 0 ? from : k >= n ? to : mids[path[k]]);
  for (let improved = true, rounds = 0; improved && rounds < 50; rounds++) {
    improved = false;
    for (let i = 0; i < n - 1; i++) {
      for (let j = i + 1; j < n; j++) {
        const before = distanceM(pt(i - 1), pt(i)) + distanceM(pt(j), pt(j + 1));
        const after = distanceM(pt(i - 1), pt(j)) + distanceM(pt(i), pt(j + 1));
        if (after < before - 1) { path.splice(i, j - i + 1, ...path.slice(i, j + 1).reverse()); improved = true; }
      }
    }
  }
  return path;
}

const cost = (r: GRoute, vehicle: Vehicle) => (vehicle === 'scooter' ? r.distanceMeters ?? Infinity : sec(r.duration) || Infinity);

/** Google's order for the stops between two fixed points, checked against the sweep; the cheaper one wins. */
async function bestOrder(fetchFn: typeof fetch, key: string, vehicle: Vehicle, from: LatLngIn, to: LatLngIn, mids: StopIn[]): Promise<{ idx: number[]; route: GRoute; picked: 'google' | 'sweep' }> {
  let route = await computeRoute(fetchFn, key, vehicle, from, to, mids, true);
  let idx = route.optimizedIntermediateWaypointIndex?.length === mids.length ? route.optimizedIntermediateWaypointIndex : mids.map((_, i) => i);
  // Check Google's order against the sweep with one more (non-optimizing) call, and keep the cheaper one.
  let picked: 'google' | 'sweep' = 'google';
  const sweep = sweepOrder(from, to, mids);
  if (mids.length > 2 && sweep.join() !== idx.join()) {
    const alt = await computeRoute(fetchFn, key, vehicle, from, to, sweep.map((i) => mids[i]), false);
    if (cost(alt, vehicle) < cost(route, vehicle)) { route = alt; idx = sweep; picked = 'sweep'; }
  }
  return { idx, route, picked };
}

const toLegs = (r: GRoute) => (r.legs ?? []).map((l) => ({ durationSec: sec(l.duration), distanceM: l.distanceMeters ?? 0 }));

/**
 * Google cannot pin a waypoint, so only the 'auto' stops are optimized, between the last 'first'
 * stop and the first 'last' stop. With pins, a second (non-optimized) call gives the full legs.
 *
 * Open routes (end at the last stop): Google always needs a destination, so the stop farthest from
 * the start becomes the end and the rest are optimized on the way there. Nearby stops come first.
 *
 * Stops with a time ("בול בזמן") go through optimizeTimed instead.
 */
export async function optimizeRoute(input: OptimizeInput, key: string, fetchFn: typeof fetch = fetch): Promise<OptimizeOutput> {
  if (input.stops.some((s) => s.dueAt != null)) return optimizeTimed(input, key, fetchFn);
  const firsts = input.stops.filter((s) => s.order === 'first');
  let lasts = input.stops.filter((s) => s.order === 'last');
  let autos = input.stops.filter((s) => s.order !== 'first' && s.order !== 'last');

  const from = firsts.at(-1) ?? input.origin;
  if (input.open && !lasts.length && autos.length) {
    const far = autos.reduce((a, b) => (distanceM(from, b) > distanceM(from, a) ? b : a));
    autos = autos.filter((s) => s !== far);
    lasts = [far];
  }
  const end = input.destination ?? input.origin;
  const to = lasts[0] ?? end;

  const vehicle = input.vehicle ?? 'scooter';
  const { idx, route: opt, picked } = await bestOrder(fetchFn, key, vehicle, from, to, autos);
  const ordered = [...firsts, ...idx.map((i) => autos[i]), ...lasts];

  // The optimizing call already covers the whole drive unless pinned stops sit outside it.
  const needFull = firsts.length > 0 || (input.open ? lasts.length > 1 : lasts.length > 0);
  const full = !needFull ? opt
    : input.open ? await computeRoute(fetchFn, key, vehicle, input.origin, ordered.at(-1)!, ordered.slice(0, -1), false)
    : await computeRoute(fetchFn, key, vehicle, input.origin, end, ordered, false);
  const legs = toLegs(full);
  return {
    order: ordered.map((s) => s.id),
    legs,
    totalDurationSec: sec(full.duration) || legs.reduce((a, l) => a + l.durationSec, 0),
    totalDistanceM: full.distanceMeters ?? legs.reduce((a, l) => a + l.distanceM, 0),
    polyline: full.polyline?.encodedPolyline,
    picked,
  };
}

/** Arrival at each stop along the legs: drive, wait at a timed stop reached early, then SERVICE_SEC at every stop. */
export function timeline(ordered: StopIn[], legs: { durationSec: number }[], departAt: number): { deadlines: DeadlineOut[]; waitSec: number; finishAt: number } {
  let t = departAt, waitSec = 0;
  const deadlines: DeadlineOut[] = [];
  ordered.forEach((s, i) => {
    t += (legs[i]?.durationSec ?? 0) * 1000;
    if (s.dueAt != null) {
      const wait = Math.max(0, s.dueAt - t);
      deadlines.push({ id: s.id, dueAt: s.dueAt, etaAt: t, waitSec: Math.round(wait / 1000), lateSec: Math.round(Math.max(0, t - s.dueAt) / 1000) });
      waitSec += wait / 1000; t += wait;
    }
    t += SERVICE_SEC * 1000;
  });
  return { deadlines, waitSec: Math.round(waitSec), finishAt: t + (legs[ordered.length]?.durationSec ?? 0) * 1000 };
}

const LATE_OK_SEC = 60, WAIT_FILL_SEC = 15 * 60, WAIT_SLACK_SEC = 5 * 60, ROUNDS = 3;

/**
 * "בול בזמן": some stops have a time the courier must be there by. Google's Routes API has no time
 * windows, so the timed stops, sorted by time, split the route into segments: before the first, between
 * each two, and after the last. Every other stop goes to the segment it is most on the way of, each
 * segment is ordered like a normal route, and one full call gives the real driving times.
 *
 * Then up to three repair rounds: a timed stop reached late sheds the stops that cost the most before
 * it to a later segment; one reached more than 15 minutes early pulls in nearby stops from later on to
 * use the wait. A round is kept only if it is less late, or as late and finishes sooner. When no order
 * meets the time, the result still says by how much it is missed.
 */
async function optimizeTimed(input: OptimizeInput, key: string, fetchFn: typeof fetch): Promise<OptimizeOutput> {
  const vehicle = input.vehicle ?? 'scooter';
  const departAt = input.departAt ?? Date.now();
  const timed = input.stops.filter((s) => s.dueAt != null).sort((a, b) => a.dueAt! - b.dueAt!);
  const rest = input.stops.filter((s) => s.dueAt == null);
  const firsts = rest.filter((s) => s.order === 'first');
  const lasts = rest.filter((s) => s.order === 'last');
  const free = rest.filter((s) => s.order !== 'first' && s.order !== 'last');
  const from: LatLngIn = firsts.at(-1) ?? input.origin;
  const end: LatLngIn | null = input.open ? null : input.destination ?? input.origin;
  const k = timed.length;
  const segFrom = (j: number): LatLngIn => (j === 0 ? from : timed[j - 1]);
  // null: an open route's last segment, which ends at its farthest stop.
  const segTo = (j: number): LatLngIn | null => (j < k ? timed[j] : lasts[0] ?? end);
  const detour = (s: LatLngIn, j: number) => {
    const a = segFrom(j), b = segTo(j);
    return b ? distanceM(a, s) + distanceM(s, b) - distanceM(a, b) : distanceM(a, s);
  };
  const cheapest = (s: LatLngIn, js: number[]) => js.reduce((best, j) => (detour(s, j) <= detour(s, best) ? j : best));
  const range = (a: number, b: number) => Array.from({ length: Math.max(0, b - a) }, (_, i) => a + i);

  let picked: 'google' | 'sweep' = 'google';
  const orderSeg = async (j: number, mids: StopIn[]): Promise<StopIn[]> => {
    const a = segFrom(j);
    let b = segTo(j), tail: StopIn[] = [];
    if (!b) {
      if (!mids.length) return [];
      const far = mids.reduce((x, y) => (distanceM(a, y) > distanceM(a, x) ? y : x));
      mids = mids.filter((s) => s !== far); b = far; tail = [far];
    }
    if (mids.length < 2) return [...mids, ...tail];
    const r = await bestOrder(fetchFn, key, vehicle, a, b, mids);
    if (r.picked === 'sweep') picked = 'sweep';
    return [...r.idx.map((i) => mids[i]), ...tail];
  };

  const evaluate = async (segs: StopIn[][]) => {
    const parts = await Promise.all(segs.map((mids, j) => orderSeg(j, mids)));
    const ordered = [...firsts, ...parts.flatMap((part, j) => (j < k ? [...part, timed[j]] : part)), ...lasts];
    const full = end ? await computeRoute(fetchFn, key, vehicle, input.origin, end, ordered, false)
      : await computeRoute(fetchFn, key, vehicle, input.origin, ordered.at(-1)!, ordered.slice(0, -1), false);
    const legs = toLegs(full);
    const t = timeline(ordered, legs, departAt);
    return { segs, ordered, full, legs, ...t, lateSec: t.deadlines.reduce((a, d) => a + d.lateSec, 0) };
  };
  type Result = Awaited<ReturnType<typeof evaluate>>;
  const better = (a: Result, b: Result) => a.lateSec < b.lateSec - LATE_OK_SEC || (Math.abs(a.lateSec - b.lateSec) <= LATE_OK_SEC && a.finishAt < b.finishAt);

  // Moves stops between segments, estimating seconds from straight-line metres with this route's own pace.
  const adjust = (r: Result): StopIn[][] | null => {
    const pts: LatLngIn[] = [input.origin, ...r.ordered, ...(end ? [end] : [])];
    const straight = pts.slice(1).reduce((a, p, i) => a + distanceM(pts[i], p), 0);
    const pace = straight > 0 ? r.legs.reduce((a, l) => a + l.durationSec, 0) / straight : 0.1;
    const pos = new Map(r.ordered.map((s, i) => [s.id, i + 1]));
    const saving = (s: StopIn) => {
      const i = pos.get(s.id)!, prev = pts[i - 1], next = pts[i + 1];
      return (next ? distanceM(prev, s) + distanceM(s, next) - distanceM(prev, next) : distanceM(prev, s)) * pace + SERVICE_SEC;
    };
    const segs = r.segs.map((g) => [...g]);
    for (let j = 0; j < k; j++) {
      const d = r.deadlines.find((x) => x.id === timed[j].id)!;
      if (d.lateSec > LATE_OK_SEC) {
        const later = range(j + 1, k + 1);
        const cands = range(0, j + 1).flatMap((g) => segs[g].map((s) => ({ s, g, save: saving(s) }))).sort((x, y) => y.save - x.save);
        if (!cands.length) continue; // nothing before it to drop: this time cannot be met from here
        let saved = 0;
        for (const c of cands) {
          if (saved >= d.lateSec) break;
          segs[c.g] = segs[c.g].filter((x) => x !== c.s);
          segs[cheapest(c.s, later)].push(c.s);
          saved += c.save;
        }
        return segs;
      }
      if (d.waitSec > WAIT_FILL_SEC) {
        const cands = range(j + 1, k + 1).flatMap((g) => segs[g].map((s) => ({ s, g, add: detour(s, j) * pace + SERVICE_SEC }))).sort((x, y) => x.add - y.add);
        let used = 0, moved = false;
        for (const c of cands) {
          if (used + c.add > d.waitSec - WAIT_SLACK_SEC) break;
          segs[c.g] = segs[c.g].filter((x) => x !== c.s);
          segs[j].push(c.s);
          used += c.add; moved = true;
        }
        if (moved) return segs;
      }
    }
    return null;
  };

  const initial: StopIn[][] = Array.from({ length: k + 1 }, () => []);
  for (const s of free) initial[cheapest(s, range(0, k + 1))].push(s);
  let best = await evaluate(initial);
  for (let round = 0; round < ROUNDS; round++) {
    const next = adjust(best);
    if (!next) break;
    const r = await evaluate(next);
    if (!better(r, best)) break;
    best = r;
  }

  const { full, legs } = best;
  return {
    order: best.ordered.map((s) => s.id),
    legs,
    totalDurationSec: sec(full.duration) || legs.reduce((a, l) => a + l.durationSec, 0),
    totalDistanceM: full.distanceMeters ?? legs.reduce((a, l) => a + l.distanceM, 0),
    polyline: full.polyline?.encodedPolyline,
    picked,
    deadlines: best.deadlines,
    waitSec: best.waitSec,
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
