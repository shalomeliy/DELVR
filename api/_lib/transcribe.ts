// Voice to text for the courier: OpenAI turns the recording into Hebrew text, then Claude Haiku cleans it.
// Pure logic with injected fetch and Anthropic client, so it runs in the Vercel function, the Vite dev server and tests alike.
import type Anthropic from '@anthropic-ai/sdk';
import { CITIES } from '../../src/domain/cities.js';
import { HttpError } from './optimize.js';

/** stops: a list of addresses, one per line for parser.js. reason: one short failure reason for the daily report. */
export type TranscribeMode = 'stops' | 'reason';

export interface TranscribeDeps {
  openaiKey?: string;
  anthropic?: Pick<Anthropic, 'messages'> | null;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  fetch?: typeof fetch;
}

export interface TranscribeOutput {
  mode: TranscribeMode;
  raw: string;
  /** null when Haiku failed or refused; the caller then uses raw. */
  clean: string | null;
  cleanError?: string;
  ms: { transcribe: number; clean: number };
}

export const STT_MODEL = 'gpt-4o-mini-transcribe';
export const CLEAN_MODEL = 'claude-haiku-5-5';
/** Vercel refuses request bodies over 4.5 MB, so the app keeps recordings under this. */
export const MAX_BYTES = 4 * 1024 * 1024;
const MIN_BYTES = 1000;

// OpenAI reads the format from the file name, so each recording type gets its own extension.
const EXT: Record<string, string> = {
  'audio/mp4': 'mp4', 'audio/x-m4a': 'm4a', 'audio/m4a': 'm4a', 'audio/aac': 'm4a',
  'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/mpeg': 'mp3',
};
export const extFor = (contentType: string) => EXT[contentType.split(';')[0].trim().toLowerCase()] ?? null;

const CITY_NAMES = CITIES.map((c) => c[0]).join(', ');
export const STT_PROMPT = {
  stops: `שליח מקריא רשימת כתובות למשלוח בישראל: רחוב, מספר בית, ולפעמים עיר, דירה, קומה או כניסה. למשל: הרצל 8 רחובות, ויצמן 14 פתח תקווה דירה 3. ערים: ${CITY_NAMES}.`,
  reason: 'שליח מסביר בקצרה למה משלוח לא נמסר: לא היה בבית, לא ענה, אין גישה, סירב, ביקש לתאם מחדש.',
} as const;

export const CLEAN_PROMPT = {
  stops: `You clean a Hebrew speech transcript of a courier reading delivery addresses in Israel.
Return only the addresses, one per line, in the form: street number city
Rules:
- No commas anywhere. No numbering, bullets, quotes or any other text.
- Remove filler words and greetings ("אממ", "יאללה", "אוקיי", "הבאה", "אחר כך").
- Apply the courier's own corrections: "הרצל 5 לא סליחה 8" becomes "הרצל 8". "לא, בעצם" and "טעיתי" also replace what came right before.
- Write numbers as digits: "חמש" -> 5, "שלוש עשרה" -> 13, "מאה עשרים" -> 120. A house letter stays attached: "17 א" -> 17א.
- Keep apartment, floor, entrance and door code after the number with their Hebrew word: "דירה 4", "קומה 2", "כניסה ב", "קוד 1234".
- Write the city only if the courier said it for that address. Never add or guess a city, street or number that was not said.
- Keep street names exactly as heard, including streets named after cities ("שדרות ירושלים 12").
- If no address was said, return an empty answer.`,
  reason: `You clean a short Hebrew speech transcript where a courier explains why a delivery failed.
Return one short, clear Hebrew sentence for a manager's daily report.
Rules:
- Remove filler words, repetitions and self-corrections; keep the courier's meaning and every fact (names, times, numbers).
- Add basic punctuation. No quotes, no prefix like "סיבה:", no explanation of what you changed.
- Never add facts that were not said. If nothing meaningful was said, return an empty answer.`,
} as const;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}

/**
 * Only an active company member (admin or courier) may spend the OpenAI and Anthropic credit.
 * The Supabase access token is checked with Supabase itself, then the members table is read with that
 * token, so row security decides what the caller can see. No service key is needed.
 */
export async function requireMember(request: Request, d: TranscribeDeps): Promise<string> {
  const f = d.fetch ?? fetch;
  if (!d.supabaseUrl || !d.supabaseAnonKey) throw new HttpError(500, 'השרת לא מוגדר: חסר VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY');
  const token = /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization') ?? '')?.[1];
  if (!token) throw new HttpError(401, 'צריך להתחבר כדי להשתמש בהקלטה');
  const headers = { apikey: d.supabaseAnonKey, Authorization: `Bearer ${token}` };
  const base = d.supabaseUrl.replace(/\/+$/, '');
  const u = await f(`${base}/auth/v1/user`, { headers });
  if (!u.ok) throw new HttpError(401, 'החיבור פג. התחבר מחדש');
  const id = ((await u.json()) as { id?: string }).id;
  if (!id) throw new HttpError(401, 'החיבור פג. התחבר מחדש');
  const m = await f(`${base}/rest/v1/members?select=role&user_id=eq.${encodeURIComponent(id)}&active=eq.true&limit=1`, { headers });
  const rows = m.ok ? ((await m.json()) as unknown[]) : [];
  if (!Array.isArray(rows) || rows.length === 0) throw new HttpError(403, 'ההקלטה פתוחה רק לשליחים ומנהלים של חברה');
  return id;
}

