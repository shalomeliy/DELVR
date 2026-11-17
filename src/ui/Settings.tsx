import { useEffect, useRef, useState } from 'react';
import { getVehicle, setVehicle, type Vehicle } from '../services/vehicle';

type View = 'route' | 'calendar' | 'archive';

interface Props {
  view: View;
  canReset: boolean;
  routeSorted: boolean;
  onView: (v: View) => void;
  onReset: () => void;
  onLogs: () => void;
}

// Everything that used to sit in the header, plus the vehicle choice, behind one button.
export function Settings({ view, canReset, routeSorted, onView, onReset, onLogs }: Props) {
  const [open, setOpen] = useState(false);
  const [vehicle, setVehicleState] = useState<Vehicle>(getVehicle);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  }, [open]);

  const run = (fn: () => void) => () => { setOpen(false); fn(); };
  const pick = (v: Vehicle) => { setVehicle(v); setVehicleState(v); };

  return (
    <div className="settings" ref={box}>
      <button type="button" className="gear" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span aria-hidden="true">⚙</span> הגדרות
      </button>
      {open && (
        <div className="menu" role="menu">
          {view !== 'route' && <button type="button" role="menuitem" onClick={run(() => onView('route'))}>חזרה למסלול</button>}
          {view !== 'calendar' && <button type="button" role="menuitem" onClick={run(() => onView('calendar'))}>יומן</button>}
          {view !== 'archive' && <button type="button" role="menuitem" onClick={run(() => onView('archive'))}>ארכיון</button>}
          {canReset && <button type="button" role="menuitem" onClick={run(onReset)}>מסלול חדש</button>}
          <button type="button" role="menuitem" onClick={run(onLogs)}>שלח לוגים</button>
          <div className="menu-sec">
            <label>על מה רוכבים</label>
            <div className="seg">
              <button type="button" className={vehicle === 'scooter' ? 'on' : ''} aria-pressed={vehicle === 'scooter'} onClick={() => pick('scooter')}>קטנוע</button>
              <button type="button" className={vehicle === 'car' ? 'on' : ''} aria-pressed={vehicle === 'car'} onClick={() => pick('car')}>רכב</button>
            </div>
            <div className="muted small">{vehicle === 'scooter' ? 'בלי כבישים מהירים, והמסלול הקצר בק"מ מנצח.' : 'המסלול המהיר בזמן מנצח.'}</div>
            {routeSorted && <div className="muted small">השינוי ייכנס לתוקף בסידור הבא של המסלול.</div>}
          </div>
          <div className="menu-sec muted small">PassIT גרסה {import.meta.env.VITE_VERSION} ({import.meta.env.VITE_BUILD ?? 'dev'})</div>
        </div>
      )}
    </div>
  );
}
