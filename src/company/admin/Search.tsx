import { useEffect, useState } from 'react';
import { listCouriers, searchStops, type Company, type Courier, type FoundStop, type LiveStop } from '../api';
import { dayTitle } from '../calendar';
import { errorText } from '../invite';
import { parseQuery, refText } from '../report';
import { failText, ProofLink, STATUS } from './Live';

type Status = LiveStop['delivery'] | 'all';
const FILTERS: { v: Status; label: string }[] = [
  { v: 'all', label: 'הכל' }, { v: 'delivered', label: 'נמסר' }, { v: 'pasted', label: 'הודבק' }, { v: 'failed', label: 'נכשל' }, { v: 'todo', label: 'לא סומן' },
];
const clock = (iso: string) => new Date(iso).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' });

/** Find any delivery: by its number, by address words, or by what happened to it. */
export function Search({ company }: { company: Company }) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<Status>('all');
  const [found, setFound] = useState<FoundStop[] | null>(null);
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => { listCouriers(company.id).then(setCouriers).catch(() => {}); }, [company.id]);

  async function run(st = status, text = q) {
    const p = parseQuery(text);
    if (!p.ref && !p.text && st === 'all') { setFound(null); return; }
    setBusy(true); setErr('');
    try { setFound(await searchStops(company.id, { ...p, status: st })); } catch (x) { setErr(errorText(x)); } finally { setBusy(false); }
  }
  // Typing searches by itself after a short pause.
  useEffect(() => { const t = setTimeout(() => { void run(); }, 350); return () => clearTimeout(t); }, [q, status]); // eslint-disable-line react-hooks/exhaustive-deps

  const nameOf = (id: string | null) => couriers.find((c) => c.userId === id)?.name ?? 'שליח';

  return (
    <section className="co-card" aria-labelledby="co-search" style={{ maxWidth: 820 }}>
      <div className="co-card-head"><h2 id="co-search">חיפוש משלוח</h2></div>
      <form role="search" onSubmit={(e) => { e.preventDefault(); void run(); }}>
        <label htmlFor="co-q" className="co-label">מספר משלוח או כתובת</label>
        <input id="co-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="#100042 או הרצל 12" autoComplete="off" />
      </form>
      <div className="co-chips" role="radiogroup" aria-label="סטטוס" style={{ marginTop: 12 }}>
        {FILTERS.map((f) => <button key={f.v} type="button" role="radio" aria-checked={status === f.v} className="co-chip" onClick={() => setStatus(f.v)}>{f.label}</button>)}
      </div>
      {err && <div className="co-msg bad" role="alert" style={{ marginTop: 12 }}>{err}</div>}
      <div role="status" className="co-muted co-small" style={{ margin: '14px 0 8px' }}>
        {busy ? 'מחפש...' : found === null ? 'מקלידים מספר משלוח או כתובת, או בוחרים סטטוס' : found.length ? `${found.length}${found.length === 300 ? '+' : ''} תוצאות` : 'לא נמצא משלוח'}
      </div>
      {found && found.length > 0 && (
        <ul className="co-seq">
          {found.map((x) => (
            <li key={x.id}>
              <span className={`co-seq-n ${x.delivery}`} aria-hidden="true">{x.seq}</span>
              <span className="co-person-main">
                <b>{x.address ?? x.input}{x.ref ? <span className="co-ref">{refText(x)}</span> : null}</b>
                <span className="co-small co-muted">
                  {STATUS[x.delivery]}{x.handled_at ? ` ${clock(x.handled_at)}` : ''} · {dayTitle(x.day)} · {nameOf(x.courierId)}
                  {x.delivery === 'failed' && failText(x) ? ` · ${failText(x)}` : ''}
                </span>
              </span>
              {x.proof_path && <ProofLink path={x.proof_path} />}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
