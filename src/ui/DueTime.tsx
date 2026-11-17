import { useState } from 'react';

interface Props {
  due?: string;
  /** False when the route already has the most timed stops allowed. */
  canAdd: boolean;
  onChange: (due: string | undefined) => void;
}

/** "בול בזמן": the courier must be at this stop at a set time. A chip when set, a small button when not. */
export function DueTime({ due, canAdd, onChange }: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  if (editing !== null) {
    return (
      <div className="due-edit">
        <input type="time" value={editing} autoFocus aria-label="שעה שחייבים להיות בכתובת" onChange={(e) => setEditing(e.target.value)} />
        <button type="button" className="ok-btn" disabled={!editing} onClick={() => { onChange(editing); setEditing(null); }}>שמור</button>
        <button type="button" className="ghost" onClick={() => setEditing(null)}>ביטול</button>
      </div>
    );
  }
  if (due) {
    return (
      <span className="due-chip">
        <button type="button" className="link" onClick={() => setEditing(due)} title="שנה שעה">בול בזמן {due}</button>
        <button type="button" className="icon" aria-label="בטל שעה" title="בטל שעה" onClick={() => onChange(undefined)}>✕</button>
      </span>
    );
  }
  if (!canAdd) return null;
  return <button type="button" className="link due-add" onClick={() => setEditing('')}>+ בול בזמן</button>;
}
