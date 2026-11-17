// Keeps the route the courier is working on through a refresh and through a new app version.
// The plan lives in IndexedDB and a copy in localStorage, so losing one of them (blocked, slow
// to open during an upgrade, cleared) still brings the route back.
import type { Plan, Stop } from '../domain/types';

// Old 'delvr' prefix on purpose: renaming would lose what is already saved on phones.
export const BACKUP_KEY = 'delvr_plan';
export const DRAFT_KEY = 'delvr_draft';

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const isPlace = (v: unknown) => isObj(v) && typeof v.input === 'string';

/**
 * Accepts a plan saved by any earlier version and returns one this version can show, or undefined
 * when there is nothing usable. Fields added in later versions get their defaults instead of crashing.
 */
export function normalizePlan(raw: unknown): Plan | undefined {
  if (!isObj(raw)) return undefined;
  const stops: Stop[] = (Array.isArray(raw.stops) ? raw.stops : [])
    .filter((s): s is Record<string, unknown> => isObj(s) && typeof s.id === 'string' && typeof s.input === 'string')
    .map((s) => ({
      ...(s as unknown as Stop),
      spoken: typeof s.spoken === 'string' ? s.spoken : (s.input as string),
      city: typeof s.city === 'string' ? s.city : null,
      verify: s.verify === 'ok' || s.verify === 'needs_fix' || s.verify === 'pending' ? s.verify : s.location ? 'ok' : 'pending',
      order: s.order === 'first' || s.order === 'last' ? s.order : 'auto',
      delivery: s.delivery === 'delivered' || s.delivery === 'pasted' || s.delivery === 'failed' ? s.delivery : 'todo',
    }));
  const opt = isObj(raw.optimized) && Array.isArray(raw.optimized.order) && Array.isArray(raw.optimized.legs) ? (raw.optimized as unknown as Plan['optimized']) : undefined;
  return {
    ...(raw as unknown as Plan),
    start: isPlace(raw.start) ? (raw.start as unknown as Plan['start']) : { input: '' },
    end: isPlace(raw.end) ? (raw.end as unknown as Plan['end']) : null,
    stops,
    optimized: opt,
  };
}

/** The more recently saved of two copies; on a tie (or no dates) the IndexedDB one wins. */
export function newestPlan(db: Plan | undefined, backup: Plan | undefined): Plan | undefined {
  if (!db) return backup;
  if (!backup) return db;
  return (backup.savedAt ?? 0) > (db.savedAt ?? 0) ? backup : db;
}

export function readBackup(): Plan | undefined {
  try { const s = localStorage.getItem(BACKUP_KEY); return s ? normalizePlan(JSON.parse(s)) : undefined; } catch { return undefined; }
}

/** Synchronous, so it is already written when the page reloads for a new version a moment later. */
export function writeBackup(plan: Plan): void {
  try { localStorage.setItem(BACKUP_KEY, JSON.stringify(plan)); } catch { /* storage full or blocked: IndexedDB still has it */ }
}

/** Addresses typed or dictated but not yet added to the list. */
export function readDraft(): string {
  try { return localStorage.getItem(DRAFT_KEY) ?? ''; } catch { return ''; }
}
export function writeDraft(text: string): void {
  try { if (text.trim()) localStorage.setItem(DRAFT_KEY, text); else localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
}

/** Resolves undefined when the promise takes longer than ms (an IndexedDB upgrade that never opens). */
export const within = <T,>(p: Promise<T>, ms: number): Promise<T | undefined> =>
  Promise.race([p, new Promise<undefined>((r) => setTimeout(() => r(undefined), ms))]);
