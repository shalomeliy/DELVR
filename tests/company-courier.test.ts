import { describe, expect, it } from 'vitest';
import { courierError, currentStop, greeting, israelDay, progress, withPending, type CStop } from '../src/company/courier/route';
import type { Mark } from '../src/company/outbox';

const st = (id: string, seq: number, delivery: CStop['delivery'] = 'todo'): CStop => ({ id, seq, input: id, address: null, lat: 31.8, lng: 34.7,
  due_at: null, note: null, delivery, fail_code: null, fail_reason: null, handled_at: null });
const mark = (stopId: string, outcome: Mark['outcome'], extra: Partial<Mark> = {}): Mark =>
  ({ id: `m-${stopId}-${outcome}`, stopId, outcome, code: null, reason: null, lat: null, lng: null, at: '2026-11-17T08:00:00.000Z', ...extra });

describe('courier route on the phone', () => {
  it('queued marks show on top of the server stops, in tap order', () => {
    const s = withPending([st('b', 2), st('a', 1), st('c', 3)], [
      mark('a', 'delivered'), mark('b', 'failed', { code: 'moved' }), mark('b', 'todo'), mark('b', 'pasted'), mark('gone', 'delivered')]);
    expect(s.map((x) => `${x.id}:${x.delivery}`)).toEqual(['a:delivered', 'b:pasted', 'c:todo']);
    expect(s[1].fail_code).toBeNull();
    expect(currentStop(s)?.id).toBe('c');
  });
  it('a failed mark keeps its code and words', () => {
    const [s] = withPending([st('a', 1)], [mark('a', 'failed', { code: 'other', reason: 'כלב בחצר' })]);
    expect([s.fail_code, s.fail_reason, s.handled_at]).toEqual(['other', 'כלב בחצר', '2026-11-17T08:00:00.000Z']);
  });
  it('counts and pay', () => {
    const p = progress([st('a', 1, 'delivered'), st('b', 2, 'delivered'), st('c', 3, 'pasted'), st('d', 4, 'failed'), st('e', 5)],
      { price_delivered: 15, price_pasted: 10, price_failed: 0 });
    expect(p).toEqual({ total: 5, done: 4, delivered: 2, pasted: 1, failed: 1, earned: 40 });
    expect(progress([], null).earned).toBeNull();
  });
  it('no current stop when all are marked', () => expect(currentStop([st('a', 1, 'pasted')])).toBeNull());
  it('the day and the greeting follow Israel time', () => {
    const t = Date.parse('2026-11-17T22:30:00Z'); // 00:30 in Israel, already the 18th
    expect(israelDay(t)).toBe('2026-11-18');
    expect(greeting(Date.parse('2026-11-17T06:00:00Z'))).toBe('בוקר טוב');
    expect(greeting(t)).toBe('לילה טוב');
  });
  it('errors in Hebrew', () => {
    expect(courierError(new Error('invite already used'))).toMatch('כבר נפתח');
    expect(courierError(new TypeError('Failed to fetch'))).toMatch('אין קליטה');
  });
});
