import { describe, expect, it } from 'vitest';
import { judge, sameCity } from '../src/services/geocode';
import type { Plan } from '../src/domain/types';
import { canOptimize, emptyPlan, orderedStops, startCity, stopsFromText, addStops } from '../src/domain/plan';

const result = (over: Partial<{ number: boolean; city: string; partial: boolean }> = {}) => ({
  formatted_address: 'הרצל 3, רחובות',
  partial_match: over.partial ?? false,
  location: { lat: 31.89, lng: 34.81 },
  address_components: [
    ...(over.number === false ? [] : [{ long_name: '3', types: ['street_number'] }]),
    { long_name: 'הרצל', types: ['route'] },
    { long_name: over.city ?? 'רחובות', types: ['locality', 'political'] },
  ],
});

describe('judge (user rule: anything not a full address goes to the fix list)', () => {
  it('accepts a full match in the right city', () => expect(judge(result(), 'רחובות').ok).toBe(true));
  it('rejects a missing house number', () => expect(judge(result({ number: false }), 'רחובות')).toMatchObject({ ok: false, reason: expect.stringMatching(/מספר/) }));
  it('rejects a different city and says which', () => expect(judge(result({ city: 'יבנה' }), 'רחובות')).toMatchObject({ ok: false, reason: expect.stringMatching(/יבנה/) }));
  it('rejects a partial match', () => expect(judge(result({ partial: true }), 'רחובות').ok).toBe(false));
  it('rejects no result', () => expect(judge(undefined, 'רחובות').ok).toBe(false));
  it('treats תל אביב and תל אביב-יפו as the same city', () => expect(sameCity('תל אביב', 'תל אביב-יפו')).toBe(true));
});

describe('plan', () => {
  it('stops without a city inherit the start city', () => {
    const plan = { ...emptyPlan(), start: { input: 'דוכיפת 5 יבנה' } };
    const stops = stopsFromText('הרצל 3 התורן 4 רחובות', startCity(plan));
    expect(stops.map((s) => s.input)).toEqual(['הרצל 3, יבנה', 'התורן 4, רחובות']);
  });
  it('blocks ordering until every stop is verified', () => {
    let plan: Plan = { ...emptyPlan(), start: { input: 'x', location: { lat: 31.8, lng: 34.7 } } };
    plan = addStops(plan, stopsFromText('הרצל 3 יבנה', 'יבנה')).plan;
    expect(canOptimize(plan).ok).toBe(false);
    plan = { ...plan, stops: plan.stops.map((s) => ({ ...s, verify: 'ok' as const, location: { lat: 31.8, lng: 34.7 } })) };
    expect(canOptimize(plan).ok).toBe(true);
  });
  it('caps at 25 stops and reports how many were dropped', () => {
    const text = Array.from({ length: 30 }, (_, i) => `הרצל ${i + 1} יבנה`).join(', ');
    const { plan, dropped } = addStops(emptyPlan(), stopsFromText(text, null));
    expect(plan.stops).toHaveLength(25);
    expect(dropped).toBe(5);
  });
  it('orders stops by the optimized route', () => {
    const base = addStops(emptyPlan(), stopsFromText('הרצל 1 יבנה, הרצל 2 יבנה', null)).plan;
    const [a, b] = base.stops;
    const plan = { ...base, optimized: { order: [b.id, a.id], legs: [], totalDurationSec: 0, totalDistanceM: 0, at: 0 } };
    expect(orderedStops(plan).map((s) => s.id)).toEqual([b.id, a.id]);
  });
});
