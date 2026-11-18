import { useEffect, useState } from 'react';
import type { LatLng, Place } from '../domain/types';

type StartMode = 'here' | 'address';

interface Props {
  /** The end address saved on the plan, filled in so a courier heading home does not retype it. */
  end: Place | null;
  /** Looks an address up; resolves to the place, or to an error to show. */
  onLookup: (input: string) => Promise<Place | string>;
  /** The phone's location, or an error to show. */
  onHere: () => Promise<LatLng | string>;
  onGo: (from: LatLng, end: Place | null) => Promise<void>;
  onClose: () => void;
}

// Opens on "סדר מחדש": where the rest of the route starts and, if the courier wants, where it ends.
// Left as is, it starts here and comes back here.
export function ResortSheet({ end, onLookup, onHere, onGo, onClose }: Props) {
  const [mode, setMode] = useState<StartMode>('here');
  const [startText, setStartText] = useState('');
  const [endText, setEndText] = useState(end?.input ?? '');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [busy, onClose]);

  const go = async () => {
    setError('');
    if (mode === 'address' && !startText.trim()) { setError('כתוב מאיפה להתחיל, או בחר "המיקום שלי"'); return; }
    try {
      setBusy(mode === 'here' ? 'מאתר מיקום...' : 'בודק כתובת התחלה...');
      const from = mode === 'here' ? await onHere() : await onLookup(startText.trim());
      if (typeof from === 'string') { setError(from); return; }
      const fromPoint = 'lat' in from ? from : from.location!;
      let endPlace: Place | null = null;
      const t = endText.trim();
      if (t) {
        if (end?.location && t === end.input.trim()) endPlace = end;
        else {
          setBusy('בודק כתובת סיום...');
          const r = await onLookup(t);
          if (typeof r === 'string') { setError(r); return; }
          endPlace = r;
        }
      }
      setBusy('מסדר את המסלול...');
      await onGo(fromPoint, endPlace);
    } catch (e) { setError(`הסידור נכשל: ${(e as Error).message}`); }
    finally { setBusy(''); }
  };

  return (
    <div className="sheet-back" onClick={() => !busy && onClose()}>
      <section className="card sheet" role="dialog" aria-modal="true" aria-labelledby="resort-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="resort-title">סידור מחדש</h2>
        <p className="muted small">מסדר רק את העצירות שעוד לא סימנת.</p>
        <div className="field">
          <label>מאיפה מתחילים</label>
          <div className="seg">
            <button type="button" className={mode === 'here' ? 'on' : ''} aria-pressed={mode === 'here'} onClick={() => setMode('here')}>המיקום שלי</button>
            <button type="button" className={mode === 'address' ? 'on' : ''} aria-pressed={mode === 'address'} onClick={() => setMode('address')}>כתובת אחרת</button>
          </div>
          {mode === 'address' && <input value={startText} autoFocus placeholder="רחוב, מספר ועיר" aria-label="כתובת התחלה"
            onChange={(e) => setStartText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()} />}
        </div>
        <div className="field">
          <label>כתובת סיום (לא חובה)</label>
          <div className="inline">
            <input value={endText} placeholder="כתובת מלאה, רחוב ועיר, או רק עיר" aria-label="כתובת סיום"
              onChange={(e) => setEndText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()} />
            {endText && <button type="button" className="icon" aria-label="מחק כתובת סיום" onClick={() => setEndText('')}>✕</button>}
          </div>
          {!endText.trim() && <div className="muted small">בלי כתובת סיום, המסלול חוזר לנקודת ההתחלה.</div>}
        </div>
        {error && <p className="bad small" role="alert">{error}</p>}
        <div className="fail-actions">
          <button type="button" className="primary" onClick={go} disabled={!!busy}>{busy || 'סדר'}</button>
          <button type="button" className="ghost" onClick={onClose} disabled={!!busy}>ביטול</button>
        </div>
      </section>
    </div>
  );
}
