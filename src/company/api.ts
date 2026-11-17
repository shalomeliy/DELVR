// Every call company mode makes to Supabase. Screens import from here, never from supabase-js directly.
import type { SendPayload } from './send';
import { supabase } from './supabase';

export interface Company { id: string; name: string }
export interface Courier { userId: string; name: string; active: boolean }
export interface Invite { token: string; name: string; expiresAt: string; replaces: string | null; createdAt?: string }

/** Supabase answers with an error object; turn it into a thrown Error with its message. */
type Res = { data: unknown; error: { message: string } | null };
function check<R extends Res>(r: R): Exclude<(R extends { error: null } ? R['data'] : never), undefined> {
  if (r.error) throw new Error(r.error.message);
  return r.data as never;
}

export const auth = {
  session: async () => check(await supabase().auth.getSession()).session,
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
  const rows = check(await supabase().from('members').select('user_id, name, active')
    .eq('company_id', companyId).eq('role', 'courier').order('name'));
  return ((rows ?? []) as { user_id: string; name: string; active: boolean }[]).map((r) => ({ userId: r.user_id, name: r.name, active: r.active }));
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

export async function setCourierActive(companyId: string, userId: string, active: boolean) {
  check(await supabase().from('members').update({ active }).eq('company_id', companyId).eq('user_id', userId));
}

export interface ServerRoute { id: string; status: string; version: number; sentAt: string | null; stops: number; marked: number }

/** The route already on the server for this courier and day, if any. */
export async function getRoute(companyId: string, courierId: string, day: string): Promise<ServerRoute | null> {
  const rows = check(await supabase().from('routes').select('id, status, version, sent_at, stops(delivery)')
    .eq('company_id', companyId).eq('courier_id', courierId).eq('day', day).limit(1));
  const r = (rows ?? [])[0] as { id: string; status: string; version: number; sent_at: string | null; stops: { delivery: string }[] } | undefined;
  if (!r) return null;
  return { id: r.id, status: r.status, version: r.version, sentAt: r.sent_at, stops: r.stops.length, marked: r.stops.filter((s) => s.delivery !== 'todo').length };
}

export async function sendRoute(companyId: string, courierId: string, day: string, vehicle: 'scooter' | 'car', p: SendPayload) {
  const r = check(await supabase().rpc('send_route', {
    p_company: companyId, p_courier: courierId, p_day: day, p_start: p.start, p_end_mode: p.endMode, p_end: p.end,
    p_vehicle: vehicle, p_optimized: p.optimized, p_stops: p.stops,
  })) as { version: number; sent_at: string };
  return r;
}
