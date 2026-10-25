import { describe, expect, it } from 'vitest';
import { addDays, dailyCsv, dayKey, monthGrid, summarize, weekOf, weeklyCsv, withEntry, withoutEntry, type HistoryEntry } from '../src/domain/history';

const at = (day: string, hh = 10) => new Date(`${day}T${String(hh).padStart(2, '0')}:00`).getTime();
const entry = (stopId: string, outcome: HistoryEntry['outcome'], day = '2026-10-25', reason?: string): HistoryEntry =>
  ({ stopId, address: `הרצל ${stopId}, רחובות`, outcome, reason, at: at(day) });

describe('history days', () => {
  it('keys a time by its local day', () => expect(dayKey(at('2026-10-25', 23))).toBe('2026-10-25'));
  it('adds days across a month', () => expect(addDays('2026-10-31', 1)).toBe('2026-11-01'));
  it('builds the Sunday to Saturday week', () => {
    // 25/10/2026 is a Sunday, 29/10 a Thursday.
    expect(weekOf('2026-10-29')).toEqual(['2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31']);
  });
  it('pads the month grid to start on Sunday', () => {
    const g = monthGrid(2026, 9); // October 2026 starts on a Thursday
    expect(g.slice(0, 5)).toEqual([null, null, null, null, '2026-10-01']);
    expect(g[g.length - 1]).toBe('2026-10-31');
  });
});

describe('history entries', () => {
  it('replaces the earlier outcome of the same stop', () => {
    const log = withEntry(withEntry(undefined, '2026-10-25', entry('1', 'failed')), '2026-10-25', entry('1', 'pasted'));
    expect(log.entries).toHaveLength(1);
    expect(log.entries[0].outcome).toBe('pasted');
  });
  it('removes a stop on undo', () => {
    const log = withEntry(undefined, '2026-10-25', entry('1', 'delivered'));
    expect(withoutEntry(log, '2026-10-25', '1').entries).toEqual([]);
  });
  it('counts delivered, pasted and failed apart', () => {
    expect(summarize([entry('1', 'delivered'), entry('2', 'pasted'), entry('3', 'failed'), entry('4', 'pasted')]))
      .toEqual({ total: 4, delivered: 1, pasted: 2, failed: 1 });
  });
});

describe('reports', () => {
  it('daily CSV has the BOM, totals and the failure reason', () => {
    const text = dailyCsv('2026-10-25', [entry('1', 'delivered'), entry('2', 'failed', '2026-10-25', 'אין מענה, ביקש לתאם')]);
    expect(text.startsWith('﻿')).toBe(true);
    expect(text).toContain('2,1,0,1');
    expect(text).toContain('"אין מענה, ביקש לתאם"');
    expect(text).toContain('"הרצל 2, רחובות"');
  });
  it('weekly CSV has a row per day and a week total', () => {
    const week = weekOf('2026-10-25');
    const text = weeklyCsv(week, [
      { day: '2026-10-25', entries: [entry('1', 'delivered'), entry('2', 'pasted')] },
      { day: '2026-10-27', entries: [entry('3', 'failed', '2026-10-27', 'כתובת שגויה')] },
    ]);
    expect(text).toContain('25/10/2026,ראשון,2,1,1,0');
    expect(text).toContain('26/10/2026,שני,0,0,0,0');
    expect(text).toContain('"סה""כ שבועי",,3,1,1,1');
    expect(text).toContain('כתובת שגויה');
  });
});
