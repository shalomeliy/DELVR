import { useCallback, useEffect, useMemo, useState } from 'react';
import { canOptimize, emptyPlan, fmtDuration, fmtKm, orderedStops, removeStop, setDue, updateStop } from '../../domain/plan';
import { MAX_STOPS } from '../../domain/types';
import { hasMapsKey } from '../../services/maps';
import { loadDraft, saveDraft } from '../../store/db';
import { AddStops } from '../../ui/AddStops';
import { FixList } from '../../ui/FixList';
import { MapView } from '../../ui/MapView';
import { StartPoint } from '../../ui/StartPoint';
import { StopList } from '../../ui/StopList';
import { usePlanEditor, type PlanStorage } from '../../ui/usePlanEditor';
import { getRoute, listCouriers, sendRoute, watchRoute, type Company, type Courier, type ServerRoute } from '../api';
import { errorText } from '../invite';
import { cannotSend, dayIso, departFor, toSendPayload } from '../send';
import { MapCard } from '../MapCard';
import { CallButton } from './Couriers';
import { LivePanel, lastMark } from './Live';
import { prefs, type Vehicle } from '../prefs';
import { israelTime } from '../time';
import { dayTitle } from '../calendar';

const clock = (iso: string) => new Date(iso).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' });

/** Which courier and day the planner shows. Kept by AdminApp, so the calendar can open a day here. */
export interface PlanTarget { courierId: string | null; day: string }

export function Planner({ company, target, onTarget, onCalendar, onInvite }: {
  company: Company; target: PlanTarget; onTarget: (t: PlanTarget) => void; onCalendar: () => void; onInvite: () => void;
}) {
  const [couriers, setCouriers] = useState<Courier[] | null>(null);
  const [loadErr, setLoadErr] = useState('');
  const vehicle: Vehicle = prefs.vehicle(company.id);
  const { day } = target;

  useEffect(() => {
    listCouriers(company.id).then((all) => setCouriers(all.filter((c) => c.active))).catch((x) => setLoadErr(errorText(x)));
  }, [company.id]);

  const courier = couriers?.find((c) => c.userId === target.courierId) ?? couriers?.[0] ?? null;

  if (loadErr) return <div className="co-msg bad" role="alert">{loadErr}</div>;
  if (!couriers) return <p className="co-muted">טוען...</p>;
  if (!couriers.length) return (
    <div className="co-card co-empty">
      <p style={{ marginTop: 0 }}>כדי לבנות מסלול צריך קודם שליח אחד לפחות.</p>
      <button type="button" className="co-primary" onClick={onInvite}>+ הזמן שליח</button>
    </div>
  );

  return (
    <>
      <section className="co-card co-pickers" aria-label="למי ולאיזה יום">
        <div className="co-pick-row">
          <div>
            <label className="co-label" htmlFor="co-courier">שליח</label>
            <div className="co-name-row co-select-row">
              <select id="co-courier" className="co-select" value={courier?.userId ?? ''} onChange={(e) => onTarget({ courierId: e.target.value, day })}>
                {couriers.map((c) => <option key={c.userId} value={c.userId}>{c.name}</option>)}
              </select>
              {courier && <CallButton courier={courier} />}
            </div>
          </div>
          <div>
            <span className="co-label">יום</span>
            <button type="button" className="co-daybtn" onClick={onCalendar}>
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="3" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
              <b>{day === dayIso(0) ? 'היום' : day === dayIso(1) ? 'מחר' : dayTitle(day)}</b>{day === dayIso(0) || day === dayIso(1) ? <span className="co-muted">{Number(day.slice(8))}.{Number(day.slice(5, 7))}</span> : null}
              <span className="co-muted co-small">החלף ביומן</span>
            </button>
          </div>
        </div>
      </section>
      {courier && <Editor key={`${courier.userId}:${day}`} company={company} courier={courier} day={day} vehicle={vehicle} />}
    </>
  );
}

