import { describe, expect, it, vi } from 'vitest';
import { handleOptimize, optimizeRoute, sweepOrder, validate, HttpError } from '../api/_lib/optimize';

const TLV = { lat: 32.08, lng: 34.78 };
const p = (id: string, d: number, order?: 'first' | 'auto' | 'last') => ({ id, lat: 31.88 + d, lng: 34.74 + d, order });

function fakeGoogle(handler: (body: any) => any) {
  const calls: any[] = [];
  const fn = vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string);
    calls.push(body);
    return new Response(JSON.stringify(handler(body)), { status: 200 });
  });
  return { fn: fn as unknown as typeof fetch, calls };
}

const route = (n: number, idx?: number[]) => ({
  routes: [{
    optimizedIntermediateWaypointIndex: idx,
    legs: Array.from({ length: n + 1 }, () => ({ duration: '120s', distanceMeters: 1000 })),
    duration: `${120 * (n + 1)}s`, distanceMeters: 1000 * (n + 1), polyline: { encodedPolyline: 'abc' },
  }],
});

describe('validate', () => {
  it('rejects more than 25 stops', () => {
    const stops = Array.from({ length: 26 }, (_, i) => p(`s${i}`, i / 1000));
    expect(() => validate({ origin: TLV, stops })).toThrow(/25/);
  });
  it('rejects points outside Israel', () => {
    expect(() => validate({ origin: TLV, stops: [{ id: 'a', lat: 48.85, lng: 2.35 }] })).toThrow(/ישראל/);
  });
  it('rejects duplicate ids and missing origin', () => {
    expect(() => validate({ origin: TLV, stops: [p('a', 0), p('a', 0.01)] })).toThrow(HttpError);
    expect(() => validate({ stops: [p('a', 0)] })).toThrow(/יציאה/);
  });
});

describe('optimizeRoute', () => {
  it('returns stops in the order Google optimized', async () => {
    const g = fakeGoogle(() => route(3, [2, 0, 1]));
    const out = await optimizeRoute(validate({ origin: TLV, stops: [p('a', 0), p('b', 0.01), p('c', 0.02)] }), 'k', g.fn);
    expect(out.order).toEqual(['c', 'a', 'b']);
    expect(out.legs).toHaveLength(4);
    expect(out.totalDurationSec).toBe(480);
    expect(out.picked).toBe('google');
    // One optimizing call, plus one check of the sweep order (same cost here, so Google's order stays).
    expect(g.calls.length).toBeLessThanOrEqual(2);
    expect(g.calls[0]).toMatchObject({ optimizeWaypointOrder: true, routingPreference: 'TRAFFIC_AWARE', languageCode: 'he', regionCode: 'IL' });
    // Round trip: destination equals origin.
    expect(g.calls[0].destination).toEqual(g.calls[0].origin);
  });

  it('keeps first and last stops pinned and only optimizes the rest', async () => {
    const g = fakeGoogle((body) => route(body.intermediates.length, body.optimizeWaypointOrder ? [1, 0] : undefined));
    const out = await optimizeRoute(validate({ origin: TLV, stops: [p('a', 0, 'last'), p('b', 0.01), p('c', 0.02, 'first'), p('d', 0.03)] }), 'k', g.fn);
    expect(out.order).toEqual(['c', 'd', 'b', 'a']);
    expect(g.calls).toHaveLength(2);
    expect(g.calls[0].intermediates).toHaveLength(2);       // only the auto stops
    expect(g.calls[1].optimizeWaypointOrder).toBe(false);    // full route for legs
    expect(out.legs).toHaveLength(5);
  });

  it('open route: ends at the stop farthest from the start, with no return leg', async () => {
    const g = fakeGoogle((body) => route(body.intermediates.length, body.intermediates.length > 1 ? [1, 0] : [0]));
    const near = p('near', 0.001), mid = p('mid', 0.02), far = p('far', 0.2);
    const out = await optimizeRoute(validate({ origin: { lat: 31.88, lng: 34.74 }, open: true, stops: [far, near, mid] }), 'k', g.fn);
    expect(out.order.at(-1)).toBe('far');
    expect(out.order).toHaveLength(3);
    expect(g.calls).toHaveLength(1);
    expect(g.calls[0].destination.location.latLng).toEqual({ latitude: far.lat, longitude: far.lng });
    expect(out.legs).toHaveLength(3);
  });

  it('open route with one stop drives straight to it', async () => {
    const g = fakeGoogle(() => route(0));
    const out = await optimizeRoute(validate({ origin: TLV, open: true, stops: [p('a', 0)] }), 'k', g.fn);
    expect(out.order).toEqual(['a']);
    expect(g.calls[0].intermediates).toHaveLength(0);
  });

  it('scooter (default) keeps off highways; car does not', async () => {
    const g = fakeGoogle(() => route(1, [0]));
    await optimizeRoute(validate({ origin: TLV, stops: [p('a', 0)] }), 'k', g.fn);
    expect(g.calls[0].routeModifiers).toEqual({ avoidHighways: true });
    expect(g.calls[0].travelMode).toBe('DRIVE');
    const c = fakeGoogle(() => route(1, [0]));
    await optimizeRoute(validate({ origin: TLV, vehicle: 'car', stops: [p('a', 0)] }), 'k', c.fn);
    expect(c.calls[0].routeModifiers).toBeUndefined();
  });

  it('takes the sweep order when Google confirms it is shorter (the far stop first, not last)', async () => {
    // Start in the middle, end to the north-east. Google leaves the south-west stop for last.
    const start = { lat: 31.875, lng: 34.74 }, endAt = { lat: 31.95, lng: 34.80 };
    const sw = { id: 'sw', lat: 31.86, lng: 34.725 }, mid = { id: 'mid', lat: 31.878, lng: 34.745 }, ne = { id: 'ne', lat: 31.89, lng: 34.76 };
    const g = fakeGoogle((body) => {
      if (body.optimizeWaypointOrder) return { routes: [{ optimizedIntermediateWaypointIndex: [1, 2, 0], legs: [], duration: '1500s', distanceMeters: 30000 }] };
      return { routes: [{ legs: [], duration: '1600s', distanceMeters: 21000 }] };
    });
    const out = await optimizeRoute(validate({ origin: start, destination: endAt, stops: [sw, mid, ne] }), 'k', g.fn);
    expect(out.order).toEqual(['sw', 'mid', 'ne']);
    expect(out.picked).toBe('sweep');
    expect(out.totalDistanceM).toBe(21000);
    // A car goes by time, so Google's faster order stays.
    const c = await optimizeRoute(validate({ origin: start, destination: endAt, vehicle: 'car', stops: [sw, mid, ne] }), 'k', g.fn);
    expect(c.order).toEqual(['mid', 'ne', 'sw']);
    expect(c.picked).toBe('google');
  });

  it('maps Google errors to clear Hebrew errors', async () => {
    const fn = (async () => new Response('denied', { status: 403 })) as unknown as typeof fetch;
    await expect(optimizeRoute(validate({ origin: TLV, stops: [p('a', 0)] }), 'k', fn)).rejects.toMatchObject({ status: 502 });
    const quota = (async () => new Response('', { status: 429 })) as unknown as typeof fetch;
    await expect(optimizeRoute(validate({ origin: TLV, stops: [p('a', 0)] }), 'k', quota)).rejects.toMatchObject({ status: 429 });
  });
});

