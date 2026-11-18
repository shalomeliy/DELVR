// Pure helpers for courier names and phone numbers, kept apart from the screens so they are tested.

export const cleanName = (name: string) => name.trim().replace(/\s+/g, ' ');

/** A phone the admin typed: null when empty, false when it is not a phone number, else the number with only digits, '+', space and '-'. */
export function cleanPhone(raw: string): string | null | false {
  const t = raw.trim();
  if (!t) return null;
  if (!/^\+?[0-9(][0-9 ()-]*$/.test(t)) return false;
  const v = t.replace(/[()]/g, '').replace(/\s+/g, ' ').trim();
  const digits = v.replace(/\D/g, '').length;
  return digits >= 7 && digits <= 15 && /[0-9]$/.test(v) ? v : false;
}

/** The tel: link for the call button. */
export const telLink = (phone: string) => `tel:${phone.replace(/[^0-9+]/g, '')}`;
