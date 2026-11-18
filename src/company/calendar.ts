// Pure helpers for the admin's calendar: the month grid and what each day holds.
import type { LiveStop } from './api';

/** "YYYY-MM" of a "YYYY-MM-DD" day. */
export const monthOf = (day: string) => day.slice(0, 7);

/** The month before or after, as "YYYY-MM". */
export function shiftMonth(month: string, by: number) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return d.toISOString().slice(0, 7);
}

/** First and last day of a month, for the server query. */
export function monthRange(month: string) {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}

/** Weeks of the month, Sunday first (Israel), with null for the blanks before day 1 and after the last day. */
export function monthGrid(month: string): (string | null)[][] {
  const { to } = monthRange(month);
  const days = Number(to.slice(8));
  const [y, m] = month.split('-').map(Number);
  const lead = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)];
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
}

export interface DayRoute { id: string; courierId: string | null; day: string; status: string; version: number; sentAt: string | null; list: LiveStop[] }

export interface DaySum { routes: number; couriers: number; stops: number; delivered: number; pasted: number; failed: number; todo: number }

/** Totals for one day. Draft routes the admin never sent do not count. */
export function sumDay(routes: DayRoute[], day: string): DaySum {
  const sent = routes.filter((r) => r.day === day && r.status !== 'draft');
  const all = sent.flatMap((r) => r.list);
  const n = (d: LiveStop['delivery']) => all.filter((s) => s.delivery === d).length;
  return { routes: sent.length, couriers: new Set(sent.map((r) => r.courierId)).size, stops: all.length,
    delivered: n('delivered'), pasted: n('pasted'), failed: n('failed'), todo: n('todo') };
}

export const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
export const WEEKDAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
export const monthTitle = (month: string) => `${MONTHS[Number(month.slice(5)) - 1]} ${month.slice(0, 4)}`;

/** "יום רביעי, 18.11", from the day itself so the device's time zone never moves it. */
export function dayTitle(day: string) {
  const [y, m, d] = day.split('-').map(Number);
  const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const names = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  return `יום ${names[w]}, ${d}.${m}`;
}
