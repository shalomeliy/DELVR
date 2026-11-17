import { dueEpoch, endModeOf, routeOrigin } from '../domain/plan';
import type { LatLng, Optimized, Plan } from '../domain/types';
import { logError, logInfo } from './log';
import { getVehicle } from './vehicle';

/**
 * from: a re-sort that starts at a point the courier picked (their location or a typed address). Without an
 * end address that route returns to this point, not to the morning's start.
 */
export async function optimizePlan(plan: Plan, signal?: AbortSignal, from?: LatLng): Promise<Optimized> {
  const stops = plan.stops.filter((s) => s.delivery === 'todo' && s.location);
  const origin = from ?? routeOrigin(plan);
  const home = from ?? plan.start.location;
  if (!home || !origin) throw new Error('חסרה נקודת יציאה מאומתת');
  const started = Date.now();
  const timed = stops.filter((s) => s.dueAt).length;
  const vehicle = getVehicle();
  logInfo('optimize_request', { vehicle, stops: stops.length, pinned: stops.filter((s) => s.order !== 'auto').length, timed, endMode: endModeOf(plan), from: from ? 'picked' : 'default' });
  const res = await fetch('/api/optimize', {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      origin,
      // Sent even for a round trip: after deliveries the origin is the last stop, not the start.
      destination: endModeOf(plan) === 'address' ? plan.end?.location ?? null : endModeOf(plan) === 'return' ? home : null,
      open: endModeOf(plan) === 'open',
      vehicle,
      departAt: started,
      stops: stops.map((s) => ({ id: s.id, ...s.location!, order: s.order, ...(s.dueAt && dueEpoch(s.dueAt, started) ? { dueAt: dueEpoch(s.dueAt, started) } : {}) })),
    }),
  });
  const raw = await res.text();
  let data: Record<string, unknown> & { error?: string };
  try { data = JSON.parse(raw); } catch { data = { error: `תשובה לא תקינה מהשרת (${res.status})` }; logError('optimize_bad_response', { status: res.status, body: raw.slice(0, 300) }); }
  if (res.ok && !Array.isArray(data.order)) {
    logError('optimize_bad_response', { status: res.status, body: raw.slice(0, 300) });
    throw new Error('השרת לא החזיר מסלול. ייתכן שפונקציית הסידור לא עלתה ל-Vercel');
  }
  if (!res.ok) {
    logError('optimize_failed', { status: res.status, error: data.error, ms: Date.now() - started });
    throw new Error(data.error ?? `שגיאת שרת ${res.status}`);
  }
  logInfo('optimize_ok', { picked: data.picked, ms: Date.now() - started, totalDurationSec: data.totalDurationSec, totalDistanceM: data.totalDistanceM, order: data.order, deadlines: data.deadlines });
  return { ...(data as unknown as Omit<Optimized, 'at'>), at: Date.now(), ...(from ? { from } : {}) };
}
