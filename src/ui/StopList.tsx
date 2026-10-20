import type { Stop, StopOrder } from '../domain/types';

interface Props {
  stops: Stop[];
  onOrder: (id: string, order: StopOrder) => void;
  onRemove: (id: string) => void;
}

const ORDER_LABEL: Record<StopOrder, string> = { first: 'ראשונה', auto: 'אוטומטי', last: 'אחרונה' };

export function StopList({ stops, onOrder, onRemove }: Props) {
  const shown = stops.filter((s) => s.verify !== 'needs_fix');
  if (!shown.length) return null;
  return (
    <section className="card">
      <h2>העצירות שלך</h2>
      <ol className="stops">
        {shown.map((s) => (
          <li key={s.id}>
            <div className="grow">
              <div>{s.address ?? s.input}</div>
              {s.verify === 'pending' && <div className="muted small">מאמת מול Google...</div>}
            </div>
            <select value={s.order} onChange={(e) => onOrder(s.id, e.target.value as StopOrder)} aria-label="מיקום במסלול">
              {(Object.keys(ORDER_LABEL) as StopOrder[]).map((o) => <option key={o} value={o}>{ORDER_LABEL[o]}</option>)}
            </select>
            <button type="button" className="icon" onClick={() => onRemove(s.id)} aria-label={`מחק ${s.input}`}>✕</button>
          </li>
        ))}
      </ol>
    </section>
  );
}
