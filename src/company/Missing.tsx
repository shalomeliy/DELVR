import { hasSupabase } from './supabase';

/** Shown in company mode until the Supabase keys are set. */
export function MissingKeys() {
  if (hasSupabase()) return null;
  return <div className="banner bad">חסרים מפתחות Supabase. הוסף VITE_SUPABASE_URL ו-VITE_SUPABASE_ANON_KEY</div>;
}
