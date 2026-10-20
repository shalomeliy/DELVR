import { useState } from 'react';
import type { Place } from '../domain/types';

interface Props {
  start: Place;
  end: Place | null;
  onVerify: (which: 'start' | 'end', input: string) => Promise<void>;
  onHere: () => Promise<void>;
  onEndMode: (roundTrip: boolean) => void;
}

function PlaceInput({ label, place, placeholder, onVerify }: { label: string; place: Place; placeholder: string; onVerify: (input: string) => Promise<void> }) {
  const [text, setText] = useState(place.input);
  const [busy, setBusy] = useState(false);
  const verified = !!place.location && text.trim() === place.input.trim();
  const go = async () => { if (!text.trim()) return; setBusy(true); try { await onVerify(text.trim()); } finally { setBusy(false); } };
  return (
    <div className="field">
      <label>{label}</label>
      <div className="inline">
        <input value={text} placeholder={placeholder} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()} onBlur={() => !verified && text.trim() && go()} />
        {!verified && <button type="button" onClick={go} disabled={busy || !text.trim()}>{busy ? 'בודק...' : 'אמת'}</button>}
      </div>
      {verified && place.address && <div className="ok small">✓ {place.address}</div>}
    </div>
  );
}

export function StartPoint({ start, end, onVerify, onHere, onEndMode }: Props) {
  const [locating, setLocating] = useState(false);
  return (
    <section className="card">
      <h2>נקודת יציאה</h2>
      <PlaceInput key={`s-${start.input}`} label="מאיפה יוצאים (רחוב, מספר ועיר)" place={start} placeholder="לדוגמה: דוכיפת 5 יבנה" onVerify={(t) => onVerify('start', t)} />
      <button type="button" className="ghost" disabled={locating} onClick={async () => { setLocating(true); try { await onHere(); } finally { setLocating(false); } }}>
        {locating ? 'מאתר...' : 'המיקום שלי'}
      </button>
      <div className="seg" role="radiogroup" aria-label="סיום המסלול">
        <button type="button" role="radio" aria-checked={!end} className={!end ? 'on' : ''} onClick={() => onEndMode(true)}>חוזר לנקודת היציאה</button>
        <button type="button" role="radio" aria-checked={!!end} className={end ? 'on' : ''} onClick={() => onEndMode(false)}>מסיים בכתובת אחרת</button>
      </div>
      {end && <PlaceInput key={`e-${end.input}`} label="איפה מסיימים" place={end} placeholder="רחוב, מספר ועיר" onVerify={(t) => onVerify('end', t)} />}
    </section>
  );
}