describe('sweepOrder', () => {
  it('visits points along the way from start to end', () => {
    const from = { lat: 31.85, lng: 34.70 }, to = { lat: 31.95, lng: 34.80 };
    const mids = [0.08, 0.02, 0.05, 0.03].map((d) => ({ lat: 31.85 + d, lng: 34.70 + d }));
    expect(sweepOrder(from, to, mids)).toEqual([1, 3, 2, 0]);
  });
  it('uncrosses a nearest-neighbour path with 2-opt', () => {
    const from = { lat: 31.80, lng: 34.70 }, to = { lat: 31.80, lng: 34.80 };
    const mids = [{ lat: 31.90, lng: 34.72 }, { lat: 31.81, lng: 34.72 }, { lat: 31.90, lng: 34.78 }, { lat: 31.81, lng: 34.78 }];
    // Shortest: from -> up the west side, across the top, down the east side -> to.
    expect(sweepOrder(from, to, mids)).toEqual([1, 0, 2, 3]);
  });
});

describe('handleOptimize', () => {
  const req = (body: unknown) => new Request('http://x/api/optimize', { method: 'POST', body: JSON.stringify(body), headers: { 'x-forwarded-for': '1.2.3.4' } });
  it('fails clearly when the server key is missing', async () => {
    const res = await handleOptimize(req({ origin: TLV, stops: [p('a', 0)] }), undefined);
    expect(res.status).toBe(500);
  });
  it('returns 400 with a Hebrew message for bad input', async () => {
    const res = await handleOptimize(req({ origin: TLV, stops: [] }), 'k');
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/עצירות/);
  });
  it('rate-limits one IP per minute', async () => {
    const g = fakeGoogle(() => route(1, [0]));
    const r = (ip: string) => new Request('http://x', { method: 'POST', body: JSON.stringify({ origin: TLV, stops: [p('a', 0)] }), headers: { 'x-forwarded-for': ip } });
    const statuses = [];
    for (let i = 0; i < 11; i++) statuses.push((await handleOptimize(r('9.9.9.9'), 'k', g.fn)).status);
    expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true);
    expect(statuses[10]).toBe(429);
  });
});
