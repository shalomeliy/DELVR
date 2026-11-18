import { describe, expect, it } from 'vitest';
import { errorText, expiresIn, initials, inviteLink, inviteMessage, inviteState, inviteToken, whatsappLink } from '../src/company/invite';

const T = '0123456789abcdef0123456789abcdef';
const now = Date.parse('2026-11-17T12:00:00Z');
const at = (h: number) => ({ expiresAt: new Date(now + h * 3_600_000).toISOString() });

describe('invite links', () => {
  it('puts the token after #, never in the query', () => {
    expect(inviteLink(T, 'https://passit.app')).toBe(`https://passit.app/c#invite=${T}`);
  });
  it('reads the token back from the hash, and only a real one', () => {
    expect(inviteToken(`#invite=${T}`)).toBe(T);
    expect(inviteToken(`#x=1&invite=${T}`)).toBe(T);
    expect(inviteToken('#invite=abc')).toBeNull();
    expect(inviteToken('')).toBeNull();
  });
  it('WhatsApp text has the name, company and link, encoded', () => {
    const url = whatsappLink('דני', 'ARTPEACE', inviteLink(T, 'https://passit.app'));
    expect(url.startsWith('https://wa.me/?text=')).toBe(true);
    const text = decodeURIComponent(url.split('text=')[1]);
    expect(text).toContain('*דני, ברוך הבא לצוות השליחים של ARTPEACE*'); expect(text).toContain(`/c#invite=${T}`);
    expect(text).toContain('*הדבקה*: לא בבית');
  });
  it('a new-phone link greets by first name, without the note in brackets', () => {
    const text = inviteMessage('יוסי כהן (טלפון חדש)', 'ARTPEACE', 'L', true);
    expect(text.split('\n')[0]).toBe('*יוסי, הנה קישור חדש ל-PassIT של ARTPEACE*');
  });
  it('expiry in words', () => {
    expect([at(24 * 6 + 1), at(30), at(5), at(1.5), at(0.5), at(-1)].map((i) => expiresIn(i, now)))
      .toEqual(['עוד 6 ימים', 'עוד יום', 'עוד 5 שעות', 'עוד שעה', 'פחות משעה', 'פג תוקף']);
    expect(inviteState(at(-1), now)).toBe('expired');
    expect(inviteState(at(1), now)).toBe('open');
  });
  it('initials from a Hebrew name', () => {
    expect(initials('יוסי כהן')).toBe('יכ');
    expect(initials('  דני ')).toBe('ד');
    expect(initials('')).toBe('?');
  });
  it('Supabase errors in Hebrew, unknown ones as they are', () => {
    expect(errorText(new Error('Invalid login credentials'))).toBe('אימייל או סיסמה לא נכונים');
    expect(errorText(new TypeError('Failed to fetch'))).toBe('אין חיבור לשרת. בדוק את האינטרנט ונסה שוב');
    expect(errorText('something odd')).toBe('something odd');
  });
});
