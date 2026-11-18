import { useCallback, useEffect, useState } from 'react';
import { cancelInvite, createInvite, listCouriers, listOpenInvites, setCourierActive, updateCourier, type Company, type Courier, type Invite } from '../api';
import { telLink } from '../people';
import { errorText, expiresIn, initials, inviteLink, inviteMessage, inviteState, whatsappLink } from '../invite';

/** Who the new link is for: a new courier, or an existing one whose phone lost its sign-in. */
type Draft = { name: string; replaces: Courier | null };

export function Couriers({ company }: { company: Company }) {
  const [couriers, setCouriers] = useState<Courier[] | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [err, setErr] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [shown, setShown] = useState<Invite | null>(null);
  const [editing, setEditing] = useState<Courier | null>(null);

  const load = useCallback(async () => {
    try {
      const [c, i] = await Promise.all([listCouriers(company.id), listOpenInvites(company.id)]);
      setCouriers(c); setInvites(i); setErr('');
    } catch (x) { setErr(errorText(x)); }
  }, [company.id]);
  useEffect(() => { void load(); }, [load]);

  async function act(fn: () => Promise<unknown>) {
    try { await fn(); await load(); } catch (x) { setErr(errorText(x)); }
  }

  const active = couriers?.filter((c) => c.active) ?? [];
  const off = couriers?.filter((c) => !c.active) ?? [];
  const nameOf = (id: string | null) => couriers?.find((c) => c.userId === id)?.name;

  return (
    <>
      {err && <div className="co-msg bad" role="alert">{err}</div>}
      <div className="co-grid">
        <section className="co-card" aria-labelledby="co-couriers">
          <div className="co-card-head">
            <h2 id="co-couriers">שליחים <span className="co-muted co-small">{couriers ? active.length : ''}</span></h2>
            <button type="button" className="co-ghost co-desk" onClick={() => setDraft({ name: '', replaces: null })}>+ הזמן שליח</button>
          </div>
          {!couriers ? <p className="co-muted">טוען...</p> : active.length === 0 ? (
            <div className="co-empty">עוד אין שליחים. מזמינים שליח, שולחים לו את הקישור בוואטסאפ, והוא מופיע כאן כשהוא פותח אותו.</div>
          ) : (
            <ul className="co-list">
              {active.map((c) => (
                <li key={c.userId} className="co-person">
                  <span className="co-ring" style={{ background: 'var(--line2)' }} aria-hidden="true"><span>{initials(c.name)}</span></span>
                  <span className="co-person-main"><b className="co-name-row">{c.name}<CallButton courier={c} /></b><span className="co-pill"><span className="co-dot live" />פעיל{c.phone ? ` · ${c.phone}` : ''}</span></span>
                  <span className="co-person-acts">
                    <button type="button" onClick={() => setEditing(c)}>עריכה</button>
                    <button type="button" onClick={() => setDraft({ name: c.name, replaces: c })} title="אם השליח החליף טלפון או מחק את נתוני הדפדפן">קישור לטלפון חדש</button>
                    <button type="button" className="co-quiet co-danger" onClick={() => act(() => setCourierActive(company.id, c.userId, false))}>השבת</button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {off.length > 0 && (
            <details style={{ marginTop: 14 }}>
              <summary className="co-muted" style={{ cursor: 'pointer' }}>לא פעילים ({off.length})</summary>
              <ul className="co-list" style={{ marginTop: 10 }}>
                {off.map((c) => (
                  <li key={c.userId} className="co-person" style={{ opacity: .75 }}>
                    <span className="co-ring" style={{ background: 'var(--todo)' }} aria-hidden="true"><span>{initials(c.name)}</span></span>
                    <span className="co-person-main"><b>{c.name}</b><span className="co-pill"><span className="co-dot" />לא פעיל, ההיסטוריה נשמרת</span></span>
                    <span className="co-person-acts"><button type="button" onClick={() => act(() => setCourierActive(company.id, c.userId, true))}>החזר</button></span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>

        <section className="co-card" aria-labelledby="co-invites">
          <div className="co-card-head"><h2 id="co-invites">קישורים שעוד לא נפתחו</h2></div>
          {invites.length === 0 ? <p className="co-muted" style={{ margin: 0 }}>אין קישורים פתוחים.</p> : (
            <ul className="co-list">
              {invites.map((i) => {
                const expired = inviteState(i) === 'expired';
                return (
                  <li key={i.token} className="co-person">
                    <span className="co-person-main">
                      <b>{i.name}</b>
                      <span className="co-pill"><span className={`co-dot ${expired ? 'bad' : 'warn'}`} />
                        {i.replaces ? `טלפון חדש במקום ${nameOf(i.replaces) ?? 'שליח קודם'} · ` : ''}{expiresIn(i)}</span>
                    </span>
                    <span className="co-person-acts">
                      {!expired && <button type="button" onClick={() => setShown(i)}>הצג קישור</button>}
                      <button type="button" className="co-quiet co-danger" onClick={() => act(() => cancelInvite(i.token))}>{expired ? 'מחק' : 'בטל'}</button>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="co-muted co-small" style={{ marginBottom: 0 }}>קישור עובד בטלפון אחד בלבד, ל-7 ימים. אחרי שהשליח פותח אותו הוא עובר לרשימת השליחים.</p>
        </section>
      </div>

      <div className="co-dock"><button type="button" className="co-primary" onClick={() => setDraft({ name: '', replaces: null })}>+ הזמן שליח</button></div>

      {draft && (
        <InviteSheet company={company} draft={draft} onClose={() => setDraft(null)}
          onCreated={async (inv) => { setDraft(null); setShown(inv); await load(); }} />
      )}
      {shown && <LinkSheet company={company} invite={shown} onClose={() => setShown(null)} />}
      {editing && <EditSheet company={company} courier={editing} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await load(); }} />}
    </>
  );
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    addEventListener('keydown', k); return () => removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="co-scrim" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="co-sheet" role="dialog" aria-modal="true" aria-label={title}>{children}</div>
    </div>
  );
}

function InviteSheet({ company, draft, onClose, onCreated }: { company: Company; draft: Draft; onClose: () => void; onCreated: (i: Invite) => void }) {
  const [name, setName] = useState(draft.replaces ? `${draft.name} (טלפון חדש)` : draft.name);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr('');
    try {
      const token = await createInvite(company.id, name.trim(), draft.replaces?.userId ?? null);
      onCreated({ token, name: name.trim(), replaces: draft.replaces?.userId ?? null, expiresAt: new Date(Date.now() + 7 * 864e5).toISOString() });
    } catch (x) { setErr(errorText(x)); setBusy(false); }
  }
  return (
    <Sheet title="הזמנת שליח" onClose={onClose}>
      <h2>{draft.replaces ? `קישור לטלפון חדש של ${draft.replaces.name}` : 'הזמנת שליח'}</h2>
      <p className="co-muted" style={{ marginTop: 0 }}>
        {draft.replaces ? 'כשהוא יפתח את הקישור, המסלולים מהיום והלאה יעברו לטלפון החדש. ההיסטוריה והתשלומים נשארים.' : 'יוצרים קישור אישי ושולחים לשליח. בלי סיסמה ובלי אפליקציה להתקין.'}
      </p>
      <form onSubmit={submit}>
        {err && <div className="co-msg bad" role="alert">{err}</div>}
        <div className="co-field">
          <label htmlFor="co-inv-name">שם השליח</label>
          <input id="co-inv-name" required autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="co-row">
          <button className="co-primary" disabled={busy || !name.trim()}>{busy ? 'רגע...' : 'צור קישור'}</button>
          <button type="button" onClick={onClose}>ביטול</button>
        </div>
      </form>
    </Sheet>
  );
}

function LinkSheet({ company, invite, onClose }: { company: Company; invite: Invite; onClose: () => void }) {
  const link = inviteLink(invite.token);
  const [copied, setCopied] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(inviteMessage(invite.name, company.name, link, !!invite.replaces)); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* the link is on screen to copy by hand */ }
  }
  return (
    <Sheet title="קישור הזמנה" onClose={onClose}>
      <h2>הקישור של {invite.name}</h2>
      <p className="co-muted" style={{ margin: 0 }}>פותחים אותו פעם אחת בטלפון שאיתו יוצאים לחלוקה. {expiresIn(invite)}.</p>
      <div className="co-linkbox">{link}</div>
      <div className="co-row">
        <a className="co-btn co-primary" href={whatsappLink(invite.name, company.name, link, !!invite.replaces)} target="_blank" rel="noopener noreferrer">שלח בוואטסאפ</a>
        <button type="button" onClick={copy} aria-live="polite">{copied ? 'הועתק' : 'העתק הודעה'}</button>
      </div>
      <button type="button" className="co-quiet co-wide" style={{ marginTop: 10 }} onClick={onClose}>סגור</button>
    </Sheet>
  );
}

/** Calls the courier. Shown only when the admin saved a phone number for them. */
export function CallButton({ courier }: { courier: Courier }) {
  if (!courier.phone) return null;
  return (
    <a className="co-call" href={telLink(courier.phone)} aria-label={`חייג ל${courier.name}`} title={`חייג ל${courier.name}`} onClick={(e) => e.stopPropagation()}>
      <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" /></svg>
    </a>
  );
}

function EditSheet({ company, courier, onClose, onSaved }: { company: Company; courier: Courier; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(courier.name);
  const [phone, setPhone] = useState(courier.phone ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr('');
    try { await updateCourier(company.id, courier.userId, name, phone); onSaved(); }
    catch (x) {
      const msg = errorText(x);
      setErr(/phone/.test(String((x as Error)?.message)) ? 'צריך להריץ קודם את עדכון מסד הנתונים 0004 (מספר טלפון)' : msg);
    } finally { setBusy(false); }
  }
  return (
    <Sheet title="עריכת שליח" onClose={onClose}>
      <form onSubmit={save}>
        <h2 style={{ marginTop: 0 }}>עריכת שליח</h2>
        <label htmlFor="co-edit-name">שם</label>
        <input id="co-edit-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" required />
        <label htmlFor="co-edit-phone" style={{ marginTop: 12 }}>טלפון (לכפתור החיוג)</label>
        <input id="co-edit-phone" type="tel" inputMode="tel" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="050-1234567" autoComplete="off" />
        {err && <div className="co-msg bad" role="alert" style={{ marginTop: 12 }}>{err}</div>}
        <div className="co-row" style={{ marginTop: 16 }}>
          <button type="button" onClick={onClose}>ביטול</button>
          <button type="submit" className="co-primary" disabled={busy || !name.trim()}>{busy ? 'שומר...' : 'שמור'}</button>
        </div>
      </form>
    </Sheet>
  );
}
