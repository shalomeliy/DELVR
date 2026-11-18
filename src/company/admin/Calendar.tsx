import { useCallback, useEffect, useMemo, useState } from 'react';
import { listCouriers, listRoutes, type Company, type Courier } from '../api';
import { dayTitle, monthGrid, monthOf, monthRange, monthTitle, shiftMonth, sumDay, WEEKDAYS, type DayRoute } from '../calendar';
import { errorText } from '../invite';
import { israelDay } from '../time';
import { CallButton } from './Couriers';
import { LivePanel } from './Live';

/** The admin's calendar: every day's routes at a glance, and a day's full detail on tap. */
export function Calendar({ company, day, onDay, onOpen }: {
  company: Company; day: string; onDay: (day: string) => void; onOpen: (courierId: string, day: string) => void;
}) {
  const [month, setMonth] = useState(monthOf(day));
  const [routes, setRoutes] = useState<DayRoute[] | null>(null);
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [err, setErr] = useState('');
  const today = israelDay();

  const load = useCallback(async () => {
    const { from, to } = monthRange(month);
    try {
      const [r, c] = await Promise.all([listRoutes(company.id, from, to), listCouriers(company.id)]);
      setRoutes(r); setCouriers(c); setErr('');
    } catch (x) { setErr(errorText(x)); setRoutes((r) => r ?? []); }
  }, [company.id, month]);
  useEffect(() => { setRoutes(null); void load(); }, [load]);

  const weeks = useMemo(() => monthGrid(month), [month]);
  const ofDay = (routes ?? []).filter((r) => r.day === day && r.status !== 'draft');
  const sum = sumDay(routes ?? [], day);
  const courierOf = (id: string | null) => couriers.find((c) => c.userId === id);

  return (
    <div className="co-grid co-cal-grid">
      <section className="co-card" aria-label="יומן">
        <div className="co-card-head">
          <button type="button" className="co-quiet" aria-label="החודש הקודם" onClick={() => setMonth(shiftMonth(month, -1))}>‹ קודם</button>
          <h2>{monthTitle(month)}</h2>
          <button type="button" className="co-quiet" aria-label="החודש הבא" onClick={() => setMonth(shiftMonth(month, 1))}>הבא ›</button>
        </div>
        {err && <div className="co-msg bad" role="alert">{err}</div>}
        <div className="co-cal" role="grid" aria-label={monthTitle(month)}>
          <div className="co-cal-row" role="row">{WEEKDAYS.map((w) => <span key={w} className="co-cal-wd" role="columnheader">{w}</span>)}</div>
          {weeks.map((week, i) => (
            <div key={i} className="co-cal-row" role="row">
              {week.map((d, j) => {
                if (!d) return <span key={j} className="co-cal-cell empty" />;
                const s = sumDay(routes ?? [], d);
                const done = s.stops - s.todo;
                return (
                  <button key={d} type="button" role="gridcell" aria-selected={d === day}
                    className={`co-cal-cell${d === today ? ' today' : ''}${s.routes ? ' has' : ''}`} onClick={() => onDay(d)}
                    aria-label={`${dayTitle(d)}${s.routes ? `, ${s.routes} מסלולים, ${done} מתוך ${s.stops} סומנו` : ''}`}>
                    <b>{Number(d.slice(8))}</b>
                    {s.routes > 0 && <span className="co-cal-meta">{done}/{s.stops}</span>}
                    {s.failed > 0 && <span className="co-cal-fail" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        {routes === null && <p className="co-muted co-small">טוען את החודש...</p>}
      </section>

      <div className="co-solo">
        <section className="co-card" aria-label={dayTitle(day)}>
          <div className="co-card-head">
            <h2>{day === today ? 'היום · ' : ''}{dayTitle(day)}</h2>
            <button type="button" className="co-ghost" onClick={() => onOpen(couriers.find((c) => c.active)?.userId ?? '', day)}>+ מסלול</button>
          </div>
          {sum.couriers > 0 && <p className="co-muted co-small" style={{ marginTop: 0 }}>{sum.couriers} שליחים יצאו ביום הזה</p>}
          {sum.routes === 0 ? <p className="co-muted" style={{ margin: 0 }}>אין מסלולים שנשלחו ביום הזה.</p> : (
            <div className="co-kpis">
              <div><b className="co-ok">{sum.delivered}</b><span>נמסרו</span></div>
              <div><b className="co-paste">{sum.pasted}</b><span>הדבקות</span></div>
              <div><b className="co-danger">{sum.failed}</b><span>נכשלו</span></div>
              <div><b>{sum.todo}</b><span>נשארו</span></div>
            </div>
          )}
        </section>
        {ofDay.map((r) => {
          const c = courierOf(r.courierId);
          return (
            <LivePanel key={r.id} list={r.list} live={r.day === today}
              title={<>{c?.name ?? 'שליח שהוסר'}{c && <CallButton courier={c} />}</>}
              actions={r.courierId ? <button type="button" onClick={() => onOpen(r.courierId!, r.day)}>פתח במסלול</button> : undefined} />
          );
        })}
      </div>
    </div>
  );
}
