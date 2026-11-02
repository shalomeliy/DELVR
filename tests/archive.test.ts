import { describe, expect, it } from 'vitest';
import { archiveOf, lastStatusAt, routeTime } from '../src/domain/archive';
import { emptyPlan, stopsFromText } from '../src/domain/plan';

describe('archive', () => {
  const stops = stopsFromText('הרצל 1 יבנה, הרצל 2 יבנה', null);

  it('skips a route nothing was done on', () => expect(archiveOf({ ...emptyPlan(), stops })).toBeNull());

  it('keeps the statuses of a half-done route', () => {
    const done = [{ ...stops[0], delivery: 'failed' as const, failReason: 'אין מענה', handledAt: 2000 }, stops[1]];
    const r = archiveOf({ ...emptyPlan(), stops: done, startedAt: 1000 }, 5000)!;
    expect(r.stops).toEqual([
      { address: 'הרצל 1, יבנה', status: 'failed', reason: 'אין מענה', at: 2000 },
      { address: 'הרצל 2, יבנה', status: 'todo', reason: undefined, at: undefined },
    ]);
    expect(routeTime(r)).toBe(1000);
    expect(lastStatusAt(r)).toBe(2000);
  });
});
