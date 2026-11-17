import { useEffect, useRef, useState } from 'react';
import { canSaveFailReason, composeFailReason, FAIL_REASONS, parseFailReason } from '../domain/failReasons';
import { speechSupported, startDictation, type Dictation } from '../services/speech';

interface Props { initial?: string; onSave: (reason: string) => void; onCancel: () => void }

/** Opens under a stop when the courier taps "נכשל": pick one approved reason, add a note (typed or dictated), save. */
export function FailReason({ initial = '', onSave, onCancel }: Props) {
  const first = parseFailReason(initial);
  const [code, setCode] = useState(first.code);
  const [text, setText] = useState(first.note);
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

  const note = [text, interim].filter(Boolean).join(' ').trim();
  const other = FAIL_REASONS.find((r) => r.code === code)?.needsText ?? false;
  const ready = canSaveFailReason(code, note);
  const save = () => { const reason = composeFailReason(code, note); if (!reason) return; stop(); onSave(reason); };

  return (
    <div className="fail-box">
      <div className="muted small">לא בבית, לא עונה או אין גישה = הדבקה. סירב או ביקש מועד אחר = נמסר.</div>
      <fieldset className="reasons">
        <legend>סיבת הכישלון</legend>
        {FAIL_REASONS.map((r) => (
          <label key={r.code} className={code === r.code ? 'on' : ''}>
            <input type="radio" name="fail-code" value={r.code} checked={code === r.code} onChange={() => setCode(r.code)} />
            {r.label}
          </label>
        ))}
      </fieldset>
      <label htmlFor="fail-reason">{other ? 'מה קרה (חובה)' : 'הערה (לא חובה)'}</label>
      {speechSupported() && (
        <button type="button" className={`mic small-mic ${rec ? 'live' : ''}`} onClick={toggle}>{rec ? 'עצור הקלטה' : 'הקרא סיבה'}</button>
      )}
      <textarea id="fail-reason" value={text + (interim ? ' ' + interim : '')} onChange={(e) => setText(e.target.value)} readOnly={!!rec}
        placeholder={other ? 'למשל: כלב משוחרר בחצר' : 'למשל: השכן אמר שעבר לפני חודש'} rows={2} />
      {err && <p className="bad small">{err}</p>}
      <div className="fail-actions">
        <button type="button" className="bad-btn" onClick={save} disabled={!ready}>שמור נכשל</button>
        <button type="button" className="ghost" onClick={() => { stop(); onCancel(); }}>ביטול</button>
      </div>
    </div>
  );
}
