// Per-day delivery history for the calendar and the daily/weekly reports. Pure functions, stored by src/store/db.ts.

export type Outcome = 'delivered' | 'pasted' | 'failed';

export interface HistoryEntry {
  stopId: string;
  address: string;
  outcome: Outcome;
  /** Why it failed, in the courier's words. Only on failed entries. */
  reason?: string;
  at: number;
}

export interface DayLog { day: string; entries: HistoryEntry[] }

export const OUTCOME_LABEL: Record<Outcome, string> = { delivered: 'נמסר', pasted: 'הדבקה', failed: 'נכשל' };
export const WEEKDAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

const pad = (n: number) => String(n).padStart(2, '0');

/** Local calendar day, "2026-10-25". Sorts as text, so it doubles as the database key. */
export const dayKey = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

const parseDay = (day: string) => { const [y, m, d] = day.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (day: string, n: number) => { const d = parseDay(day); d.setDate(d.getDate() + n); return dayKey(d.getTime()); };
export const weekdayOf = (day: string) => parseDay(day).getDay();
/** "25/10/2026" */
export const fmtDay = (day: string) => day.split('-').reverse().join('/');

/** The Israeli work week: Sunday to Saturday, around the given day. */
export function weekOf(day: string): string[] {
  const sunday = addDays(day, -weekdayOf(day));
  return Array.from({ length: 7 }, (_, i) => addDays(sunday, i));
}

/** Days of a month laid out in weeks from Sunday. Empty cells before the 1st are null. month is 0-11. */
export function monthGrid(year: number, month: number): (string | null)[] {
  const first = dayKey(new Date(year, month, 1).getTime());
  const days = new Date(year, month + 1, 0).getDate();
  return [...Array(weekdayOf(first)).fill(null), ...Array.from({ length: days }, (_, i) => addDays(first, i))];
}

/** One entry per stop: marking it again replaces the earlier outcome. */
export function withEntry(log: DayLog | undefined, day: string, entry: HistoryEntry): DayLog {
  const entries = (log?.entries ?? []).filter((e) => e.stopId !== entry.stopId);
  return { day, entries: [...entries, entry].sort((a, b) => a.at - b.at) };
}

export function withoutEntry(log: DayLog | undefined, day: string, stopId: string): DayLog {
  return { day, entries: (log?.entries ?? []).filter((e) => e.stopId !== stopId) };
}

export interface Summary { total: number; delivered: number; pasted: number; failed: number }

export function summarize(entries: HistoryEntry[]): Summary {
  const s: Summary = { total: entries.length, delivered: 0, pasted: 0, failed: 0 };
  for (const e of entries) s[e.outcome]++;
  return s;
}

const fmtTime = (ms: number) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

// Excel opens a UTF-8 CSV in Hebrew correctly only with the byte-order mark in front.
const cell = (v: string | number) => { const s = String(v); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const csv = (rows: (string | number)[][]) => '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';

const detailRows = (entries: HistoryEntry[], withDate: boolean) =>
  entries.map((e) => [...(withDate ? [fmtDay(dayKey(e.at))] : []), fmtTime(e.at), e.address, OUTCOME_LABEL[e.outcome], e.reason ?? '']);

export function dailyCsv(day: string, entries: HistoryEntry[]): string {
  const s = summarize(entries);
  return csv([
    ['דוח יומי', `יום ${WEEKDAYS[weekdayOf(day)]}`, fmtDay(day)],
    [],
    ['סה"כ', 'נמסר', 'הדבקה', 'נכשל'],
    [s.total, s.delivered, s.pasted, s.failed],
    [],
    ['שעה', 'כתובת', 'תוצאה', 'סיבת כישלון'],
    ...detailRows(entries, false),
  ]);
}

export function weeklyCsv(days: string[], logs: DayLog[]): string {
  const byDay = new Map(logs.map((l) => [l.day, l.entries]));
  const all = days.flatMap((d) => byDay.get(d) ?? []);
  const t = summarize(all);
  return csv([
    ['דוח שבועי', `${fmtDay(days[0])} עד ${fmtDay(days[days.length - 1])}`],
    [],
    ['תאריך', 'יום', 'סה"כ', 'נמסר', 'הדבקה', 'נכשל'],
    ...days.map((d) => { const s = summarize(byDay.get(d) ?? []); return [fmtDay(d), WEEKDAYS[weekdayOf(d)], s.total, s.delivered, s.pasted, s.failed]; }),
    ['סה"כ שבועי', '', t.total, t.delivered, t.pasted, t.failed],
    [],
    ['תאריך', 'שעה', 'כתובת', 'תוצאה', 'סיבת כישלון'],
    ...detailRows(all, true),
  ]);
}
