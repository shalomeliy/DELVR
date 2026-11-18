// The Supabase client for company mode. Loaded only by /admin and /c, so the solo app never downloads supabase-js.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const hasSupabase = () => !!URL && !!KEY;

let client: SupabaseClient | null = null;
/** One client per tab. The session stays in localStorage, which is how a courier's phone keeps its identity. */
export function supabase(): SupabaseClient {
  if (!URL || !KEY) throw new Error('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing');
    // The admin's sign-in is kept apart from a courier's, so one phone can be both (a test, or an admin who delivers)
  // without one replacing the other. The courier keeps Supabase's default key, so existing courier phones stay in.
  const admin = location.pathname.startsWith('/admin');
  client ??= createClient(URL, KEY, { auth: { persistSession: true, autoRefreshToken: true, ...(admin ? { storageKey: 'passit-admin-auth' } : {}) } });
  return client;
}