function Editor({ company, courier, day, vehicle }: { company: Company; courier: Courier; day: string; vehicle: Vehicle }) {
  const key = `${company.id}:${courier.userId}:${day}`;
  const storage = useMemo<PlanStorage>(() => ({ load: () => loadDraft(key), save: (p) => saveDraft(key, p), empty: emptyPlan }), [key]);
  const ed = usePlanEditor(storage, () => ({ vehicle, departAt: departFor(day), dueAt: (hhmm) => israelTime(day, hhmm) }));
  const { plan, setPlan } = ed;
  const [server, setServer] = useState<ServerRoute | null | undefined>(undefined);
  const [sending, setSending] = useState(false);
  const [sendErr, setSendErr] = useState('');
  const [sent, setSent] = useState('');

  const [view, setView] = useState<'live' | 'draft' | null>(null);
  const [seenAt, setSeenAt] = useState<number | null>(null);

  const refresh = useCallback(() => {
    getRoute(company.id, courier.userId, day).then((r) => { setServer(r); setSeenAt(Date.now()); }).catch(() => setServer((x) => x ?? null));
  }, [company.id, courier.userId, day]);
  useEffect(refresh, [refresh]);
  // Marks arrive by realtime; a slow poll covers a dropped connection.
  useEffect(() => {
    if (!server?.id) return;
    const stop = watchRoute(server.id, refresh);
    const t = setInterval(refresh, 15_000);
    return () => { stop(); clearInterval(t); };
  }, [server?.id, refresh]);

  if (!plan) return <p className="co-muted">טוען...</p>;

  const hasLive = !!server && server.status !== 'draft' && server.list.length > 0;
  const mode = view ?? (hasLive ? 'live' : 'draft');

  const gate = canOptimize(plan);
  const blocked = cannotSend(plan);
  const started = !!server && server.marked > 0;
  const needsFix = plan.stops.filter((s) => s.verify === 'needs_fix');
  const ordered = plan.optimized ? orderedStops(plan) : [];
  const deadline = (id: string) => plan.optimized?.deadlines?.find((d) => d.id === id);

  async function send() {
    if (!plan) return;
    setSending(true); setSendErr(''); setSent('');
    try {
      const r = await sendRoute(company.id, courier.userId, day, vehicle, toSendPayload(plan, day, departFor(day)));
      setSent(`נשלח ל${courier.name} · גרסה ${r.version}`);
      refresh();
    } catch (x) { setSendErr(errorText(x)); } finally { setSending(false); }
  }

  const sendLabel = sending ? 'שולח...' : server && server.version > 0 && server.status !== 'draft' ? `שלח שוב ל${courier.name} (מחליף גרסה ${server.version})` : `שלח ל${courier.name}`;
  const main = !plan.optimized
    ? <button type="button" className="co-primary" disabled={!gate.ok || ed.optimizing} onClick={ed.optimize}>{ed.optimizing ? 'מסדר את המסלול...' : `סדר מסלול (${plan.stops.length})`}</button>
    : <button type="button" className="co-primary" disabled={!!blocked || sending || started} onClick={send}>{sendLabel}</button>;
  const hint = !plan.optimized ? (plan.stops.length ? gate.why ?? ed.sortError : 'מוסיפים כתובות למטה, בהקלדה או בהקראה') : started ? 'השליח כבר סימן עצירות. שינוי באמצע המסלול יגיע בלוח הבקרה' : blocked ?? sendErr;

  return (
    <>
      <div className="co-status" role="status">
        {server === undefined ? <span className="co-muted">בודק מה כבר נשלח...</span>
          : !server || server.status === 'draft' ? <span className="co-pill"><span className="co-dot" />עוד לא נשלח מסלול ל{courier.name} ל{day === dayIso(0) ? 'היום' : 'מחר'}</span>
          : <span className="co-pill"><span className={`co-dot ${started ? 'warn' : 'live'}`} />
              {started ? `בדרך: ${server.marked} מתוך ${server.stops} סומנו` : `נשלח ${server.sentAt ? clock(server.sentAt) : ''} · גרסה ${server.version} · ${server.stops} עצירות`}</span>}
      </div>
      {!hasMapsKey() && <div className="co-msg bad">חסר מפתח Google (VITE_GOOGLE_MAPS_KEY), אז אין אימות כתובות וסידור.</div>}
      {ed.error && <div className="co-msg bad" role="alert">{ed.error}</div>}
      {ed.notice && <div className="co-msg ok">{ed.notice}</div>}
      {sent && <div className="co-msg ok" role="status">{sent}. הוא יראה את המסלול כשיפתח את הקישור שלו.</div>}

      {hasLive && (
        <div className="co-tabs co-tabs-sm" role="group" aria-label="תצוגה" style={{ maxWidth: 420 }}>
          <button type="button" aria-pressed={mode === 'live'} onClick={() => setView('live')}>מעקב חי</button>
          <button type="button" aria-pressed={mode === 'draft'} onClick={() => setView('draft')}>עריכה ושליחה מחדש</button>
        </div>
      )}
      <div className="co-grid co-plan">
        {mode === 'live' && server ? <LivePanel list={server.list} seenAt={seenAt} /> : <div className="co-solo">
          {plan.optimized ? (
            <section className="co-card">
              <div className="co-card-head">
                <h2>המסלול המסודר</h2>
                <span className="co-muted co-small">{ordered.length} עצירות · {fmtDuration(plan.optimized.totalDurationSec)} · {fmtKm(plan.optimized.totalDistanceM)}</span>
              </div>
              {plan.optimized.stale && <div className="co-msg bad">שינית משהו אחרי הסידור. סדר מחדש לפני השליחה.</div>}
              <ol className="co-seq">
                {ordered.map((s, i) => {
                  const d = deadline(s.id);
                  return (
                    <li key={s.id}>
                      <span className="co-seq-n">{i + 1}</span>
                      <span className="co-person-main"><b>{s.address ?? s.input}</b>
                        {s.dueAt && <span className={`co-small ${d && d.lateSec > 0 ? 'co-danger' : 'co-live'}`}>בול בזמן {s.dueAt}{d && d.lateSec > 0 ? ` · איחור של ${Math.round(d.lateSec / 60)} דק'` : ''}</span>}
                      </span>
                      <button type="button" className="co-quiet" aria-label={`הסר ${s.address ?? s.input}`} onClick={() => setPlan((p) => removeStop(p, s.id))}>✕</button>
                    </li>
                  );
                })}
              </ol>
              <div className="co-row" style={{ marginTop: 14 }}>
                <button type="button" onClick={() => setPlan((p) => ({ ...p, optimized: undefined }))}>ערוך כתובות</button>
                <button type="button" className="co-ghost" disabled={ed.optimizing} onClick={ed.optimize}>{ed.optimizing ? 'מסדר...' : 'סדר מחדש'}</button>
              </div>
            </section>
          ) : (
            <>
              <StartPoint start={plan.start} end={plan.end} onVerify={ed.verifyPlace} onHere={ed.useHere}
                onClearEnd={() => setPlan((p) => ({ ...p, end: null, optimized: undefined }))} />
              <FixList stops={needsFix} onRetry={ed.onRetry} onAccept={ed.onAccept} onRemove={(id) => setPlan((p) => removeStop(p, id))} />
              <StopList stops={plan.stops} onRemove={(id) => setPlan((p) => removeStop(p, id))}
                onOrder={(id, order) => setPlan((p) => updateStop(p, id, { order }))}
                onDue={(id, due) => setPlan((p) => setDue(p, id, due))} />
            </>
          )}
          {!plan.optimized && <AddStops count={plan.stops.length} max={MAX_STOPS} onAdd={ed.onAdd} />}
        </div>}

        <aside className="co-side">
          <MapCard where="admin">
            {mode === 'live' && server ? (
              <MapView dark start={server.start?.lat != null && server.start.lng != null ? { lat: server.start.lat, lng: server.start.lng } : undefined}
                points={server.list.filter((x) => x.lat != null && x.lng != null).map((x) => ({ lat: x.lat!, lng: x.lng!, label: String(x.seq), status: x.delivery }))}
                polyline={server.polyline ?? undefined} here={lastMark(server.list)} />
            ) : (
              <MapView dark start={plan.start.location}
                points={(plan.optimized ? ordered : plan.stops).filter((s) => s.location).map((s, i) => ({ ...s.location!, label: String(i + 1), status: 'todo' }))}
                polyline={plan.optimized && !plan.optimized.stale ? plan.optimized.polyline : undefined} />
            )}
          </MapCard>
          {mode === 'draft' && <div className="co-desk co-sendbox">
            {main}
            {hint && <div className={`co-small ${sendErr && plan.optimized ? 'co-danger' : 'co-muted'}`} role={sendErr ? 'alert' : undefined}>{hint}</div>}
          </div>}
        </aside>
      </div>

      {mode === 'draft' && <div className="co-dock co-dock-col">
        {hint && <div className={`co-small ${sendErr && plan.optimized ? 'co-danger' : 'co-muted'}`}>{hint}</div>}
        {main}
      </div>}
    </>
  );
}

