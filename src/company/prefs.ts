// Small per-device choices (map shown or hidden, default vehicle). Kept in this browser only; a missing or blocked storage falls back to the default.
export type Vehicle = 'scooter' | 'car';

function read<T extends string>(key: string, allowed: readonly T[], fallback: T, ls: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage): T {
  try { const v = ls?.getItem(key); return v && (allowed as readonly string[]).includes(v) ? (v as T) : fallback; } catch { return fallback; }
}
function write(key: string, value: string, ls: Pick<Storage, 'setItem'> | undefined = globalThis.localStorage) {
  try { ls?.setItem(key, value); } catch { /* private mode: the choice lasts until the page closes */ }
}

export const prefs = {
  mapOpen: (where: 'admin' | 'courier', ls?: Pick<Storage, 'getItem'>) => read(`passit_map_${where}`, ['open', 'closed'] as const, 'open', ls) === 'open',
  setMapOpen: (where: 'admin' | 'courier', open: boolean, ls?: Pick<Storage, 'setItem'>) => write(`passit_map_${where}`, open ? 'open' : 'closed', ls),
  vehicle: (companyId: string, ls?: Pick<Storage, 'getItem'>) => read(`passit_vehicle_${companyId}`, ['scooter', 'car'] as const, 'scooter', ls),
  setVehicle: (companyId: string, v: Vehicle, ls?: Pick<Storage, 'setItem'>) => write(`passit_vehicle_${companyId}`, v, ls),
};
