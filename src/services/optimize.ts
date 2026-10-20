import type { Optimized, Plan } from '../domain/types';

export async function optimizePlan(plan: Plan, signal?: AbortSignal): Promise<Optimized> {
  const stops = plan.stops.filter((s) => s.delivery === 'todo' && s.location);
  if (!plan.start.location) throw new Error('חסרה נקודת יציאה מאומתת');
  const res = await fetch('/api/optimize', {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      origin: plan.start.location,
      destination: plan.end?.location ?? null,
      stops: stops.map((s) => ({ id: s.id, ...s.location!, order: s.order })),
    }),
  });
  const data = await res.json().catch(() => ({ error: 'תשובה לא תקינה מהשרת' }));
  if (!res.ok) throw new Error(data.error ?? `שגיאת שרת ${res.status}`);
  return { ...data, at: Date.now() };
}
