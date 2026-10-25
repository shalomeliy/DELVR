import { useState } from 'react';
import { endModeOf, fmtClock, fmtDuration, fmtKm, orderedStops } from '../domain/plan';
import type { Plan, Stop } from '../domain/types';
import { googleMapsUrl, wazeUrl } from '../services/navigation';
import { FailReason } from './FailReason';
import { MapView } from './MapView';

interface Props {
  plan: Plan;
  onDelivery: (id: string, d: Stop['delivery'], reason?: string) => void;
  onReoptimize: () => void;
  busy: boolean;
}

const MAP_KEY = 'delvr_map';
const STATUS = { delivered: '✓ נמסר', pasted: '✓ הדבקה', failed: '✕ נכשל' } as const;

export function RouteView({ plan, onDelivery, onReoptimize, busy }: Props) {
  const opt = plan.optimized!;
  const stops = orderedStops(plan);
  const addedAt = new Map(plan.stops.map((s, i) => [s.id, i + 1]));
  const points = stops.flatMap((s, i) => (s.location ? [{ ...s.location, label: String(i + 1), status: s.delivery }] : []));
  const done = plan.stops.filter((s) => s.delivery !== 'todo').length;
  const routed = new Set(opt.order);
  const endLeg = opt.legs[opt.order.length];
  // Open by default; a courier who closes it keeps it closed, since every map Google draws is a billed map load.
  const [showMap, setShowMapState] = useState(() => { try { return localStorage.getItem(MAP_KEY) !== 'off'; } catch { return true; } });
  const setShowMap = (fn: (v: boolean) => boolean) => setShowMapState((v) => { const next = fn(v); try { localStorage.setItem(MAP_KEY, next ? 'on' : 'off'); } catch { /* ignore */ } return next; });
  // The stop whose failure reason box is open.
  const [failing, setFailing] = useState<string | null>(null);
  const counts = { delivered: 0, pasted: 0, failed: 0 };
  for (const s of plan.stops) if (s.delivery !== 'todo') counts[s.delivery]++;

  return (
    <section className="card">
      <h2>המסלול שלך</h2>
      <div className="totals">
        <div><b>{fmtDuration(opt.totalDurationSec)}</b><span>נסיעה</span></div>
        <div><b>{fmtKm(opt.totalDistanceM)}</b><span>מרחק</span></div>
        <div><b>{fmtClock(opt.at + opt.totalDurationSec * 1000)}</b><span>סיום משוער</span></div>
      </div>
      <p className="muted small">זמני נסיעה לפי Google, כולל תנועה. לא כולל זמן עצירה בכל כתובת. {done ? `${done} מתוך ${plan.stops.length} טופלו: ${counts.delivered} נמסרו, ${counts.pasted} הדבקות, ${counts.failed} נכשלו.` : ''}</p>
      <button type="button" className="ghost" onClick={() => setShowMap((v) => !v)}>{showMap ? 'הסתר מפה' : 'הצג מפה'}</button>
      {showMap && <MapView start={plan.start.location} points={points} polyline={opt.polyline} />}
      <ol className="route">
        {stops.map((s, i) => {
          const leg = routed.has(s.id) ? opt.legs[opt.order.indexOf(s.id)] : undefined;
          return (
            <li key={s.id} className={s.delivery}>
              <div className="num">{i + 1}</div>
              <div className="grow">
                <div>{s.address ?? s.input}</div>
                <div className="muted small">
                  {leg && `${fmtDuration(leg.durationSec)} · ${fmtKm(leg.distanceM)}`}
                  {addedAt.get(s.id) !== i + 1 && ` · היה מספר ${addedAt.get(s.id)} ברשימה`}
                </div>
                {s.location && s.delivery === 'todo' && failing !== s.id && (
                  <div className="actions">
                    <a className="btn nav" href={wazeUrl(s.location, s.address)} rel="noreferrer">Waze</a>
                    <a className="btn ghost nav" href={googleMapsUrl(s.location)} target="_blank" rel="noreferrer">Google</a>
                    <button type="button" className="ok-btn" onClick={() => onDelivery(s.id, 'delivered')}>נמסר</button>
                    <button type="button" className="paste-btn" onClick={() => onDelivery(s.id, 'pasted')}>הדבקה</button>
                    <button type="button" className="bad-btn" onClick={() => setFailing(s.id)}>נכשל</button>
                  </div>
                )}
                {failing === s.id && (
                  <FailReason initial={s.failReason} onCancel={() => setFailing(null)}
                    onSave={(reason) => { setFailing(null); onDelivery(s.id, 'failed', reason); }} />
                )}
                {s.delivery !== 'todo' && failing !== s.id && (
                  <div className="small">
                    <span className={s.delivery === 'failed' ? 'bad' : s.delivery === 'pasted' ? 'warn' : 'ok'}>{STATUS[s.delivery]}</span>
                    {s.delivery === 'failed' && s.failReason && <span className="muted">: {s.failReason}</span>}
                    {s.delivery === 'failed' && <button type="button" className="link" onClick={() => setFailing(s.id)}>{s.failReason ? 'ערוך סיבה' : 'הוסף סיבה'}</button>}
                    <button type="button" className="link" onClick={() => onDelivery(s.id, 'todo')}>בטל</button>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {endLeg && <p className="muted small">{endModeOf(plan) === 'address' ? 'לנקודת הסיום' : 'חזרה לנקודת היציאה'}: {fmtDuration(endLeg.durationSec)} · {fmtKm(endLeg.distanceM)}</p>}
      <button type="button" className="ghost" onClick={onReoptimize} disabled={busy}>{busy ? 'מסדר...' : 'סדר מחדש את מה שנשאר'}</button>
    </section>
  );
}
