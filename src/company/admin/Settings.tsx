import { useState } from 'react';
import type { Company } from '../api';
import { prefs, type Vehicle } from '../prefs';

const VEHICLES: { v: Vehicle; label: string; hint: string }[] = [
  { v: 'scooter', label: 'קטנוע', hint: 'נכנס לסמטאות ועוקף פקקים. זמני הנסיעה מחושבים לדו-גלגלי.' },
  { v: 'car', label: 'רכב', hint: 'זמני נסיעה לפי רכב פרטי.' },
];

export function Settings({ company, onBack }: { company: Company; onBack: () => void }) {
  const [vehicle, setVehicle] = useState<Vehicle>(() => prefs.vehicle(company.id));
  const pick = (v: Vehicle) => { setVehicle(v); prefs.setVehicle(company.id, v); };
  return (
    <section className="co-card" aria-labelledby="co-settings" style={{ maxWidth: 560 }}>
      <div className="co-card-head">
        <h2 id="co-settings">הגדרות</h2>
        <button type="button" className="co-quiet" onClick={onBack}>חזרה</button>
      </div>
      <span className="co-label">סוג רכב לסידור המסלולים</span>
      <div className="co-tabs co-tabs-sm" role="radiogroup" aria-label="סוג רכב">
        {VEHICLES.map((x) => <button key={x.v} type="button" role="radio" aria-checked={vehicle === x.v} aria-pressed={vehicle === x.v} onClick={() => pick(x.v)}>{x.label}</button>)}
      </div>
      <p className="co-muted co-small" style={{ marginBottom: 0 }}>{VEHICLES.find((x) => x.v === vehicle)?.hint} נשמר במכשיר הזה, וחל על כל מסלול שתסדר מעכשיו.</p>
    </section>
  );
}
