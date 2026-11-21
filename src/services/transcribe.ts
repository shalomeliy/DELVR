// Sends one recording to /api/transcribe-stops and returns the raw and cleaned text.
import type { Recording } from './recorder';

export type TranscribeMode = 'stops' | 'reason';
export interface TranscribeResult { mode: TranscribeMode; raw: string; clean: string | null; cleanError?: string; ms: { transcribe: number; clean: number } }

export async function sendRecording(rec: Recording, mode: TranscribeMode, accessToken: string, fetchFn: typeof fetch = fetch): Promise<TranscribeResult> {
  let r: Response;
  try {
    r = await fetchFn(`/api/transcribe-stops?mode=${mode}`, {
      method: 'POST',
      headers: { 'Content-Type': rec.mime, Authorization: `Bearer ${accessToken}` },
      body: rec.blob,
    });
  } catch {
    throw new Error('אין חיבור לאינטרנט. ההקלטה נשמרה, נסה שוב');
  }
  const body = (await r.json().catch(() => ({}))) as Partial<TranscribeResult> & { error?: string };
  if (!r.ok) throw new Error(body.error ?? `שגיאת שרת (${r.status})`);
  return body as TranscribeResult;
}

/** The text to use: Haiku's when it worked, otherwise the raw transcript. */
export const bestText = (r: TranscribeResult) => (r.clean ?? r.raw).trim();
