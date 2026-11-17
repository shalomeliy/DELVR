import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { googleMapsUrl, wazeUrl } from '../../services/navigation';
import { inviteToken } from '../invite';
import { MissingKeys } from '../Missing';
import { backoffMs, createOutbox, localStore, type Mark, type Outcome } from '../outbox';
import { hasSupabase } from '../supabase';
import { acceptInvite, failReasons, myId, myMembership, nextRoute, routeStops, sendMark, watch, type CRoute, type Membership, type Reason } from './api';
import { courierError, currentStop, greeting, israelDay, progress, withPending, type CStop } from './route';
import '../theme.css';

type State = { k: 'loading' } | { k: 'error'; msg: string } | { k: 'no-link' } | { k: 'ready'; me: string; member: Membership };

const OUTCOME: Record<Exclude<Outcome, 'todo'>, string> = { delivered: 'נמסר', pasted: 'הדבקה', failed: 'נכשל' };
const time = (iso: string) => new Date(iso).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' });
const dayLabel = (day: string) => (day === israelDay() ? 'היום' : day === israelDay(-1) ? 'אתמול' : new Date(`${day}T12:00:00`).toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'numeric' }));

/** Where the phone is, if it can tell within a few seconds. A mark never waits longer than that for it. */
const here = () => new Promise<{ lat: number; lng: number } | null>((res) => {
  if (!navigator.geolocation) return res(null);
  navigator.geolocation.getCurrentPosition((p) => res({ lat: p.coords.latitude, lng: p.coords.longitude }), () => res(null),
    { enableHighAccuracy: true, timeout: 4000, maximumAge: 60_000 });
});

export default function CourierApp() {
  const [s, setS] = useState<State>({ k: 'loading' });

  useEffect(() => {
    document.title = 'PassIT · המסלול שלי'; document.body.style.background = '#0A0E17';
    if (!hasSupabase()) return;
    (async () => {
      try {
        const token = inviteToken(location.hash);
        const me = await myId(!!token);
        if (!me) return setS({ k: 'no-link' });
        if (token) {
          await acceptInvite(token);
          // The token is spent; keep it out of the address bar, bookmarks and screenshots.
          history.replaceState(null, '', location.pathname);
        }
        const member = await myMembership(me);
        setS(member ? { k: 'ready', me, member } : { k: 'no-link' });
      } catch (x) { setS({ k: 'error', msg: courierError(x) }); }
    })();
  }, []);

  return (
    <main className="co co-courier" dir="rtl" lang="he">
      <div className="co-wrap co-phone">
        <MissingKeys />
        {!hasSupabase() ? null
          : s.k === 'loading' ? <p className="co-muted">מתחבר...</p>
          : s.k === 'error' ? <div className="co-card"><h2>משהו לא עבד</h2><p className="co-muted">{s.msg}</p><button type="button" onClick={() => location.reload()}>נסה שוב</button></div>
          : s.k === 'no-link' ? <div className="co-card"><h2>צריך קישור מהמנהל</h2><p className="co-muted" style={{ marginBottom: 0 }}>פותחים את קישור ההזמנה שהמנהל שלח בוואטסאפ, בטלפון הזה. אם מחקת את נתוני הדפדפן, בקש קישור חדש.</p></div>
          : <MyRoute me={s.me} member={s.member} />}
      </div>
    </main>
  );
}

