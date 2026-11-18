import { hasSupabase } from './supabase';

/** Shown in company mode until the Supabase keys are set. */
export function MissingKeys() {
  if (hasSupabase()) return null;
  return <div className="co-msg bad" role="alert">חסרים מפתחות Supabase. הוסף VITE_SUPABASE_URL ו-VITE_SUPABASE_ANON_KEY ב-Vercel (או ב-.env.local) ופרסם מחדש.</div>;
}
