import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Plan } from '../src/domain/types';

const store = new Map<string, string>();
vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) });

const { BACKUP_KEY, DRAFT_KEY, newestPlan, normalizePlan, readBackup, readDraft, within, writeBackup, writeDraft } = await import('../src/store/persist');

const route: Plan = {
  start: { input: 'דוכיפת 5 יבנה', address: 'דוכיפת 5, יבנה', location: { lat: 31.87, lng: 34.74 } },
  end: null,
  stops: [
    { id: 'a', input: 'הרצל 3 רחובות', spoken: 'הרצל 3 רחובות', city: 'רחובות', verify: 'ok', address: 'הרצל 3, רחובות', location: { lat: 31.89, lng: 34.81 }, order: 'auto', delivery: 'delivered', handledAt: 1000 },
    { id: 'b', input: 'ויצמן 14 רחובות', spoken: 'ויצמן 14 רחובות', city: 'רחובות', verify: 'ok', address: 'ויצמן 14, רחובות', location: { lat: 31.9, lng: 34.8 }, order: 'auto', delivery: 'todo' },
  ],
  optimized: { order: ['b', 'a'], legs: [{ durationSec: 60, distanceM: 500 }], totalDurationSec: 60, totalDistanceM: 500, at: 900 },
  startedAt: 950,
};

describe('active route survives a reload', () => {
  beforeEach(() => store.clear());

  it('a saved route comes back exactly: addresses, start, sorted order and statuses', () => {
    writeBackup(route);
    expect(readBackup()).toEqual(route);
  });

  it('the backup key keeps the old prefix so phones keep their route after the rename', () => {
    expect(BACKUP_KEY).toBe('delvr_plan');
    expect(DRAFT_KEY).toBe('delvr_draft');
  });

  it('a route saved by an older version without newer fields still opens', () => {
    const old = { start: { input: 'יבנה' }, stops: [{ id: 'x', input: 'הרצל 3', location: { lat: 1, lng: 2 } }] };
    const p = normalizePlan(old)!;
    expect(p.end).toBeNull();
    expect(p.stops[0]).toMatchObject({ id: 'x', spoken: 'הרצל 3', city: null, verify: 'ok', order: 'auto', delivery: 'todo' });
  });

  it('garbage is ignored instead of crashing the app', () => {
    expect(normalizePlan(undefined)).toBeUndefined();
    expect(normalizePlan('x')).toBeUndefined();
    store.set(BACKUP_KEY, '{not json');
    expect(readBackup()).toBeUndefined();
    expect(normalizePlan({ stops: [null, { id: 1 }], optimized: { order: 'bad' } })).toMatchObject({ stops: [], optimized: undefined, start: { input: '' } });
  });

  it('picks the copy saved last', () => {
    const older = { ...route, savedAt: 1 }, newer = { ...route, stops: [], savedAt: 2 };
    expect(newestPlan(older, newer)).toBe(newer);
    expect(newestPlan(newer, older)).toBe(newer);
    expect(newestPlan(undefined, older)).toBe(older);
    expect(newestPlan(older, undefined)).toBe(older);
    expect(newestPlan({ ...route }, { ...route })).toEqual(route);
  });

  it('addresses typed but not yet added are kept, and cleared once added', () => {
    writeDraft('הרצל 3 רחובות ויצמן 14');
    expect(readDraft()).toBe('הרצל 3 רחובות ויצמן 14');
    writeDraft('  ');
    expect(readDraft()).toBe('');
  });

  it('a database that never opens does not leave the app stuck loading', async () => {
    vi.useFakeTimers();
    const p = within(new Promise(() => {}), 3000);
    vi.advanceTimersByTime(3000);
    await expect(p).resolves.toBeUndefined();
    vi.useRealTimers();
  });
});

