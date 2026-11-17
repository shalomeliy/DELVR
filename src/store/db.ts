// IndexedDB on the device: the current plan, the courier's corrected addresses and the per-day history. No server database in v1.
import type { ArchivedRoute } from '../domain/archive';
import type { DayLog } from '../domain/history';
import type { LatLng, Plan } from '../domain/types';
import { newestPlan, normalizePlan, readBackup, within, writeBackup } from './persist';

// Storage names keep the old 'delvr' prefix on purpose: renaming them would lose saved routes, history and archive.
const DB = 'delvr', VERSION = 3;
const PLAN = 'plan', MEMORY = 'addressMemory', HISTORY = 'history', ROUTES = 'routes';

/** at: when Google last confirmed it. Google's terms allow keeping coordinates for up to 30 days. */
export interface Remembered { address: string; location: LatLng; at?: number }

const KEEP_MS = 30 * 24 * 3600 * 1000;
/** Entries saved before dates were added have no `at`, so they count as expired and are refreshed once. */
export const isFresh = (r: Remembered, now = Date.now()) => now - (r.at ?? 0) < KEEP_MS;

let dbp: Promise<IDBDatabase> | null = null;
function open(): Promise<IDBDatabase> {
  dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of [PLAN, MEMORY, HISTORY, ROUTES]) if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
    };
    req.onsuccess = () => {
      const db = req.result;
      // A newer version of the app in another tab needs this connection closed to upgrade the database.
      db.onversionchange = () => { db.close(); dbp = null; };
      resolve(db);
    };
    req.onerror = () => { dbp = null; reject(req.error); };
  });
  return dbp;
}

async function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const r = fn(db.transaction(store, mode).objectStore(store));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

/** "הרצל 3, רחובות" and "הרצל  3 רחובות" are the same address for memory purposes. */
export const memoryKey = (input: string) => input.replace(/[,.\-־'"׳״]/g, ' ').replace(/\s+/g, ' ').trim();

/** The route in progress: whichever of the IndexedDB copy and the localStorage backup was saved last. */
export async function loadPlan(): Promise<Plan | undefined> {
  const stored = await within(tx<unknown>(PLAN, 'readonly', (s) => s.get('current')).catch(() => undefined), 3000);
  const plan = newestPlan(normalizePlan(stored), readBackup());
  // A route saved before the backup existed gets one right away.
  if (plan) writeBackup(plan);
  return plan;
}
export const savePlan = (plan: Plan) => {
  const stamped = { ...plan, savedAt: Date.now() };
  writeBackup(stamped);
  return tx(PLAN, 'readwrite', (s) => s.put(stamped, 'current')).catch(() => undefined);
};
export const recall = (input: string) => tx<Remembered | undefined>(MEMORY, 'readonly', (s) => s.get(memoryKey(input))).catch(() => undefined);
export const remember = (input: string, r: Remembered) => tx(MEMORY, 'readwrite', (s) => s.put({ address: r.address, location: r.location, at: Date.now() }, memoryKey(input))).catch(() => undefined);

/** Days from..to (inclusive, "YYYY-MM-DD") that have any history. */
export const loadDays = (from: string, to: string) => tx<DayLog[]>(HISTORY, 'readonly', (s) => s.getAll(IDBKeyRange.bound(from, to))).catch(() => [] as DayLog[]);

/** Read and write one day in a single transaction, so two quick taps cannot overwrite each other. */
export async function updateDay(day: string, fn: (log: DayLog | undefined) => DayLog): Promise<void> {
  try {
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction(HISTORY, 'readwrite');
      const s = t.objectStore(HISTORY);
      const r = s.get(day);
      r.onsuccess = () => {
        const next = fn(r.result as DayLog | undefined);
        if (next.entries.length) s.put(next, day); else s.delete(day);
      };
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  } catch { /* storage blocked: the route still works, only the history misses this tap */ }
}

export const saveRoute = (r: ArchivedRoute) => tx(ROUTES, 'readwrite', (s) => s.put(r, r.id)).catch(() => undefined);
export const loadRoutes = () => tx<ArchivedRoute[]>(ROUTES, 'readonly', (s) => s.getAll()).catch(() => [] as ArchivedRoute[]);
