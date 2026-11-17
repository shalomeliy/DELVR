// Pure helpers for invite links, kept apart from the screens so they are tested.
import type { Invite } from './api';

/** The token goes after '#', so it never reaches a server log or a Referer header. */
export const inviteLink = (token: string, origin = location.origin) => `${origin}/c#invite=${token}`;

export const inviteToken = (hash: string) => /(?:^#|&)invite=([0-9a-f]{32})(?:&|$)/.exec(hash)?.[1] ?? null;

export function whatsappLink(name: string, company: string, link: string) {
  const text = `היי ${name}, זה הקישור שלך למסלולים של ${company} ב-PassIT. פותחים אותו פעם אחת בטלפון שאיתו יוצאים לחלוקה:\n${link}`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export type InviteState = 'open' | 'expired';
export const inviteState = (i: Pick<Invite, 'expiresAt'>, now = Date.now()): InviteState =>
  Date.parse(i.expiresAt) < now ? 'expired' : 'open';

/** "עוד 6 ימים" / "עוד 5 שעות" / "פג תוקף". */
export function expiresIn(i: Pick<Invite, 'expiresAt'>, now = Date.now()) {
  const ms = Date.parse(i.expiresAt) - now;
  if (ms <= 0) return 'פג תוקף';
  const h = Math.floor(ms / 3_600_000);
  if (h >= 48) return `עוד ${Math.floor(h / 24)} ימים`;
  if (h >= 24) return 'עוד יום';
  if (h >= 1) return h === 1 ? 'עוד שעה' : `עוד ${h} שעות`;
  return 'פחות משעה';
}

/** Two letters for the avatar: first letters of the first two words. */
export const initials = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0] ?? '').join('') || '?';

/** Supabase's English errors, as the admin should read them. */
export function errorText(e: unknown) {
  const m = String((e as { message?: unknown })?.message ?? e);
  const map: [RegExp, string][] = [
    [/Invalid login credentials/i, 'אימייל או סיסמה לא נכונים'],
    [/Email not confirmed/i, 'צריך לאשר את האימייל. בדוק את תיבת הדואר'],
    [/User already registered/i, 'כבר יש חשבון עם האימייל הזה. היכנס במקום להירשם'],
    [/Password should be at least/i, 'הסיסמה קצרה מדי (לפחות 6 תווים)'],
    [/rate limit/i, 'יותר מדי ניסיונות. נסה שוב בעוד כמה דקות'],
    [/already in a company/, 'החשבון הזה כבר שייך לחברה'],
    [/name required/, 'חסר שם'],
    [/admins only/, 'רק מנהל יכול לעשות את זה'],
    [/Failed to fetch|NetworkError|network/i, 'אין חיבור לשרת. בדוק את האינטרנט ונסה שוב'],
  ];
  return map.find(([re]) => re.test(m))?.[1] ?? m;
}
