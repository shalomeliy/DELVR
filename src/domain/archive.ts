// Finished or abandoned routes, kept so "מסלול חדש" never throws away what the courier already did.
import { orderedStops } from './plan';
import type { RouteRow } from './history';
import type { Plan } from './types';

export interface ArchivedRoute {
  id: string;
  /** When the route was archived (the courier started a new one). */
  savedAt: number;
  startedAt?: number;
  stops: RouteRow[];
}

/** A snapshot of the plan, or null when nothing was done on it (no status and never started). */
export function archiveOf(plan: Plan, now = Date.now()): ArchivedRoute | null {
  const stops: RouteRow[] = orderedStops(plan).map((s) => ({ address: s.address ?? s.input, status: s.delivery, reason: s.failReason, at: s.handledAt }));
  if (!plan.startedAt && !stops.some((s) => s.status !== 'todo')) return null;
  return { id: `r${now.toString(36)}`, savedAt: now, startedAt: plan.startedAt, stops };
}

/** The time of the last status given on the route, finished or not. */
export const lastStatusAt = (r: ArchivedRoute) => Math.max(0, ...r.stops.map((s) => s.at ?? 0)) || undefined;

/** The day a route belongs to: when it started, or when it was archived if it never started. */
export const routeTime = (r: ArchivedRoute) => r.startedAt ?? r.stops.find((s) => s.at)?.at ?? r.savedAt;
