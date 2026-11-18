import { useState, type ReactNode } from 'react';
import { prefs } from './prefs';

/** A map card the user can fold away. The choice is remembered on this device, separately for admin and courier. */
export function MapCard({ where, className = '', children }: { where: 'admin' | 'courier'; className?: string; children: ReactNode }) {
  const [open, setOpen] = useState(() => prefs.mapOpen(where));
  const toggle = () => { setOpen(!open); prefs.setMapOpen(where, !open); };
  return (
    <section className={`co-card co-mapcard ${open ? '' : 'co-map-closed'} ${className}`} aria-label="מפה">
      <button type="button" className="co-map-toggle" aria-expanded={open} onClick={toggle}>
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14" /></svg>
        {open ? 'הסתר מפה' : 'הצג מפה'}
      </button>
      {open && children}
    </section>
  );
}
