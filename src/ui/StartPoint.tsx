import { useRef, useState } from 'react';
import type { Place } from '../domain/types';

interface Props {
  start: Place;
  end: Place | null;
  onVerify: (which: 'start' | 'end', input: string) => Promise<void>;
  onHere: () => Promise<void>;
  onClearEnd: () => void;
}

function PlaceInput({ label, place, placeholder, onVerify, onClear }: { label: string; place: Place; placeholder: string; onVerify: (input: string) => Promise<void>; onClear?: () => void }) {
  const [text, setText] = useState(place.input);
  const [busy, setBusy] = useState(false);
  const verified = !!place.location && text.trim() === place.input.trim();
  // Leaving the field checks the address once. A text that already failed is not sent to Google again on blur.
  const tried = useRef('');
  const go = async () => { if (!text.trim()) return; tried.current = text.trim(); setBusy(true); try { await onVerify(text.trim()); } finally { setBusy(false); } };
  return (
    <div className="field">
      <label>{label}</label>
      <div className="inline">
        <input value={text} placeholder={placeholder} onChange={(e) => { setText(e.target.value); if (!e.target.value.trim() && place.location) onClear?.(); }}
          onKeyDown={(e) => e.key === 'Enter' && go()} onBlur={() => !verified && text.trim() && text.trim() !== tried.current && go()} />
        {!verified && text.trim() && <button type="button" onClick={go} disabled={busy}>{busy ? 'בודק...' : 'אמת'}</button>}
        {onClear && verified && <button type="button" className="icon" aria-label="מחק כתובת סיום" onClick={() => { setText(''); onClear(); }}>✕</button>}
      </div>
      {verified && place.address && <div className="ok small">✓ {place.address}</div>}
    </div>
  );
}

export function StartPoint({ start, end, onVerify, onHere, onClearEnd }: Props) {
  const [locating, setLocating] = useState(false);
  return (
    <section className="card">
      <h2>נקודת יציאה</h2>
      <PlaceInput key={`s-${start.input}`} label="מאיפה יוצאים (רחוב, מספר ועיר)" place={start} placeholder="לדוגמה: דוכיפת 5 יבנה" onVerify={(t) => onVerify('start', t)} />
      <button type="button" className="ghost" disabled={locating} onClick={async () => { setLocating(true); try { await onHere(); } finally { setLocating(false); } }}>
        {locating ? 'מאתר...' : 'המיקום שלי'}
      </button>
      <div style={{ marginTop: 12 }}>
        <PlaceInput key={`e-${end?.input ?? ''}`} label="כתובת סיום מועדפת (לא חובה)" place={end ?? { input: '' }}
          placeholder="כתובת מלאה, רחוב ועיר, או רק עיר" onVerify={(t) => onVerify('end', t)} onClear={onClearEnd} />
        {!end?.location && <div className="muted small">בלי כתובת סיום, המסלול חוזר לנקודת היציאה.</div>}
      </div>
    </section>
  );
}
