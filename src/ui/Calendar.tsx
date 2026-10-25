import { useEffect, useState } from 'react';
import { dailyCsv, dayKey, fmtDay, monthGrid, summarize, weekdayOf, weekOf, weeklyCsv, WEEKDAYS, type DayLog } from '../domain/history';
import { logInfo, shareFile } from '../services/log';
import { loadDays } from '../store/db';

const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

interface Props { onClose: () => void; onNotice: (msg: string) => void }

export function Calendar({ onClose, onNotice }: Props) {
  const today = dayKey(Date.now());
  const [month, setMonth] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [selected, setSelected] = useState(today);
  const [logs, setLogs] = useState<Map<string, DayLog>>(new Map());

  const cells = monthGrid(month.y, month.m);
  const days = cells.filter((c): c is string => !!c);
  useEffect(() => {
    loadDays(days[0], days[days.length - 1]).then((l) => setLogs(new Map(l.map((d) => [d.day, d]))));
  }, [month.y, month.m]); // eslint-disable-line react-hooks/exhaustive-deps

  const move = (n: number) => setMonth(({ y, m }) => { const d = new Date(y, m + n, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  const entries = logs.get(selected)?.entries ?? [];
  const sum = summarize(entries);
  const failed = entries.filter((e) => e.outcome === 'failed');

  const told = (how: string) => {
    if (how === 'downloaded') onNotice('הדוח ירד לטלפון (בתיקיית ההורדות). אפשר לפתוח אותו ב-Excel או לצרף בוואטסאפ');
    if (how === 'copied') onNotice('הדוח הועתק. הדבק אותו בוואטסאפ או במייל');
  };
  const exportDay = async () => {
    const how = await shareFile(dailyCsv(selected, entries), `delvr-day-${selected}.csv`, 'text/csv', `דוח יומי ${fmtDay(selected)}`);
    logInfo('report_day', { day: selected, how }); told(how);
  };
  const exportWeek = async () => {
    const week = weekOf(selected);
    const weekLogs = await loadDays(week[0], week[6]);
    const how = await shareFile(weeklyCsv(week, weekLogs), `delvr-week-${week[0]}.csv`, 'text/csv', `דוח שבועי ${fmtDay(week[0])}-${fmtDay(week[6])}`);
    logInfo('report_week', { from: week[0], how }); told(how);
  };

  return (
    <>
      <section className="card">
        <div className="cal-head">
          <button type="button" className="icon" onClick={() => move(-1)} aria-label="חודש קודם">→</button>
          <h2>{MONTHS[month.m]} {month.y}</h2>
          <button type="button" className="icon" onClick={() => move(1)} aria-label="חודש הבא">←</button>
        </div>
        <div className="cal">
          {['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'].map((w) => <div key={w} className="wd">{w}'</div>)}
          {cells.map((d, i) => {
            if (!d) return <div key={`e${i}`} />;
            const n = logs.get(d)?.entries.length ?? 0;
            return (
              <button key={d} type="button" onClick={() => setSelected(d)}
                className={[n ? 'has' : '', d === today ? 'today' : '', d === selected ? 'sel' : ''].join(' ')}>
                {Number(d.slice(8))}
                {n > 0 && <span>{n}</span>}
              </button>
            );
          })}
        </div>
      </section>

      <section className="card">
        <h2>יום {WEEKDAYS[weekdayOf(selected)]}, {fmtDay(selected)}</h2>
        <div className="totals four">
          <div><b>{sum.total}</b><span>סה"כ</span></div>
          <div><b className="ok">{sum.delivered}</b><span>נמסר</span></div>
          <div><b className="warn">{sum.pasted}</b><span>הדבקה</span></div>
          <div><b className="bad">{sum.failed}</b><span>נכשל</span></div>
        </div>
        {!sum.total && <p className="muted small">אין משלוחים ביום הזה.</p>}
        {failed.length > 0 && (
          <>
            <h3 className="small">סיבות כישלון</h3>
            <ul className="plain">
              {failed.map((e) => (
                <li key={e.stopId} className="fix">
                  <div>{e.address}</div>
                  <div className="muted small">{e.reason || 'לא נרשמה סיבה'}</div>
                </li>
              ))}
            </ul>
          </>
        )}
        <div className="export">
          <button type="button" className="primary" onClick={exportDay} disabled={!sum.total}>ייצא דוח יומי</button>
          <button type="button" className="primary" onClick={exportWeek}>ייצא דוח שבועי</button>
        </div>
        <p className="muted small">הדוח הוא קובץ CSV שנפתח ב-Excel וב-Google Sheets. השבוע הוא ראשון עד שבת של היום שבחרת.</p>
      </section>

      <button type="button" className="ghost" style={{ width: '100%' }} onClick={onClose}>חזרה למסלול</button>
    </>
  );
}
