// Pure helpers for invite links, kept apart from the screens so they are tested.
import type { Invite } from './api';
import { courierOrigin } from './mode';

/** The token goes after '#', so it never reaches a server log or a Referer header. */
export const inviteLink = (token: string, origin = courierOrigin(location.origin)) => `${origin}/c#invite=${token}`;

export const inviteToken = (hash: string) => /(?:^#|&)invite=([0-9a-f]{32})(?:&|$)/.exec(hash)?.[1] ?? null;

/** The join message the admin sends. WhatsApp shows *text* in bold. */
export function inviteMessage(name: string, company: string, link: string, newPhone = false) {
  const first = name.replace(/\s*\(.*\)\s*$/, '').trim().split(/\s+/)[0] || name;
  return [
    newPhone ? `*${first}, הנה קישור חדש ל-PassIT של ${company}*` : `*${first}, ברוך הבא לצוות השליחים של ${company}*`,
    '',
    'המסלולים שלך מגיעים מעכשיו ב-PassIT: כל מסלול כבר מסודר בדרך הכי מהירה, ואתה רק נוסע ומסמן.',
    '',
    `*הצטרפות (פעם אחת, דקה):*`,
    'פותחים את הקישור בטלפון שאיתו יוצאים לחלוקה. בלי סיסמה, בלי הרשמה ובלי אפליקציה להתקין.',
    link,
    '',
    '*חשוב לדעת:*',
    '- הקישור אישי, עובד בטלפון אחד בלבד ותקף 7 ימים',
    '- בכל עצירה מסמנים *נמסר*, *הדבקה* או *נכשל*',
    '- *הדבקה*: לא בבית, לא עונה או אין גישה לבניין',
    '- *נכשל*: רק כשאי אפשר למסור וגם אי אפשר להדביק (בוחרים סיבה)',
    '- אין קליטה? מסמנים כרגיל, הכול נשלח לבד כשהקליטה חוזרת',
    '- המיקום נשמר רק ברגע הסימון, לא במעקב רציף',
    '- לא מוחקים את נתוני הדפדפן. אם זה קרה, מבקשים קישור חדש',
    '',
    'בהצלחה בדרכים!',
  ].join('\n');
}

export const whatsappLink = (name: string, company: string, link: string, newPhone = false) =>
  `https://wa.me/?text=${encodeURIComponent(inviteMessage(name, company, link, newPhone))}`;

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
    [/route already started/, 'השליח כבר התחיל את המסלול הזה, אי אפשר להחליף אותו. הוספת כתובות באמצע תגיע בלוח הבקרה'],
    [/day already paid/, 'היום הזה כבר אושר לתשלום'],
    [/not an active courier/, 'השליח הזה לא פעיל'],
    [/too many stops/, 'אפשר עד 25 עצירות במסלול'],
    [/Failed to fetch|NetworkError|network/i, 'אין חיבור לשרת. בדוק את האינטרנט ונסה שוב'],
  ];
  return map.find(([re]) => re.test(m))?.[1] ?? m;
}
