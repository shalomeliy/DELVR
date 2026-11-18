// Every call company mode makes to Supabase. Screens import from here, never from supabase-js directly.
import type { SendPayload } from './send';
import type { DayRoute } from './calendar';
import { cleanName, cleanPhone } from './people';
import { supabase } from './supabase';

export interface Company { id: string; name: string }
export interface Courier { userId: string; name: string; active: boolean; phone: string | null }
export interface Invite { token: string; name: string; expiresAt: string; replaces: string | null; createdAt?: string }

/** Supabase answers with an error object; turn it into a thrown Error with its message. */
type Res = { data: unknown; error: { message: string } | null };
function check<R extends Res>(r: R): Exclude<(R extends { error: null } ? R['data'] : never), undefined> {
  if (r.error) throw new Error(r.error.message);
  return r.data as never;
}

export const auth = {
  /** The admin's session. An anonymous one belongs to a courier phone and never counts here. */
  session: async () => { const s = check(await supabase().auth.getSession()).session; return s && !s.user.is_anonymous ? s : null; },
  onChange: (fn: () => void) => supabase().auth.onAuthStateChange(() => fn()).data.subscription,
  signIn: async (email: string, password: string) => { check(await supabase().auth.signInWithPassword({ email, password })); },
  /** Returns true when Supabase wants the email confirmed first. */
  signUp: async (email: string, password: string) =>
    !check(await supabase().auth.signUp({ email, password, options: { emailRedirectTo: `${location.origin}/admin` } })).session,
  signOut: async () => { await supabase().auth.signOut(); },
};

/** The company this user administers, or null if they have none yet. */
export async function myAdminCompany(): Promise<Company | null> {
  const s = await auth.session();
  if (!s) return null;
  const rows = check(await supabase().from('members').select('company_id, companies(id, name)')
    .eq('user_id', s.user.id).eq('role', 'admin').eq('active', true).limit(1));
  const c = (rows?.[0] as unknown as { companies: Company | null } | undefined)?.companies;
  return c ?? null;
}

export async function createCompany(name: string, adminName: string): Promise<string> {
  return check(await supabase().rpc('create_company', { p_name: name, p_admin_name: adminName })) as string;
}

export async function listCouriers(companyId: string): Promise<Courier[]> {
  // '*' rather than a column list, so the screen still loads before migration 0004 (phone) has run.
  const rows = check(await supabase().from('members').select('*')
    .eq('company_id', companyId).eq('role', 'courier').order('name'));
  return ((rows ?? []) as { user_id: string; name: string; active: boolean; phone?: string | null }[])
    .map((r) => ({ userId: r.user_id, name: r.name, active: r.active, phone: r.phone ?? null }));
}

/** Links not opened yet. Expired ones are listed too, so the admin sees why a courier could not join. */
export async function listOpenInvites(companyId: string): Promise<Invite[]> {
  const rows = check(await supabase().from('invites').select('token, name, expires_at, replaces')
    .eq('company_id', companyId).is('used_by', null).order('expires_at', { ascending: false }));
  return ((rows ?? []) as { token: string; name: string; expires_at: string; replaces: string | null }[])
    .map((r) => ({ token: r.token, name: r.name, expiresAt: r.expires_at, replaces: r.replaces }));
}

export async function createInvite(companyId: string, name: string, replaces: string | null = null): Promise<string> {
  return check(await supabase().rpc('create_invite', { p_company: companyId, p_name: name, p_replaces: replaces })) as string;
}

export async function cancelInvite(token: string) {
  check(await supabase().from('invites').delete().eq('token', token));
}

/** The admin changes a courier's name or phone. The courier's phone shows the new name on its next load. */
export async function updateCourier(companyId: string, userId: string, name: string, phone: string) {
  const clean = cleanName(name);
  if (!clean) throw new Error('צריך שם');
  const tel = cleanPhone(phone);
  if (tel === false) throw new Error('מספר טלפון לא תקין');
  check(await supabase().from('members').update({ name: clean, phone: tel }).eq('company_id', companyId).eq('user_id', userId).eq('role', 'courier'));
}

export async function setCourierActive(companyId: string, userId: string, active: boolean) {
  check(await supabase().from('members').update({ active }).eq('company_id', companyId).eq('user_id', userId));
}

