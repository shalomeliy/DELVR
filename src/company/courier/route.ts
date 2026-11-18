// The courier's route as the phone shows it: the server's stops with the marks still waiting in the outbox laid
// on top, so a tap made without signal shows at once. Pure, so it is tested without a server.
import type { Mark, Outcome } from '../outbox';

export interface CStop {
  id: string; seq: number; input: string; address: string | null; lat: number | null; lng: number | null;
  due_at: string | null; note: string | null; delivery: Outcome; fail_code: string | null; fail_reason: string | null; handled_at: string | null;
  proof_path?: string | null;
}
export interface Prices { price_delivered: number; price_pasted: number; price_failed: number }

/** Server stops, in order, with each queued mark applied in tap order. */
export function withPending(stops: CStop[], pending: Mark[]): CStop[] {
  const out = new Map(stops.map((s) => [s.id, { ...s }]));
  for (const m of pending) {
    const s = out.get(m.stopId);
    if (!s) continue;
    s.delivery = m.outcome;
    s.fail_code = m.outcome === 'failed' ? m.code : null;
    s.fail_reason = m.outcome === 'failed' ? m.reason : null;
    s.handled_at = m.outcome === 'todo' ? null : m.at;
  }
  return [...out.values()].sort((a, b) => a.seq - b.seq);
}

export function progress(stops: CStop[], prices: Prices | null) {
  const n = (o: Outcome) => stops.filter((s) => s.delivery === o).length;
  const delivered = n('delivered'), pasted = n('pasted'), failed = n('failed');
  const earned = prices ? delivered * prices.price_delivered + pasted * prices.price_pasted + failed * prices.price_failed : null;
  return { total: stops.length, done: delivered + pasted + failed, delivered, pasted, failed, earned };
}

/** The stop to do now: the first one in route order not marked yet. */
export const currentStop = (stops: CStop[]) => stops.find((s) => s.delivery === 'todo') ?? null;

export { israelDay } from '../time';

export function greeting(now = Date.now()) {
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: 'numeric', hourCycle: 'h23' }).format(now));
  return h < 5 ? 'לילה טוב' : h < 12 ? 'בוקר טוב' : h < 17 ? 'צהריים טובים' : h < 21 ? 'ערב טוב' : 'לילה טוב';
}

/** Errors the courier may see, in Hebrew. */
export function courierError(e: unknown) {
  const m = String((e as { message?: unknown })?.message ?? e);
  const map: [RegExp, string][] = [
    [/invite not found/, 'הקישור לא תקין. בקש מהמנהל קישור חדש'],
    [/invite already used/, 'הקישור הזה כבר נפתח בטלפון אחר. בקש מהמנהל קישור חדש'],
    [/invite expired/, 'פג התוקף של הקישור. בקש מהמנהל קישור חדש'],
    [/already a member/, 'הטלפון הזה כבר מחובר לחברה'],
    [/Anonymous sign-ins are disabled/i, 'הכניסה בקישור כבויה אצל המנהל (Anonymous sign-ins ב-Supabase)'],
    [/day already paid/, 'היום הזה כבר אושר לתשלום, הסימון לא נשמר'],
    [/not your route/, 'העצירה הזו כבר לא במסלול שלך'],
    [/stop not found/, 'העצירה נמחקה מהמסלול'],
    [/reason text required/, 'בסיבה "אחר" צריך לכתוב מה קרה'],
    [/Failed to fetch|NetworkError|network/i, 'אין קליטה. הסימונים נשמרים בטלפון ויישלחו לבד'],
  ];
  return map.find(([re]) => re.test(m))?.[1] ?? m;
}

/** Started yesterday and not finished, then today or the next day ahead, then yesterday's that was never started. */
export function pickRoute<R extends { day: string; status: string }>(rows: R[], today: string): R | null {
  const old = rows.filter((r) => r.day < today);
  return old.find((r) => r.status === 'active') ?? rows.find((r) => r.day >= today) ?? old[0] ?? null;
}
