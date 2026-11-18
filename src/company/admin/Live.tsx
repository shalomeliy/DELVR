import { useState, type ReactNode } from 'react';
import { proofUrl, type LiveStop } from '../api';

const clock = (iso: string) => new Date(iso).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' });

const STATUS: Record<LiveStop['delivery'], string> = { todo: 'בדרך', delivered: 'נמסר', pasted: 'הדבקה', failed: 'נכשל' };
/** The default reasons every company starts with (seed_fail_reasons in 0001). */
const REASON: Record<string, string> = { bad_address: 'כתובת שגויה', incomplete: 'כתובת חסרה', not_known: 'לא מוכר בכתובת', moved: 'עבר דירה',
  deceased: 'נפטר', vacant: 'בניין ריק או נטוש', no_place: 'אין איפה להדביק', other: 'אחר' };
const failText = (x: LiveStop) => [x.fail_code ? REASON[x.fail_code] ?? x.fail_code : null, x.fail_reason].filter(Boolean).join(': ');

/** Where the courier made the most recent mark, from the location the phone sent with it. */
export function lastMark(list: LiveStop[]) {
  const m = list.filter((x) => x.handled_at && x.handled_lat != null && x.handled_lng != null)
    .sort((a, b) => b.handled_at!.localeCompare(a.handled_at!))[0];
  return m ? { lat: m.handled_lat!, lng: m.handled_lng! } : undefined;
}

/** KPIs and the stop list of one route. title and actions let the calendar reuse it for a past or future day. */
export function LivePanel({ list, seenAt = null, title, live = true, actions }: { list: LiveStop[]; seenAt?: number | null; title?: ReactNode; live?: boolean; actions?: ReactNode }) {
  const n = (d: LiveStop['delivery']) => list.filter((x) => x.delivery === d).length;
  const next = live ? list.find((x) => x.delivery === 'todo') : undefined;
  return (
    <section className="co-card" aria-label={typeof title === 'string' ? title : 'מעקב חי'}>
      <div className="co-card-head">
        <h2 className="co-name-row">{live && <span className="co-dot live co-pulse" style={{ display: 'inline-block' }} />}{title ?? 'מעקב חי'}</h2>
        {actions ?? <span className="co-muted co-small">{seenAt ? `עודכן ${clock(new Date(seenAt).toISOString())}` : ''}</span>}
      </div>
      <div className="co-kpis">
        <div><b className="co-ok">{n('delivered')}</b><span>נמסרו</span></div>
        <div><b className="co-paste">{n('pasted')}</b><span>הדבקות</span></div>
        <div><b className="co-danger">{n('failed')}</b><span>נכשלו</span></div>
        <div><b>{n('todo')}</b><span>נשארו</span></div>
      </div>
      <ol className="co-seq">
        {list.map((x) => (
          <li key={x.id} className={x === next ? 'co-next' : undefined}>
            <span className={`co-seq-n ${x.delivery}`}>{x.seq}</span>
            <span className="co-person-main"><b>{x.address ?? x.input}</b>
              <span className="co-small co-muted">
                {x === next ? <span className="co-live">הבאה בתור</span> : STATUS[x.delivery]}
                {x.handled_at ? ` · ${clock(x.handled_at)}` : x.due_at ? ` · בול בזמן ${clock(x.due_at)}` : ''}
                {x.delivery === 'failed' && failText(x) ? ` · ${failText(x)}` : ''}
              </span>
            </span>
            {x.proof_path && <ProofLink path={x.proof_path} />}
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Opens the courier's door photo. The link is signed for 10 minutes, made only when the admin taps. */
function ProofLink({ path }: { path: string }) {
  const [err, setErr] = useState(false);
  async function open() {
    const w = window.open('', '_blank');
    try { const url = await proofUrl(path); if (w) w.location.href = url; else location.href = url; setErr(false); }
    catch { w?.close(); setErr(true); }
  }
  return <button type="button" className="co-photo" onClick={open}>{err ? 'לא נפתח, נסה שוב' : 'תמונה'}</button>;
}
