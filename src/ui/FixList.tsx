import { useState } from 'react';
import type { Stop } from '../domain/types';

interface Props {
  stops: Stop[];
  onRetry: (id: string, input: string) => void;
  onAccept: (id: string) => void;
  onRemove: (id: string) => void;
}

function FixRow({ stop, onRetry, onAccept, onRemove }: { stop: Stop } & Omit<Props, 'stops'>) {
  const [text, setText] = useState(stop.input);
  return (
    <li className="fix">
      <div className="bad small">{stop.fixReason}</div>
      <div className="inline">
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onRetry(stop.id, text)} aria-label="תיקון כתובת" />
        <button type="button" onClick={() => onRetry(stop.id, text)} disabled={!text.trim()}>בדוק שוב</button>
      </div>
      {stop.address && stop.location && (
        <div className="suggest small">
          Google הציע: <b>{stop.address}</b>
          <button type="button" className="ghost" onClick={() => onAccept(stop.id)}>כן, זו הכתובת</button>
        </div>
      )}
      <button type="button" className="link small" onClick={() => onRemove(stop.id)}>מחק את העצירה</button>
    </li>
  );
}

export function FixList(props: Props) {
  if (!props.stops.length) return null;
  return (
    <section className="card attention">
      <h2>צריך לתקן {props.stops.length} כתובות</h2>
      <p className="muted small">Google לא זיהה אותן ככתובת מלאה. תקן ולחץ "בדוק שוב".</p>
      <ul className="plain">{props.stops.map((s) => <FixRow key={`${s.id}-${s.input}`} stop={s} {...props} />)}</ul>
    </section>
  );
}
