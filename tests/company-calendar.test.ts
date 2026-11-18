import { describe, expect, it } from 'vitest';
import { dayTitle, monthGrid, monthRange, monthTitle, shiftMonth, sumDay, type DayRoute } from '../src/company/calendar';
import type { LiveStop } from '../src/company/api';

const st = (delivery: LiveStop['delivery']) => ({ delivery } as LiveStop);
const route = (day: string, courierId: string, status: string, list: LiveStop[]): DayRoute => ({ id: `${day}${courierId}`, courierId, day, status, version: 1, sentAt: null, list });

describe('calendar', () => {
  it('November 2026 starts on Sunday and has 5 weeks', () => {
    const g = monthGrid('2026-11');
    expect(g[0][0]).toBe('2026-11-01');
    expect(g.length).toBe(5);
    expect(g.flat().filter(Boolean).length).toBe(30);
    expect(g.every((w) => w.length === 7)).toBe(true);
  });

  it('pads the days before the 1st (Feb 2026 starts on Sunday, Mar 2027 on Monday)', () => {
    expect(monthGrid('2027-03')[0].slice(0, 2)).toEqual([null, '2027-03-01']);
    expect(monthRange('2028-02')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
  });

  it('moves across years', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(monthTitle('2026-11')).toBe('נובמבר 2026');
  });

  it('names the day from the date itself', () => expect(dayTitle('2026-11-18')).toBe('יום רביעי, 18.11'));

  it('sums a day and ignores drafts and other days', () => {
    const all = [
      route('2026-11-18', 'a', 'active', [st('delivered'), st('pasted'), st('todo')]),
      route('2026-11-18', 'b', 'sent', [st('failed')]),
      route('2026-11-18', 'c', 'draft', [st('todo'), st('todo')]),
      route('2026-11-19', 'a', 'sent', [st('todo')]),
    ];
    expect(sumDay(all, '2026-11-18')).toEqual({ routes: 2, couriers: 2, stops: 4, delivered: 1, pasted: 1, failed: 1, todo: 1 });
    expect(sumDay(all, '2026-11-20').routes).toBe(0);
  });
});
