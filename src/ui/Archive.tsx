import { useEffect, useState } from 'react';
import { lastStatusAt, routeTime, type ArchivedRoute } from '../domain/archive';
import { dayKey, fmtDay, fmtTime, OUTCOME_LABEL, routeCsv, routeEndedAt, WEEKDAYS } from '../domain/history';
import { logInfo, shareFile } from '../services/log';
import { loadRoutes } from '../store/db';

interface Props { onClose: () => void; onNotice: (msg: string) => void }

/** Every route the courier finished or replaced with "מסלול חדש", newest first. */
export function Archive({ onClose, onNotice }: Props) {
  const [routes, setRoutes] = useState<ArchivedRoute[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => { loadRoutes().then((r) => setRoutes(r.sort((a, b) => routeTime(b) - routeTime(a)))); }, []);

  const exportRoute = async (r: ArchivedRoute) => {
    const how = await shareFile(routeCsv(r.stops, routeTime(r), r.startedAt), `delvr-route-${dayKey(routeTime(r))}.csv`, 'text/csv', 'דוח מסלול');
    logInfo('report_archived_route', { id: r.id, how });
    if (how === 'downloaded') onNotice('הדוח ירד לטלפון (בתיקיית ההורדות). אפשר לפתוח אותו ב-Excel או לצרף בוואטסאפ');
    if (how === 'copied') onNotice('הדוח הועתק. הדבק אותו בוואטסאפ או במייל');
  };

  return (
    <>
      <section className="card">
        <h2>ארכיון מסלולים</h2>
        {routes === null && <p className="muted small">טוען...</p>}
        {routes?.length === 0 && <p className="muted small">עוד אין מסלולים בארכיון. מסלול נכנס לכאן כשלוחצים "מסלול חדש".</p>}
        <ul className="plain">
          {routes?.map((r) => {
            const t = routeTime(r);
            const count = (k: string) => r.stops.filter((s) => s.status === k).length;
            const end = routeEndedAt(r.stops);
            const last = lastStatusAt(r);
            return (
              <li key={r.id} className="fix">
                <button type="button" className="archive-row" onClick={() => setOpen(open === r.id ? null : r.id)} aria-expanded={open === r.id}>
                  <b>יום {WEEKDAYS[new Date(t).getDay()]}, {fmtDay(dayKey(t))}</b>
                  <span className="muted small">
                    {r.startedAt ? `התחלה ${fmtTime(r.startedAt)}` : 'לא נרשמה התחלה'}
                    {end ? ` · סיום ${fmtTime(end)}` : last ? ` · לא הושלם (אחרון ${fmtTime(last)})` : ''}
                  </span>
                  <span className="small">
                    {r.stops.length} עצירות: <span className="ok">{count('delivered')} נמסרו</span>, <span className="warn">{count('pasted')} הדבקות</span>, <span className="bad">{count('failed')} נכשלו</span>{count('todo') ? `, ${count('todo')} לא טופלו` : ''}
                  </span>
                </button>
                {open === r.id && (
                  <div className="archive-detail">
                    <ol className="stops">
                      {r.stops.map((s, i) => (
                        <li key={i}>
                          <div className="grow">
                            <div>{s.address}</div>
                            <div className="small">
                              <span className={s.status === 'failed' ? 'bad' : s.status === 'pasted' ? 'warn' : s.status === 'delivered' ? 'ok' : 'muted'}>
                                {s.status === 'todo' ? 'לא טופל' : OUTCOME_LABEL[s.status]}
                              </span>
                              {s.at && <span className="muted"> · {fmtTime(s.at)}</span>}
                              {s.reason && <span className="muted"> · {s.reason}</span>}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ol>
                    <button type="button" className="primary" onClick={() => exportRoute(r)}>ייצא דוח של המסלול הזה</button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>
      <button type="button" className="ghost" style={{ width: '100%' }} onClick={onClose}>חזרה למסלול</button>
    </>
  );
}
