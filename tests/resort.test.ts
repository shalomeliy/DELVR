import { afterEach, describe, expect, it, vi } from 'vitest';
import { optimizePlan } from '../src/services/optimize';
import type { Plan, Stop } from '../src/domain/types';

const START = { lat: 31.88, lng: 34.74 };
const HERE = { lat: 31.95, lng: 34.8 };
const END = { lat: 31.96, lng: 34.8 };
const stop = (id: string, lat: number, delivery: Stop['delivery'] = 'todo'): Stop => ({
  id, input: id, spoken: id, city: null, verify: 'ok', location: { lat, lng: 34.77 }, order: 'auto', delivery,
  ...(delivery !== 'todo' ? { handledAt: 1 } : {}),
});
const plan = (end: Plan['end'] = null): Plan => ({ start: { input: 'בית', location: START }, end, stops: [stop('a', 31.9, 'delivered'), stop('b', 31.91), stop('c', 31.92)] });

function captureFetch() {
  const bodies: any[] = [];
  vi.stubGlobal('fetch', vi.fn(async (_u: string, init: RequestInit) => {
    bodies.push(JSON.parse(init.body as string));
    return new Response(JSON.stringify({ order: ['b', 'c'], legs: [], totalDurationSec: 0, totalDistanceM: 0 }), { status: 200 });
  }));
  return bodies;
}
afterEach(() => vi.unstubAllGlobals());

describe('re-sort from a picked point', () => {
  it('starts at the picked point and comes back to it when no end is set, with only open stops', async () => {
    const bodies = captureFetch();
    const opt = await optimizePlan(plan(), undefined, { from: HERE });
    expect(bodies[0].origin).toEqual(HERE);
    expect(bodies[0].destination).toEqual(HERE);
    expect(bodies[0].stops.map((s: { id: string }) => s.id)).toEqual(['b', 'c']);
    expect(opt.from).toEqual(HERE);
  });

  it('ends at the end address when one is given', async () => {
    const bodies = captureFetch();
    await optimizePlan(plan({ input: 'סוף', location: END }), undefined, { from: HERE });
    expect(bodies[0].origin).toEqual(HERE);
    expect(bodies[0].destination).toEqual(END);
  });

  it('without a picked point keeps the old behaviour: from the last handled stop back to the start', async () => {
    const bodies = captureFetch();
    const opt = await optimizePlan(plan());
    expect(bodies[0].origin).toEqual({ lat: 31.9, lng: 34.77 });
    expect(bodies[0].destination).toEqual(START);
    expect(opt.from).toBeUndefined();
  });
});