function MyRoute({ me, member }: { me: string; member: Membership }) {
  const [route, setRoute] = useState<CRoute | null | undefined>(undefined);
  const [stops, setStops] = useState<CStop[]>([]);
  const [pending, setPending] = useState<Mark[]>([]);
  const [reasons, setReasons] = useState<Reason[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [failing, setFailing] = useState(false);
  const [toast, setToast] = useState('');
  const [rejected, setRejected] = useState('');
  const [online, setOnline] = useState(navigator.onLine);
  const version = useRef<number | null>(null);

  const store = useMemo(() => localStore(`passit_outbox_${me}`), [me]);
  const outbox = useMemo(() => createOutbox({
    store, send: sendMark,
    onRejected: (_m, err) => setRejected(courierError(err)),
  }), [store]);
  const syncPending = useCallback(async () => setPending(await store.load()), [store]);

  const load = useCallback(async () => {
    try {
      const r = await nextRoute(me, israelDay(), israelDay(-1));
      if (r && version.current !== null && r.version > version.current) setToast('המסלול עודכן');
      version.current = r?.version ?? null;
      setRoute(r);
      setStops(r ? await routeStops(r.id) : []);
      setOnline(true);
    } catch { setOnline(false); }
  }, [me]);

  useEffect(() => { void load(); void syncPending(); failReasons(member.companyId).then(setReasons).catch(() => {}); }, [load, syncPending, member.companyId]);
  useEffect(() => watch(me, route?.id ?? null, () => { void load(); }), [me, route?.id, load]);

  // Send what is queued now, again when the signal returns, and on a growing timer while it does not.
  const attempt = useRef(0);
  const timer = useRef<number | undefined>(undefined);
  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    const r = await outbox.flush();
    await syncPending();
    if (r.left > 0) { setOnline(false); timer.current = window.setTimeout(flush, backoffMs(attempt.current++)); }
    else { attempt.current = 0; if (r.sent) { setOnline(true); void load(); } }
  }, [outbox, syncPending, load]);
  useEffect(() => {
    void flush();
    const on = () => { attempt.current = 0; void flush(); };
    addEventListener('online', on); addEventListener('focus', on);
    return () => { removeEventListener('online', on); removeEventListener('focus', on); clearTimeout(timer.current); };
  }, [flush]);

  const shown = withPending(stops, pending);
  const p = progress(shown, member.prices);
  const now = shown.find((x) => x.id === picked && x.delivery === 'todo') ?? currentStop(shown);
  const upcoming = shown.filter((x) => x.delivery === 'todo' && x.id !== now?.id);
  const done = shown.filter((x) => x.delivery !== 'todo').sort((a, b) => (b.handled_at ?? '').localeCompare(a.handled_at ?? ''));
  const nOf = (x: CStop) => shown.indexOf(x) + 1;

  async function mark(stop: CStop, outcome: Outcome, code: string | null = null, reason: string | null = null) {
    setFailing(false); setPicked(null); setRejected('');
    const pos = outcome === 'todo' ? null : await here();
    await outbox.enqueue({ stopId: stop.id, outcome, code, reason, lat: pos?.lat ?? null, lng: pos?.lng ?? null });
    await syncPending();
    void flush();
  }

  if (route === undefined) return <p className="co-muted">טוען את המסלול...</p>;

  return (
    <>
      <header className="co-head">
        <div><span className="co-muted co-small">{greeting()}, {member.name.split(' ')[0]}</span><h1 style={{ fontSize: 26, fontWeight: 800 }}>המסלול שלי</h1></div>
        {p.earned !== null && <div className="co-earn"><b>{p.earned} ₪</b><span className="co-muted co-small">{route && route.day !== israelDay() ? 'במסלול' : 'הרווחת היום'}</span></div>}
      </header>

      {!route ? (
        <div className="co-card co-empty"><b>אין מסלול כרגע</b><br />כשהמנהל ישלח לך מסלול הוא יופיע כאן לבד. {member.company}</div>
      ) : (
        <>
          <div aria-label="התקדמות">
            <div className="co-segs">{shown.map((x) => <span key={x.id} className={`co-seg ${x.delivery}`} />)}</div>
            <span className="co-muted co-small">{p.done} מתוך {p.total} · {dayLabel(route.day)}{p.failed ? ` · ${p.failed} נכשלו` : ''}</span>
          </div>

          {toast && <div className="co-toast" role="status"><span className="co-dot live" />{toast}<button type="button" className="co-quiet" onClick={() => setToast('')}>הבנתי</button></div>}
          {rejected && <div className="co-msg bad" role="alert">{rejected}</div>}

          {now ? (
            <section className="co-now" aria-label="העצירה הנוכחית">
              <div className="co-now-head">
                <div style={{ minWidth: 0 }}>
                  <span className="co-live co-small">עצירה {nOf(now)} · עכשיו</span>
                  <h2 className="co-now-addr">{now.address ?? now.input}</h2>
                  {(now.due_at || now.note) && <span className="co-small">{now.due_at && <span className="co-live">בול בזמן {time(now.due_at)}</span>}{now.due_at && now.note ? ' · ' : ''}{now.note}</span>}
                </div>
                {now.lat != null && now.lng != null && (
                  <a className="co-nav-btn" href={wazeUrl({ lat: now.lat, lng: now.lng }, now.address ?? now.input)} aria-label="נווט ב-Waze" target="_blank" rel="noopener noreferrer">
                    <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11l18-8-8 18-2-8-8-2z" /></svg>
                  </a>
                )}
              </div>
              {now.lat != null && now.lng != null && <a className="co-small co-muted" href={googleMapsUrl({ lat: now.lat, lng: now.lng })} target="_blank" rel="noopener noreferrer">או ב-Google Maps</a>}
              {failing ? (
                <FailPicker reasons={reasons} onCancel={() => setFailing(false)} onPick={(code, text) => mark(now, 'failed', code, text)} />
              ) : (
                <div className="co-marks">
                  <button type="button" className="co-mark delivered" onClick={() => mark(now, 'delivered')}>נמסר</button>
                  <button type="button" className="co-mark pasted" onClick={() => mark(now, 'pasted')}>הדבקה</button>
                  <button type="button" className="co-mark failed" onClick={() => setFailing(true)}>נכשל</button>
                </div>
              )}
            </section>
          ) : (
            <div className="co-card co-empty" style={{ borderStyle: 'solid' }}><b className="co-live" style={{ fontSize: 20 }}>סיימת את המסלול</b><br />{p.delivered} נמסרו · {p.pasted} הדבקות · {p.failed} נכשלו</div>
          )}

          {upcoming.length > 0 && (
            <section className="co-card" aria-label="הבאות בתור">
              <span className="co-label">הבאות בתור · לחיצה הופכת לנוכחית</span>
              <ul className="co-seq">
                {upcoming.map((x) => (
                  <li key={x.id}><button type="button" className="co-seq-btn" onClick={() => { setPicked(x.id); setFailing(false); scrollTo({ top: 0, behavior: 'smooth' }); }}>
                    <span className="co-seq-n">{nOf(x)}</span>
                    <span className="co-person-main"><b>{x.address ?? x.input}</b>{(x.due_at || x.note) && <span className="co-small co-muted">{x.due_at ? `בול בזמן ${time(x.due_at)}` : ''}{x.due_at && x.note ? ' · ' : ''}{x.note ?? ''}</span>}</span>
                  </button></li>
                ))}
              </ul>
            </section>
          )}

          {done.length > 0 && (
            <details className="co-card">
              <summary className="co-label" style={{ cursor: 'pointer', margin: 0 }}>סומנו ({done.length})</summary>
              <ul className="co-seq" style={{ marginTop: 10 }}>
                {done.map((x) => (
                  <li key={x.id}>
                    <span className={`co-seq-n ${x.delivery}`}>{nOf(x)}</span>
                    <span className="co-person-main"><b>{x.address ?? x.input}</b>
                      <span className="co-small co-muted">{OUTCOME[x.delivery as Exclude<Outcome, 'todo'>]}{x.handled_at ? ` · ${time(x.handled_at)}` : ''}{x.fail_code ? ` · ${reasons.find((r) => r.code === x.fail_code)?.label ?? ''}${x.fail_reason ? `: ${x.fail_reason}` : ''}` : ''}</span>
                    </span>
                    <button type="button" className="co-quiet" onClick={() => mark(x, 'todo')}>בטל</button>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}

      <div className="co-foot co-small" role="status">
        <span className={`co-dot ${pending.length ? 'warn' : online ? 'live' : 'bad'}`} />
        {pending.length ? `ממתינים לשליחה: ${pending.length}. יישלחו לבד כשתהיה קליטה` : online ? 'מחובר · כל הסימונים נשלחו' : 'אין חיבור לשרת'}
      </div>
    </>
  );
}

function FailPicker({ reasons, onPick, onCancel }: { reasons: Reason[]; onPick: (code: string, text: string | null) => void; onCancel: () => void }) {
  const [code, setCode] = useState<string | null>(null);
  const [text, setText] = useState('');
  const r = reasons.find((x) => x.code === code);
  const ok = !!r && (!r.needs_text || text.trim().length > 0);
  return (
    <div className="co-fail">
      <span className="co-label">למה אי אפשר למסור או להדביק?</span>
      <div className="co-reasons" role="radiogroup" aria-label="סיבה">
        {reasons.map((x) => (
          <button key={x.code} type="button" role="radio" aria-checked={code === x.code} className="co-reason" onClick={() => setCode(x.code)}>{x.label}</button>
        ))}
      </div>
      <label htmlFor="co-fail-note" style={{ marginTop: 10 }}>הערה{r?.needs_text ? ' (חובה)' : ' (לא חובה)'}</label>
      <input id="co-fail-note" value={text} onChange={(e) => setText(e.target.value)} placeholder={r?.needs_text ? 'מה קרה?' : ''} />
      <div className="co-row" style={{ marginTop: 12 }}>
        <button type="button" onClick={onCancel}>ביטול</button>
        <button type="button" className="co-mark failed" disabled={!ok} onClick={() => code && onPick(code, text.trim() || null)}>שמור נכשל</button>
      </div>
    </div>
  );
}
