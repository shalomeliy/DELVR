import { useState } from 'react';
import { auth, createCompany } from '../api';
import { errorText } from '../invite';

export function CreateCompany({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('');
  const [me, setMe] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr('');
    try { await createCompany(name, me); onDone(); } catch (x) { setErr(errorText(x)); setBusy(false); }
  }

  return (
    <div className="co-auth">
      <div className="co-card">
        <h1>יוצרים את החברה</h1>
        <p className="co-muted" style={{ marginTop: 0 }}>אתה תהיה המנהל שלה. מחירים: מסירה 15 ₪, הדבקה 10 ₪ (אפשר לשנות אחר כך).</p>
        <form onSubmit={submit}>
          {err && <div className="co-msg bad" role="alert">{err}</div>}
          <div className="co-field">
            <label htmlFor="co-company">שם החברה</label>
            <input id="co-company" required placeholder="לדוגמה: ARTPEACE" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="co-field">
            <label htmlFor="co-me">השם שלך</label>
            <input id="co-me" required autoComplete="name" value={me} onChange={(e) => setMe(e.target.value)} />
          </div>
          <button className="co-primary co-wide" disabled={busy}>{busy ? 'רגע...' : 'יצירת החברה'}</button>
        </form>
        <button type="button" className="co-quiet co-wide" style={{ marginTop: 8 }} onClick={() => auth.signOut()}>יציאה</button>
      </div>
    </div>
  );
}
