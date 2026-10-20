// Pure plan operations, kept out of React so they are easy to test.
import { parseTranscript } from './parser.js';
import type { Plan, Stop } from './types';
import { MAX_STOPS } from './types';

export const emptyPlan = (): Plan => ({ start: { input: '' }, end: null, stops: [] });

let seq = 0;
export const newId = () => `s${Date.now().toString(36)}${(seq++).toString(36)}`;

/** City of the start address, inherited by stops dictated without a city (user decision 2026-10-20). */
export function startCity(plan: Plan): string | null {
  // Google writes "התורן 3, יבנה": without dropping the comma the city lands in a separate chunk.
  const cityOf = (text?: string) => (text ? parseTranscript(text.replace(/,/g, ' ')).find((a) => a.city)?.city ?? null : null);
  return cityOf(plan.start.address) ?? cityOf(plan.start.input);
}

export function stopsFromText(text: string, defaultCity: string | null): Stop[] {
  return parseTranscript(text, { defaultCity }).map((a) => ({
    id: newId(),
    input: a.geocodeQuery,
    spoken: a.geocodeQuery,
    city: a.city,
    verify: a.flags.includes('unclear') ? 'needs_fix' : 'pending',
    fixReason: a.flags.includes('unclear') ? 'לא הובן, צריך לתקן' : undefined,
    order: 'auto',
    delivery: 'todo',
  }));
}

/** Adds stops up to the v1 cap. Returns how many did not fit. */
export function addStops(plan: Plan, stops: Stop[]): { plan: Plan; dropped: number } {
  const room = Math.max(0, MAX_STOPS - plan.stops.length);
  return { plan: { ...plan, stops: [...plan.stops, ...stops.slice(0, room)], optimized: undefined }, dropped: Math.max(0, stops.length - room) };
}

export function updateStop(plan: Plan, id: string, patch: Partial<Stop>, keepRoute = false): Plan {
  return { ...plan, stops: plan.stops.map((s) => (s.id === id ? { ...s, ...patch } : s)), optimized: keepRoute ? plan.optimized : undefined };
}

export function removeStop(plan: Plan, id: string): Plan {
  return { ...plan, stops: plan.stops.filter((s) => s.id !== id), optimized: undefined };
}

export function canOptimize(plan: Plan): { ok: boolean; why?: string } {
  if (!plan.start.location) return { ok: false, why: 'קודם לאמת את כתובת היציאה' };
  if (plan.end && !plan.end.location) return { ok: false, why: 'קודם לאמת את כתובת הסיום' };
  const todo = plan.stops.filter((s) => s.delivery === 'todo');
  if (!todo.length) return { ok: false, why: 'אין עצירות לסדר' };
  if (todo.some((s) => s.verify === 'pending')) return { ok: false, why: 'מאמת כתובות מול Google...' };
  const fix = todo.filter((s) => s.verify === 'needs_fix').length;
  if (fix) return { ok: false, why: `${fix} כתובות מחכות לתיקון` };
  return { ok: true };
}

/** Stops in driving order when the plan is optimized, otherwise in the order added. */
export function orderedStops(plan: Plan): Stop[] {
  if (!plan.optimized) return plan.stops;
  const byId = new Map(plan.stops.map((s) => [s.id, s]));
  const seen = new Set(plan.optimized.order);
  return [...plan.optimized.order.map((id) => byId.get(id)).filter((s): s is Stop => !!s), ...plan.stops.filter((s) => !seen.has(s.id))];
}

export const fmtDuration = (sec: number) => {
  const m = Math.round(sec / 60);
  return m < 60 ? `${m} דק'` : `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')} שע'`;
};
export const fmtKm = (m: number) => `${(m / 1000).toFixed(m < 10_000 ? 1 : 0)} ק"מ`;
export const fmtClock = (ms: number) => new Date(ms).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
