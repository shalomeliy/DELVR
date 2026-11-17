// Company mode runs on Israel time, whatever the device's own time zone: "today", deadlines and the route day.
const TZ = 'Asia/Jerusalem';

/** "YYYY-MM-DD" in Israel, offset days from today. */
export function israelDay(offset = 0, now = Date.now()) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  if (!offset) return today;
  const [y, m, d] = today.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + offset)).toISOString().slice(0, 10);
}

/** Israel's offset from UTC at that moment, in ms (2h in winter, 3h in summer). */
function offsetAt(utcMs: number) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })
    .formatToParts(utcMs).map((x) => [x.type, Number(x.value)]));
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(utcMs / 1000) * 1000;
}

/** Epoch ms of a wall-clock time in Israel on that day ("2026-11-18", "10:30"). */
export function israelTime(day: string, hhmm: string): number | undefined {
  const t = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!t || +t[1] > 23 || +t[2] > 59) return undefined;
  const [y, m, d] = day.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d, +t[1], +t[2]);
  const first = guess - offsetAt(guess);
  return guess - offsetAt(first);
}