// Best-effort guard per signed-in user, on top of the spending caps in the OpenAI and Anthropic accounts.
// Counters live in one function instance's memory, so they reset on cold starts.
const PER_10_MIN = 20, PER_DAY = 200;
const usage = new Map<string, number[]>();
export function checkUserLimits(user: string, now = Date.now()) {
  const recent = (usage.get(user) ?? []).filter((t) => now - t < 86_400_000);
  if (recent.length >= PER_DAY) throw new HttpError(429, 'הגעת לתקרת ההקלטות היומית');
  if (recent.filter((t) => now - t < 600_000).length >= PER_10_MIN) throw new HttpError(429, 'יותר מדי הקלטות ברצף. חכה כמה דקות');
  recent.push(now); usage.set(user, recent);
}

export async function transcribeAudio(audio: ArrayBuffer, contentType: string, mode: TranscribeMode, d: TranscribeDeps): Promise<string> {
  const f = d.fetch ?? fetch;
  const ext = extFor(contentType);
  if (!ext) throw new HttpError(415, 'פורמט הקלטה לא נתמך');
  const form = new FormData();
  form.append('file', new Blob([audio], { type: contentType.split(';')[0] }), `recording.${ext}`);
  form.append('model', STT_MODEL);
  form.append('language', 'he');
  form.append('prompt', STT_PROMPT[mode]);
  form.append('response_format', 'json');
  const r = await f('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${d.openaiKey}` }, body: form });
  if (!r.ok) {
    const detail = await r.text().catch(() => '');
    throw new HttpError(502, `התמלול נכשל (${r.status})${detail ? ': ' + detail.slice(0, 200) : ''}`);
  }
  return String(((await r.json()) as { text?: string }).text ?? '').trim();
}

/** Haiku's answer, made safe for parser.js: no commas, one trimmed address per line, no empty lines. */
export function tidyStops(text: string): string {
  return text.split('\n')
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').replace(/[,،]/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

export async function cleanText(raw: string, mode: TranscribeMode, anthropic: Pick<Anthropic, 'messages'>): Promise<string> {
  const msg = await anthropic.messages.create({
    model: CLEAN_MODEL,
    max_tokens: 1024,
    // A short rewrite: no thinking and low effort keep the courier's wait short.
    thinking: { type: 'disabled' },
    output_config: { effort: 'low' },
    system: CLEAN_PROMPT[mode],
    messages: [{ role: 'user', content: raw }],
  });
  if (msg.stop_reason === 'refusal') throw new Error('refusal');
  const text = msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim();
  return mode === 'stops' ? tidyStops(text) : text.replace(/\s+/g, ' ');
}

export async function handleTranscribe(request: Request, d: TranscribeDeps): Promise<Response> {
  try {
    if (request.method !== 'POST') throw new HttpError(405, 'POST בלבד');
    if (!d.openaiKey) throw new HttpError(500, 'השרת לא מוגדר: חסר OPENAI_API_KEY');
    const mode: TranscribeMode = new URL(request.url).searchParams.get('mode') === 'reason' ? 'reason' : 'stops';
    const user = await requireMember(request, d);
    const type = request.headers.get('content-type') ?? '';
    if (!extFor(type)) throw new HttpError(415, 'פורמט הקלטה לא נתמך');
    const declared = Number(request.headers.get('content-length') ?? 0);
    if (declared > MAX_BYTES) throw new HttpError(413, 'ההקלטה ארוכה מדי');
    const audio = await request.arrayBuffer();
    if (audio.byteLength > MAX_BYTES) throw new HttpError(413, 'ההקלטה ארוכה מדי');
    if (audio.byteLength < MIN_BYTES) throw new HttpError(400, 'ההקלטה ריקה. נסה שוב');
    checkUserLimits(user);

    const t0 = Date.now();
    const raw = await transcribeAudio(audio, type, mode, d);
    const t1 = Date.now();
    const out: TranscribeOutput = { mode, raw, clean: null, ms: { transcribe: t1 - t0, clean: 0 } };
    if (!raw) { out.clean = ''; return json(200, out); }
    if (!d.anthropic) out.cleanError = 'חסר ANTHROPIC_API_KEY';
    else {
      try { out.clean = await cleanText(raw, mode, d.anthropic); }
      catch (e) { out.cleanError = (e as Error).message || 'הניקוי נכשל'; }
    }
    out.ms.clean = Date.now() - t1;
    return json(200, out);
  } catch (e) {
    if (e instanceof HttpError) return json(e.status, { error: e.message });
    return json(502, { error: 'התמלול נכשל' });
  }
}
