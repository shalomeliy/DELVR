import { useMemo } from 'react';
import { fmtClock, fmtDuration, fmtKm, orderedStops } from '../domain/plan';
import type { Plan, Stop } from '../domain/types';
import { googleMapsUrl, wazeUrl } from '../services/navigation';
import { MapView } from './MapView';

interface Props {
  plan: Plan;
  onDelivery: (id: string, d: Stop['delivery']) => void;
  onReoptimize: () => void;
  busy: boolean;
}

export function RouteView({ plan, onDelivery, onReoptimize, busy }: Props) {
  const opt = plan.optimized!;
  const stops = orderedStops(plan);
  const addedAt = new Map(plan.stops.map((s, i) => [s.id, i + 1]));
  const points = useMemo(() => stops.filter((s) => s.location).map((s) => s.location!), [stops]);
  const done = plan.stops.filter((s) => s.delivery !== 'todo').length;
  const routed = new Set(opt.order);
  const endLeg = opt.legs[opt.order.length];

  return (
    <section className="card">
      <h2>המסלול שלך</h2>
      <div className="totals">
        <div><b>{fmtDuration(opt.totalDurationSec)}</b><span>נסיעה</span></div>
        <div><b>{fmtKm(opt.totalDistanceM)}</b><span>מרחק</span></div>
        <div><b>{fmtClock(opt.at + opt.totalDurationSec * 1000)}</b><span>סיום משוער</span></div>
      </div>
      <p className="muted small">זמני נסיעה לפי Google, כולל תנועה. לא כולל זמן עצירה בכל כתובת. {done ? `${done} מתוך ${plan.stops.length} טופלו.` : ''}</p>
      <MapView start={plan.start.location} points={points} polyline={opt.polyline} />
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
                {s.location && s.delivery === 'todo' && (
                  <div className="actions">
                    <a className="btn" href={wazeUrl(s.location)} target="_blank" rel="noreferrer">Waze</a>
                    <a className="btn ghost" href={googleMapsUrl(s.location)} target="_blank" rel="noreferrer">Google</a>
                    <button type="button" className="ok-btn" onClick={() => onDelivery(s.id, 'delivered')}>נמסר</button>
                    <button type="button" className="bad-btn" onClick={() => onDelivery(s.id, 'failed')}>נכשל</button>
                  </div>
                )}
                {s.delivery !== 'todo' && (
                  <div className="small">
                    <span className={s.delivery === 'delivered' ? 'ok' : 'bad'}>{s.delivery === 'delivered' ? '✓ נמסר' : '✕ נכשל'}</span>
                    <button type="button" className="link" onClick={() => onDelivery(s.id, 'todo')}>בטל</button>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {endLeg && <p className="muted small">{plan.end ? 'לנקודת הסיום' : 'חזרה לנקודת היציאה'}: {fmtDuration(endLeg.durationSec)} · {fmtKm(endLeg.distanceM)}</p>}
      <button type="button" className="ghost" onClick={onReoptimize} disabled={busy}>{busy ? 'מסדר...' : 'סדר מחדש את מה שנשאר'}</button>
    </section>
  );
}
