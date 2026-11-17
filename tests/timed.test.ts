import { describe, expect, it, vi } from 'vitest';
import { optimizeRoute, timeline, validate, SERVICE_SEC } from '../api/_lib/optimize';

// A fake Google that drives in straight lines at 10 m/s and keeps the order it is given.
const rad = (d: number) => (d * Math.PI) / 180;
const dist = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const x = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371e3 * Math.asin(Math.sqrt(x));
};
function straightGoogle() {
  const calls: any[] = [];
  const fn = vi.fn(async (_u: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string);
    calls.push(body);
    const pts = [body.origin, ...body.intermediates, body.destination].map((w: any) => ({ lat: w.location.latLng.latitude, lng: w.location.latLng.longitude }));
    const legs = pts.slice(1).map((p, i) => { const m = dist(pts[i], p); return { duration: `${Math.round(m / 10)}s`, distanceMeters: Math.round(m) }; });
    const total = legs.reduce((a, l) => a + parseInt(l.duration, 10), 0);
    return new Response(JSON.stringify({ routes: [{ optimizedIntermediateWaypointIndex: body.intermediates.map((_: unknown, i: number) => i), legs, duration: `${total}s`, distanceMeters: legs.reduce((a, l) => a + l.distanceMeters, 0) }] }), { status: 200 });
  });
  return { fn: fn as unknown as typeof fetch, calls };
}

const HOME = { lat: 31.88, lng: 34.74 };
const T0 = Date.UTC(2026, 10, 17, 8, 0);
const min = (m: number) => T0 + m * 60_000;
// ~1.1 km per 0.01 degree of latitude, about 2 minutes at 10 m/s.
const north = (id: string, d: number, dueAt?: number) => ({ id, lat: HOME.lat + d, lng: HOME.lng, ...(dueAt ? { dueAt } : {}) });

describe('בול בזמן: stops with a time', () => {
  it('visits a far timed stop first when its time is close, and is on time', async () => {
    const g = straightGoogle();
    const stops = [north('a', 0.01), north('b', 0.02), north('c', 0.03), north('t', 0.1, min(20))];
    const out = await optimizeRoute(validate({ origin: HOME, open: true, departAt: T0, stops }), 'k', g.fn);
    expect(out.order[0]).toBe('t');
    expect(out.deadlines).toHaveLength(1);
    expect(out.deadlines![0].lateSec).toBe(0);
  });

  it('puts stops that are on the way before the timed stop', async () => {
    const g = straightGoogle();
    const stops = [north('t', 0.1, min(60)), north('a', 0.02), north('b', 0.05), north('far', -0.05)];
    const out = await optimizeRoute(validate({ origin: HOME, departAt: T0, stops }), 'k', g.fn);
    const at = out.order.indexOf('t');
    expect(out.order.slice(0, at)).toEqual(expect.arrayContaining(['a', 'b']));
    expect(out.deadlines![0].lateSec).toBe(0);
  });

  it('drops stops before the timed stop when they make it late', async () => {
    const g = straightGoogle();
    // a and b sit a little off the way to t; with them the 15 minutes are missed, without them they are met.
    const stops = [north('t', 0.06, min(15)), { id: 'a', lat: HOME.lat + 0.03, lng: HOME.lng + 0.01 }, { id: 'b', lat: HOME.lat + 0.045, lng: HOME.lng - 0.01 }];
    // The route ends past t, so a and b look on the way and start out before it.
    const out = await optimizeRoute(validate({ origin: HOME, destination: north('end', 0.12), departAt: T0, stops }), 'k', g.fn);
    expect(out.deadlines![0].lateSec).toBe(0);
    expect(out.order.indexOf('t')).toBeLessThan(2);
    // First full route had both before t (late), the repaired one moved at least one after it.
    const fulls = g.calls.filter((c) => !c.optimizeWaypointOrder && c.intermediates.length === 3);
    expect(fulls.length).toBeGreaterThanOrEqual(2);
  });

  it('says by how much the time is missed when no order can make it', async () => {
    const g = straightGoogle();
    const out = await optimizeRoute(validate({ origin: HOME, departAt: T0, stops: [north('t', 0.2, min(5)), north('a', 0.01)] }), 'k', g.fn);
    expect(out.order[0]).toBe('t');
    expect(out.deadlines![0].lateSec).toBeGreaterThan(5 * 60);
  });

  it('uses a long wait for stops that would otherwise come after', async () => {
    const g = straightGoogle();
    // t is close but due in two hours; the other stops are past it, so at first they all land after it.
    const stops = [north('t', 0.01, min(120)), north('a', 0.03), north('b', 0.04)];
    const out = await optimizeRoute(validate({ origin: HOME, open: true, departAt: T0, stops }), 'k', g.fn);
    expect(out.order.at(-1)).toBe('t');
    expect(out.deadlines![0].lateSec).toBe(0);
  });

  it('a route without times is ordered as before, with no deadline fields', async () => {
    const g = straightGoogle();
    const out = await optimizeRoute(validate({ origin: HOME, departAt: T0, stops: [north('a', 0.01), north('b', 0.02)] }), 'k', g.fn);
    expect(out.deadlines).toBeUndefined();
  });

  it('validates times and caps timed stops at 5', () => {
    expect(() => validate({ origin: HOME, stops: [{ ...north('a', 0.01), dueAt: 'noon' }] })).toThrow(/שעה/);
    const six = Array.from({ length: 6 }, (_, i) => north(`s${i}`, i / 100 + 0.01, min(60 + i)));
    expect(() => validate({ origin: HOME, stops: six })).toThrow(/5/);
  });
});

describe('timeline', () => {
  it('adds driving, waiting when early and time at every stop', () => {
    const stops = [{ id: 'a', lat: 0, lng: 0 }, { id: 't', lat: 0, lng: 0, dueAt: min(30) }];
    const r = timeline(stops, [{ durationSec: 600 }, { durationSec: 300 }, { durationSec: 60 }], T0);
    // 10 min drive + 3 min at a + 5 min drive = 18 min; due at 30, so 12 min wait.
    expect(r.deadlines[0]).toMatchObject({ etaAt: min(10) + SERVICE_SEC * 1000 + 300_000, lateSec: 0, waitSec: 12 * 60 });
    expect(r.finishAt).toBe(min(30) + SERVICE_SEC * 1000 + 60_000);
  });
});
