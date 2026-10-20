import type { Optimized, Plan } from '../domain/types';
import { logError, logInfo } from './log';

export async function optimizePlan(plan: Plan, signal?: AbortSignal): Promise<Optimized> {
  const stops = plan.stops.filter((s) => s.delivery === 'todo' && s.location);
  if (!plan.start.location) throw new Error('חסרה נקודת יציאה מאומתת');
  const started = Date.now();
  logInfo('optimize_request', { stops: stops.length, pinned: stops.filter((s) => s.order !== 'auto').length, roundTrip: !plan.end });
  const res = await fetch('/api/optimize', {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      origin: plan.start.location,
      destination: plan.end?.location ?? null,
      stops: stops.map((s) => ({ id: s.id, ...s.location!, order: s.order })),
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
  logInfo('optimize_ok', { ms: Date.now() - started, totalDurationSec: data.totalDurationSec, totalDistanceM: data.totalDistanceM, order: data.order });
  return { ...(data as unknown as Omit<Optimized, 'at'>), at: Date.now() };
}
