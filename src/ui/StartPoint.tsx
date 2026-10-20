import { useState } from 'react';
import type { EndMode, Place } from '../domain/types';

interface Props {
  start: Place;
  end: Place | null;
  endMode: EndMode;
  onVerify: (which: 'start' | 'end', input: string) => Promise<void>;
  onHere: () => Promise<void>;
  onEndMode: (mode: EndMode) => void;
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

const END_MODES: [EndMode, string][] = [['open', 'בעצירה האחרונה'], ['return', 'חוזר להתחלה'], ['address', 'בכתובת אחרת']];

export function StartPoint({ start, end, endMode, onVerify, onHere, onEndMode }: Props) {
  const [locating, setLocating] = useState(false);
  return (
    <section className="card">
      <h2>נקודת יציאה</h2>
      <PlaceInput key={`s-${start.input}`} label="מאיפה יוצאים (רחוב, מספר ועיר)" place={start} placeholder="לדוגמה: דוכיפת 5 יבנה" onVerify={(t) => onVerify('start', t)} />
      <button type="button" className="ghost" disabled={locating} onClick={async () => { setLocating(true); try { await onHere(); } finally { setLocating(false); } }}>
        {locating ? 'מאתר...' : 'המיקום שלי'}
      </button>
      <label id="end-label" style={{ marginTop: 12 }}>איפה המסלול נגמר</label>
      <div className="seg" role="radiogroup" aria-labelledby="end-label">
        {END_MODES.map(([mode, label]) => (
          <button key={mode} type="button" role="radio" aria-checked={endMode === mode} className={endMode === mode ? 'on' : ''} onClick={() => onEndMode(mode)}>{label}</button>
        ))}
      </div>
      {endMode === 'address' && end && <PlaceInput key={`e-${end.input}`} label="איפה מסיימים" place={end} placeholder="רחוב, מספר ועיר" onVerify={(t) => onVerify('end', t)} />}
    </section>
  );
}
