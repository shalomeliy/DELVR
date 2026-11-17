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
import { getRoute, listCouriers, sendRoute, type Company, type Courier, type ServerRoute } from '../api';
import { errorText, initials } from '../invite';
import { cannotSend, dayIso, departFor, toSendPayload } from '../send';
import { israelTime } from '../time';

type Vehicle = 'scooter' | 'car';
const DAYS = [{ offset: 0, label: 'היום' }, { offset: 1, label: 'מחר' }];
const clock = (iso: string) => new Date(iso).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });

export function Planner({ company, onInvite }: { company: Company; onInvite: () => void }) {
  const [couriers, setCouriers] = useState<Courier[] | null>(null);
  const [courierId, setCourierId] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [vehicle, setVehicle] = useState<Vehicle>('scooter');
  const [loadErr, setLoadErr] = useState('');

  useEffect(() => {
    listCouriers(company.id).then((all) => {
      const active = all.filter((c) => c.active);
      setCouriers(active);
      setCourierId((id) => id ?? active[0]?.userId ?? null);
    }).catch((x) => setLoadErr(errorText(x)));
  }, [company.id]);

  const courier = couriers?.find((c) => c.userId === courierId) ?? null;
  const day = dayIso(offset);

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
        <div>
          <span className="co-label">שליח</span>
          <div className="co-chips" role="radiogroup" aria-label="שליח">
            {couriers.map((c) => (
              <button key={c.userId} type="button" role="radio" aria-checked={c.userId === courierId} className="co-chip" onClick={() => setCourierId(c.userId)}>
                <span className="co-chip-av" aria-hidden="true">{initials(c.name)}</span>{c.name}
              </button>
            ))}
          </div>
        </div>
        <div className="co-pick-row">
          <div>
            <span className="co-label">יום</span>
            <div className="co-tabs co-tabs-sm" role="group" aria-label="יום">
              {DAYS.map((d) => <button key={d.offset} type="button" aria-pressed={offset === d.offset} onClick={() => setOffset(d.offset)}>{d.label}</button>)}
            </div>
          </div>
          <div>
            <span className="co-label">רכב</span>
            <div className="co-tabs co-tabs-sm" role="group" aria-label="רכב">
              <button type="button" aria-pressed={vehicle === 'scooter'} onClick={() => setVehicle('scooter')}>קטנוע</button>
              <button type="button" aria-pressed={vehicle === 'car'} onClick={() => setVehicle('car')}>רכב</button>
            </div>
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

  const refresh = useCallback(() => { getRoute(company.id, courier.userId, day).then(setServer).catch(() => setServer(null)); }, [company.id, courier.userId, day]);
  useEffect(refresh, [refresh]);

  if (!plan) return <p className="co-muted">טוען...</p>;

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

      <div className="co-grid co-plan">
        <div className="co-solo">
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
        </div>

        <aside className="co-side">
          <section className="co-card co-mapcard">
            <MapView start={plan.start.location}
              points={(plan.optimized ? ordered : plan.stops).filter((s) => s.location).map((s, i) => ({ ...s.location!, label: String(i + 1), status: 'todo' }))}
              polyline={plan.optimized && !plan.optimized.stale ? plan.optimized.polyline : undefined} />
          </section>
          <div className="co-desk co-sendbox">
            {main}
            {hint && <div className={`co-small ${sendErr && plan.optimized ? 'co-danger' : 'co-muted'}`} role={sendErr ? 'alert' : undefined}>{hint}</div>}
          </div>
        </aside>
      </div>

      <div className="co-dock co-dock-col">
        {hint && <div className={`co-small ${sendErr && plan.optimized ? 'co-danger' : 'co-muted'}`}>{hint}</div>}
        {main}
      </div>
    </>
  );
}
