import { useEffect, useRef, useState } from 'react';
import { speechSupported, startDictation, type Dictation } from '../services/speech';

interface Props { initial?: string; onSave: (reason: string) => void; onCancel: () => void }

/** Opens under a stop when the courier taps "נכשל": free text, typed or dictated, then saved with the failure. */
export function FailReason({ initial = '', onSave, onCancel }: Props) {
  const [text, setText] = useState(initial);
  const [interim, setInterim] = useState('');
  const [rec, setRec] = useState<Dictation | null>(null);
  const [err, setErr] = useState('');
  const base = useRef('');
  // Same guard as AddStops: late results from a stopped recording must not refill the box.
  const session = useRef(0);
  useEffect(() => () => rec?.stop(), [rec]);

  const stop = () => { if (rec) { rec.stop(); setRec(null); } session.current++; setInterim(''); };

  const toggle = () => {
    if (rec) { stop(); return; }
    setErr('');
    base.current = text ? text + ' ' : '';
    const id = ++session.current;
    const live = () => id === session.current;
    try {
      setRec(startDictation({
        onText: (final, interimText) => { if (live()) { setText(base.current + final); setInterim(interimText); } },
        onError: (m) => { if (live()) { setErr(m); setRec(null); } },
        onEnd: () => { if (live()) { setRec(null); setInterim(''); } },
      }));
    } catch (e) { setErr((e as Error).message); }
  };

  const save = () => { const all = [text, interim].filter(Boolean).join(' ').trim(); stop(); onSave(all); };

  return (
    <div className="fail-box">
      <label htmlFor="fail-reason">סיבת הכישלון</label>
      {speechSupported() && (
        <button type="button" className={`mic small-mic ${rec ? 'live' : ''}`} onClick={toggle}>{rec ? 'עצור הקלטה' : 'הקרא סיבה'}</button>
      )}
      <textarea id="fail-reason" value={text + (interim ? ' ' + interim : '')} onChange={(e) => setText(e.target.value)} readOnly={!!rec}
        placeholder="למשל: אין מענה בדלת, הלקוח ביקש לתאם מחדש" rows={2} autoFocus />
      {err && <p className="bad small">{err}</p>}
      <div className="fail-actions">
        <button type="button" className="bad-btn" onClick={save}>שמור נכשל</button>
        <button type="button" className="ghost" onClick={() => { stop(); onCancel(); }}>ביטול</button>
      </div>
    </div>
  );
}
