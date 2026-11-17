// What the courier rides, kept on this phone between routes. Storage name keeps the old 'delvr' prefix.
export type Vehicle = 'scooter' | 'car';
const KEY = 'delvr_vehicle';

export function getVehicle(): Vehicle {
  try { return localStorage.getItem(KEY) === 'car' ? 'car' : 'scooter'; } catch { return 'scooter'; }
}

export function setVehicle(v: Vehicle) {
  try { localStorage.setItem(KEY, v); } catch { /* storage blocked */ }
}
