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
              <input id="co-pass" type="password" dir="ltr" minLength={6} required autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
                value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <button className="co-primary co-wide" disabled={busy}>{busy ? 'רגע...' : mode === 'in' ? 'כניסה' : 'יצירת חשבון'}</button>
          </form>
        )}
      </div>
    </div>
  );
}
