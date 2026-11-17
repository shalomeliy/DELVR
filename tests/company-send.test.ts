import { describe, expect, it } from 'vitest';
import { emptyPlan } from '../src/domain/plan';
import type { Plan, Stop } from '../src/domain/types';
import { cannotSend, dayIso, departFor, toSendPayload } from '../src/company/send';

const stop = (id: string, extra: Partial<Stop> = {}): Stop => ({
  id, input: `רחוב ${id}`, spoken: `רחוב ${id}`, city: 'יבנה', verify: 'ok', address: `רחוב ${id}, יבנה`,
  location: { lat: 31.8, lng: 34.7 }, order: 'auto', delivery: 'todo', ...extra });
const base = (): Plan => ({ ...emptyPlan(), start: { input: 'הנשיא 5 יבנה', address: 'הנשיא 5, יבנה', location: { lat: 31.877, lng: 34.739 } },
  stops: [stop('a'), stop('b', { dueAt: '10:30', note: 'קומה 3' }), stop('c')] });
const sorted = (p: Plan): Plan => ({ ...p, optimized: { order: ['c', 'a', 'b'], legs: [], totalDurationSec: 1200, totalDistanceM: 5000, polyline: 'xyz', at: 1 } });
const now = new Date(2026, 10, 17, 14, 0).getTime();

describe('sending a route', () => {
  it('days are local dates', () => {
    expect(dayIso(0, now)).toBe('2026-11-17');
    expect(dayIso(1, now)).toBe('2026-11-18');
    expect(dayIso(1, new Date(2026, 11, 31, 23, 0).getTime())).toBe('2027-01-01');
  });
  it('today departs now, a later day at 08:00', () => {
    expect(departFor('2026-11-17', now)).toBe(now);
    expect(departFor('2026-11-18', now)).toBe(new Date(2026, 10, 18, 8, 0).getTime());
  });
  it('refuses until every address is checked and the route is sorted and fresh', () => {
    expect(cannotSend(emptyPlan())).toBe('אין עצירות במסלול');
    expect(cannotSend({ ...base(), stops: [stop('a', { verify: 'needs_fix' })] })).toMatch('לא אומתו');
    expect(cannotSend(base())).toMatch('מסדרים');
    const s = sorted(base());
    expect(cannotSend({ ...s, optimized: { ...s.optimized!, stale: true } })).toMatch('סדר מחדש');
    expect(cannotSend(s)).toBeNull();
  });
  it('stops go in driving order with the time on the route day and the note', () => {
    const tomorrow = departFor('2026-11-18', now);
    const p = toSendPayload(sorted(base()), tomorrow);
    expect(p.stops.map((s) => s.input)).toEqual(['רחוב c', 'רחוב a', 'רחוב b']);
    expect(p.stops[2]).toMatchObject({ note: 'קומה 3', due_at: new Date(2026, 10, 18, 10, 30).toISOString() });
    expect(p.stops[0]).not.toHaveProperty('due_at');
    expect(p.start).toEqual({ input: 'הנשיא 5 יבנה', address: 'הנשיא 5, יבנה', lat: 31.877, lng: 34.739 });
    expect(p.endMode).toBe('return');
    expect(p.optimized).toMatchObject({ totalDurationSec: 1200, polyline: 'xyz', departAt: tomorrow });
  });
});