export interface LiveStop {
  id: string; seq: number; input: string; address: string | null; lat: number | null; lng: number | null; due_at: string | null;
  delivery: 'todo' | 'delivered' | 'pasted' | 'failed'; fail_code: string | null; fail_reason: string | null;
  handled_at: string | null; handled_lat: number | null; handled_lng: number | null;
  /** Set after migration 0004, once the courier photographed the door. */
  proof_path?: string | null;
  /** The delivery number (migration 0005). */
  ref?: number | null;
}
export interface ServerRoute {
  id: string; status: string; version: number; sentAt: string | null; stops: number; marked: number;
  start: { lat?: number; lng?: number } | null; polyline: string | null; list: LiveStop[];
}

/** The route already on the server for this courier and day, if any. */
export async function getRoute(companyId: string, courierId: string, day: string): Promise<ServerRoute | null> {
  const rows = check(await supabase().from('routes')
    .select('id, status, version, sent_at, start, optimized, stops(*)')
    .eq('company_id', companyId).eq('courier_id', courierId).eq('day', day).limit(1));
  const r = (rows ?? [])[0] as { id: string; status: string; version: number; sent_at: string | null; start: ServerRoute['start'];
    optimized: { polyline?: string } | null; stops: LiveStop[] } | undefined;
  if (!r) return null;
  const list = [...r.stops].sort((a, b) => a.seq - b.seq);
  return { id: r.id, status: r.status, version: r.version, sentAt: r.sent_at, stops: list.length, marked: list.filter((s) => s.delivery !== 'todo').length,
    start: r.start, polyline: r.optimized?.polyline ?? null, list };
}

/** Every route of the company in a date range, with its stops: the calendar. */
export async function listRoutes(companyId: string, from: string, to: string): Promise<DayRoute[]> {
  const rows = check(await supabase().from('routes')
    .select('id, courier_id, day, status, version, sent_at, stops(*)')
    .eq('company_id', companyId).gte('day', from).lte('day', to).order('day'));
  return ((rows ?? []) as { id: string; courier_id: string | null; day: string; status: string; version: number; sent_at: string | null; stops: LiveStop[] }[])
    .map((r) => ({ id: r.id, courierId: r.courier_id, day: r.day, status: r.status, version: r.version, sentAt: r.sent_at, list: [...r.stops].sort((a, b) => a.seq - b.seq) }));
}

/** Calls onChange whenever this route or its stops change: the courier's marks arrive here within seconds. */
export function watchRoute(routeId: string, onChange: () => void) {
  const ch = supabase().channel(`admin-route-${routeId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'stops', filter: `route_id=eq.${routeId}` }, onChange)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'routes', filter: `id=eq.${routeId}` }, onChange)
    .subscribe();
  return () => { void supabase().removeChannel(ch); };
}

export async function sendRoute(companyId: string, courierId: string, day: string, vehicle: 'scooter' | 'car', p: SendPayload) {
  const r = check(await supabase().rpc('send_route', {
    p_company: companyId, p_courier: courierId, p_day: day, p_start: p.start, p_end_mode: p.endMode, p_end: p.end,
    p_vehicle: vehicle, p_optimized: p.optimized, p_stops: p.stops,
  })) as { version: number; sent_at: string };
  return r;
}

/** A short-lived link to a proof photo, for the admin to open. */
export async function proofUrl(path: string): Promise<string> {
  const r = await supabase().storage.from('proofs').createSignedUrl(path, 600);
  if (r.error) throw new Error(r.error.message);
  return r.data.signedUrl;
}

export interface FoundStop extends LiveStop { day: string; courierId: string | null }

/** Admin search across all the company's sent routes: by delivery number, address words and/or status. Newest day first. */
export async function searchStops(companyId: string, q: { ref: number | null; text: string; status: LiveStop['delivery'] | 'all' }): Promise<FoundStop[]> {
  let req = supabase().from('stops').select('*, routes!inner(company_id, day, courier_id, status)')
    .eq('routes.company_id', companyId).neq('routes.status', 'draft');
  if (q.ref) req = req.eq('ref', q.ref);
  for (const w of q.text.split(' ').filter(Boolean)) req = req.or(`address.ilike.*${w}*,input.ilike.*${w}*`);
  if (q.status !== 'all') req = req.eq('delivery', q.status);
  const rows = check(await req.limit(300)) as (LiveStop & { routes: { day: string; courier_id: string | null } })[] | null;
  return (rows ?? []).map(({ routes, ...x }) => ({ ...x, day: routes.day, courierId: routes.courier_id }))
    .sort((a, b) => b.day.localeCompare(a.day) || a.seq - b.seq);
}

/** The photo itself, for the ZIP in the daily report. */
export async function proofBytes(path: string): Promise<Uint8Array> {
  const r = await supabase().storage.from('proofs').download(path);
  if (r.error) throw new Error(r.error.message);
  return new Uint8Array(await r.data.arrayBuffer());
}
