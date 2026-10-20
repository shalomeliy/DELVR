import { useEffect, useRef, useState } from 'react';
import { speechSupported, startDictation, type Dictation } from '../services/speech';

interface Props { count: number; max: number; onAdd: (text: string) => void }

export function AddStops({ count, max, onAdd }: Props) {
  const [text, setText] = useState('');
  const [interim, setInterim] = useState('');
  const [rec, setRec] = useState<Dictation | null>(null);
  const [err, setErr] = useState('');
  const base = useRef('');
  useEffect(() => () => rec?.stop(), [rec]);

  const toggle = () => {
    if (rec) { rec.stop(); setRec(null); setInterim(''); return; }
    setErr('');
    base.current = text ? text + ' ' : '';
    try {
      setRec(startDictation({
        onText: (final, live) => { setText(base.current + final); setInterim(live); },
        onError: (m) => { setErr(m); setRec(null); },
        onEnd: () => { setRec(null); setInterim(''); },
      }));
    } catch (e) { setErr((e as Error).message); }
  };

  const add = () => { if (rec) { rec.stop(); setRec(null); } if (text.trim()) { onAdd(text); setText(''); setInterim(''); } };
  const full = count >= max;

  return (
    <section className="card">
      <h2>הוספת כתובות <span className="muted small">{count}/{max}</span></h2>
      {speechSupported() ? (
        <button type="button" className={`mic ${rec ? 'live' : ''}`} onClick={toggle} disabled={full}>
          {rec ? 'עצור הקלטה' : 'הקרא כתובות'}
        </button>
      ) : <p className="muted small">ההקלטה עובדת ב-Chrome. אפשר להקליד או להדביק רשימה.</p>}
      {rec && <p className="muted small">מקשיב... הקרא כתובת אחרי כתובת. עיר צריך להגיד רק אם היא שונה מעיר היציאה.</p>}
      <textarea value={text + (interim ? ' ' + interim : '')} onChange={(e) => setText(e.target.value)} readOnly={!!rec}
        placeholder="או הקלד/הדבק כתובות, למשל: הרצל 3 רחובות, ויצמן 14 פתח תקווה" rows={3} />
      {err && <p className="bad small">{err}</p>}
      <button type="button" className="primary" onClick={add} disabled={!text.trim() || full}>הוסף לרשימה</button>
      {full && <p className="warn small">הגעת למקסימום של {max} עצירות בגרסה הזו.</p>}
    </section>
  );
}
