// Turning the admin's sorted draft into what send_route() stores. Pure, so it is tested without a server.
import { endModeOf, orderedStops } from '../domain/plan';
import { israelDay, israelTime } from './time';
import type { Plan } from '../domain/types';

/** "YYYY-MM-DD" in Israel, offset days from today. The courier's phone uses the same day. */
export const dayIso = (offset = 0, now = Date.now()) => israelDay(offset, now);

/** When the sort assumes the courier leaves: now for today, 08:00 Israel time for a later day. */
export function departFor(day: string, now = Date.now()) {
  if (day <= israelDay(0, now)) return now;
  return israelTime(day, '08:00')!;
}

export interface SendPayload {
  start: { input: string; address?: string; lat?: number; lng?: number };
  endMode: 'open' | 'return' | 'address';
  end: { input: string; address?: string; lat?: number; lng?: number } | null;
  optimized: Record<string, unknown>;
  stops: { input: string; address?: string; lat: number; lng: number; due_at?: string; note?: string }[];
}

/** Why the draft cannot be sent yet, in Hebrew, or null when it can. */
export function cannotSend(plan: Plan): string | null {
  if (!plan.stops.length) return 'אין עצירות במסלול';
  if (plan.stops.some((s) => s.verify !== 'ok')) return 'יש כתובות שעוד לא אומתו או שצריך לתקן';
  if (!plan.optimized) return 'קודם מסדרים את המסלול';
  if (plan.optimized.stale) return 'המסלול השתנה אחרי הסידור. סדר מחדש לפני השליחה';
  return null;
}

const place = (p: Plan['start']) => ({ input: p.input, address: p.address, lat: p.location?.lat, lng: p.location?.lng });

export function toSendPayload(plan: Plan, day: string, departAt: number): SendPayload {
  const o = plan.optimized;
  return {
    start: place(plan.start),
    endMode: endModeOf(plan),
    end: plan.end ? place(plan.end) : null,
    // The line and the totals, so the courier's map and the admin's dashboard draw the same route. Stop ids are
    // the draft's own; the server gives new ones, so the order is carried by the stops' sequence instead.
    optimized: o ? { totalDurationSec: o.totalDurationSec, totalDistanceM: o.totalDistanceM, polyline: o.polyline, legs: o.legs, departAt } : {},
    stops: orderedStops(plan).filter((s) => s.location).map((s) => {
      const due = s.dueAt ? israelTime(day, s.dueAt) : undefined;
      return {
        input: s.input, address: s.address, lat: s.location!.lat, lng: s.location!.lng,
        ...(due ? { due_at: new Date(due).toISOString() } : {}),
        ...(s.note ? { note: s.note } : {}),
      };
    }),
  };
}
