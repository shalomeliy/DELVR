// The courier phone's calls to Supabase. The courier never writes a table: marks go through mark_stop() only.
import { supabase } from '../supabase';
import type { Mark } from '../outbox';
import { pickRoute, type CStop, type Prices } from './route';

function check<D>(r: { data: D; error: { message: string } | null }): D {
  if (r.error) throw new Error(r.error.message);
  return r.data;
}

export interface Membership { companyId: string; name: string; company: string; prices: Prices }
export interface CRoute { id: string; day: string; version: number; status: string }
export interface Reason { code: string; label: string; needs_text: boolean }

/** A phone that opens an invite gets a permanent anonymous identity, kept in localStorage. */
export async function myId(createIfMissing: boolean): Promise<string | null> {
  const { data } = await supabase().auth.getSession();
  if (data.session) return data.session.user.id;
  if (!createIfMissing) return null;
  const r = await supabase().auth.signInAnonymously();
  if (r.error) throw new Error(r.error.message);
  return r.data.user?.id ?? null;
}

export async function acceptInvite(token: string): Promise<string> {
  return check(await supabase().rpc('accept_invite', { p_token: token })) as string;
}

export async function myMembership(me: string): Promise<Membership | null> {
  const rows = check(await supabase().from('members')
    .select('company_id, name, companies(name, price_delivered, price_pasted, price_failed)')
    .eq('user_id', me).eq('role', 'courier').eq('active', true).limit(1)) as unknown as
    { company_id: string; name: string; companies: { name: string } & Prices }[] | null;
  const m = rows?.[0];
  if (!m) return null;
  const c = m.companies;
  return { companyId: m.company_id, name: m.name, company: c.name,
    prices: { price_delivered: Number(c.price_delivered), price_pasted: Number(c.price_pasted), price_failed: Number(c.price_failed) } };
}

/**
 * The route to show: today's (Israel time), else the next one sent ahead. Yesterday's route still counts while it
 * is not finished, so a shift that runs past midnight, or a route sent for the day just ended, is not lost.
 */
export async function nextRoute(me: string, today: string, yesterday: string): Promise<CRoute | null> {
  const rows = (check(await supabase().from('routes').select('id, day, version, status')
    .eq('courier_id', me).gte('day', yesterday).not('status', 'in', '(draft,done)').order('day')) ?? []) as CRoute[];
  return pickRoute(rows, today);
}

export async function routeStops(routeId: string): Promise<CStop[]> {
  return (check(await supabase().from('stops')
    .select('id, seq, input, address, lat, lng, due_at, note, delivery, fail_code, fail_reason, handled_at')
    .eq('route_id', routeId).order('seq')) ?? []) as CStop[];
}

export async function failReasons(companyId: string): Promise<Reason[]> {
  return (check(await supabase().from('fail_reasons').select('code, label, needs_text')
    .eq('company_id', companyId).eq('active', true).order('sort')) ?? []) as Reason[];
}

export async function sendMark(m: Mark) {
  check(await supabase().rpc('mark_stop', {
    p_stop: m.stopId, p_outcome: m.outcome, p_reason: m.reason, p_lat: m.lat, p_lng: m.lng,
    p_client_event_id: m.id, p_client_at: m.at, p_code: m.code,
  }));
}

/** Calls onChange for any change to this courier's routes, or to the stops of the route on screen. */
export function watch(me: string, routeId: string | null, onChange: () => void) {
  const ch = supabase().channel(`courier-${me}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'routes', filter: `courier_id=eq.${me}` }, onChange);
  if (routeId) ch.on('postgres_changes', { event: '*', schema: 'public', table: 'stops', filter: `route_id=eq.${routeId}` }, onChange);
  ch.subscribe();
  return () => { void supabase().removeChannel(ch); };
}
