import { useState } from 'react';
import { auth } from '../api';
import { errorText } from '../invite';

export function Login() {
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [sent, setSent] = useState(false);
  const [show, setShow] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      if (mode === 'in') await auth.signIn(email.trim(), password);
      else if (await auth.signUp(email.trim(), password)) setSent(true);
    } catch (x) { setErr(errorText(x)); } finally { setBusy(false); }
  }

  return (
    <div className="co-auth">
      <div className="co-brand" style={{ marginBottom: 22 }}>
        <div className="co-logo">P</div>
        <div><b>PassIT</b><span className="co-muted co-small">מרכז שליטה למנהל</span></div>
      </div>
      <div className="co-card">
        <h1>{mode === 'in' ? 'כניסה' : 'חשבון מנהל חדש'}</h1>
        <p className="co-muted" style={{ margin: 0 }}>{mode === 'in' ? 'ממשיכים מאיפה שעצרת.' : 'פעם אחת, ואחר כך מזמינים שליחים בקישור.'}</p>
        <div className="co-tabs" role="group" aria-label="כניסה או הרשמה">
          <button type="button" aria-pressed={mode === 'in'} onClick={() => { setMode('in'); setErr(''); setSent(false); }}>כניסה</button>
          <button type="button" aria-pressed={mode === 'up'} onClick={() => { setMode('up'); setErr(''); }}>הרשמה</button>
        </div>
        {sent ? (
          <div className="co-msg ok" role="status">שלחנו אימייל אישור ל-{email}. לוחצים על הקישור שבו וחוזרים לכאן.</div>
        ) : (
          <form onSubmit={submit}>
            {err && <div className="co-msg bad" role="alert">{err}</div>}
            <div className="co-field">
              <label htmlFor="co-email">אימייל</label>
              <input id="co-email" type="email" dir="ltr" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="co-field">
              <label htmlFor="co-pass">סיסמה</label>
              <div className="co-pass">
                <input id="co-pass" type={show ? 'text' : 'password'} dir="ltr" minLength={6} required autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
                  autoCapitalize="off" autoCorrect="off" spellCheck={false} value={password} onChange={(e) => setPassword(e.target.value)} />
                <button type="button" className="co-pass-eye" aria-pressed={show} aria-label={show ? 'הסתר סיסמה' : 'הצג סיסמה'} onClick={() => setShow((v) => !v)}>
                  {show ? (
                    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3l18 18" /><path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" /><path d="M9.9 5.1A10.4 10.4 0 0 1 12 5c6 0 9.5 7 9.5 7a17 17 0 0 1-3.2 4.1M6.6 6.6A17 17 0 0 0 2.5 12S6 19 12 19a9.8 9.8 0 0 0 5.4-1.6" /></svg>
                  ) : (
                    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7z" /><circle cx="12" cy="12" r="3" /></svg>
                  )}
                </button>
              </div>
            </div>
            <button className="co-primary co-wide" disabled={busy}>{busy ? 'רגע...' : mode === 'in' ? 'כניסה' : 'יצירת חשבון'}</button>
          </form>
        )}
      </div>
    </div>
  );
}
