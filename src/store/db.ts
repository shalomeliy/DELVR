// IndexedDB on the device: the current plan and the courier's corrected addresses. No server database in v1.
import type { LatLng, Plan } from '../domain/types';

const DB = 'delvr', VERSION = 1;
const PLAN = 'plan', MEMORY = 'addressMemory';

/** at: when Google last confirmed it. Google's terms allow keeping coordinates for up to 30 days. */
export interface Remembered { address: string; location: LatLng; at?: number }

const KEEP_MS = 30 * 24 * 3600 * 1000;
/** Entries saved before dates were added have no `at`, so they count as expired and are refreshed once. */
export const isFresh = (r: Remembered, now = Date.now()) => now - (r.at ?? 0) < KEEP_MS;

let dbp: Promise<IDBDatabase> | null = null;
function open(): Promise<IDBDatabase> {
  dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => { req.result.createObjectStore(PLAN); req.result.createObjectStore(MEMORY); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
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

export const loadPlan = () => tx<Plan | undefined>(PLAN, 'readonly', (s) => s.get('current')).catch(() => undefined);
export const savePlan = (plan: Plan) => tx(PLAN, 'readwrite', (s) => s.put(plan, 'current')).catch(() => undefined);
export const recall = (input: string) => tx<Remembered | undefined>(MEMORY, 'readonly', (s) => s.get(memoryKey(input))).catch(() => undefined);
export const remember = (input: string, r: Remembered) => tx(MEMORY, 'readwrite', (s) => s.put({ address: r.address, location: r.location, at: Date.now() }, memoryKey(input))).catch(() => undefined);
