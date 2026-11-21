import { describe, expect, it, vi } from 'vitest';
import { checkUserLimits, extFor, handleTranscribe, tidyStops, CLEAN_MODEL, type TranscribeDeps } from '../api/_lib/transcribe';
import { pickMime } from '../src/services/recorder';

const SB = 'https://proj.supabase.co';
let userSeq = 0;

// Fake Supabase and OpenAI behind one fetch. Each test gets its own user so the per-user limits never collide.
function fakeFetch(opts: { member?: boolean; tokenOk?: boolean; sttStatus?: number; text?: string } = {}) {
  const user = `u${++userSeq}`;
  const calls: { url: string; init?: RequestInit }[] = [];
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    if (url === `${SB}/auth/v1/user`) return opts.tokenOk === false ? new Response('{}', { status: 401 }) : Response.json({ id: user });
    if (url.startsWith(`${SB}/rest/v1/members`)) return Response.json(opts.member === false ? [] : [{ role: 'courier' }]);
    if (url === 'https://api.openai.com/v1/audio/transcriptions') {
      const s = opts.sttStatus ?? 200;
      return s === 200 ? Response.json({ text: opts.text ?? 'הרצל חמש לא סליחה שמונה רחובות' }) : new Response('bad', { status: s });
    }
    throw new Error('unexpected ' + url);
  });
  return { fetch: fn as unknown as typeof fetch, calls, user };
}

function fakeHaiku(reply: string | Error, stop = 'end_turn') {
  const create = vi.fn(async (_p: unknown) => {
    if (reply instanceof Error) throw reply;
    return { stop_reason: stop, content: [{ type: 'text', text: reply }] };
  });
  return { anthropic: { messages: { create } } as unknown as TranscribeDeps['anthropic'], create };
}

const audio = (bytes = 5000): Uint8Array<ArrayBuffer> => new Uint8Array(new ArrayBuffer(bytes)).fill(7);
const req = (o: { mode?: string; type?: string; token?: string | null; body?: Uint8Array<ArrayBuffer> } = {}) =>
  new Request(`http://localhost/api/transcribe-stops${o.mode ? `?mode=${o.mode}` : ''}`, {
    method: 'POST',
    headers: { 'content-type': o.type ?? 'audio/mp4', ...(o.token === null ? {} : { authorization: `Bearer ${o.token ?? 'tok'}` }) },
    body: o.body ?? audio(),
  });

const deps = (f: ReturnType<typeof fakeFetch>, h?: ReturnType<typeof fakeHaiku>): TranscribeDeps =>
  ({ openaiKey: 'sk-test', anthropic: h?.anthropic ?? null, supabaseUrl: SB, supabaseAnonKey: 'anon', fetch: f.fetch });

describe('handleTranscribe', () => {
  it('transcribes, then cleans with Haiku into parser-ready lines', async () => {
    const f = fakeFetch();
    const h = fakeHaiku('הרצל 8, רחובות\n');
    const r = await handleTranscribe(req(), deps(f, h));
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.raw).toBe('הרצל חמש לא סליחה שמונה רחובות');
    expect(body.clean).toBe('הרצל 8 רחובות');   // the comma Haiku slipped in is removed
    const stt = f.calls.find((c) => c.url.includes('openai'))!;
    const form = stt.init!.body as FormData;
    expect(form.get('language')).toBe('he');
    expect((form.get('file') as File).name).toBe('recording.mp4');
    const params = h.create.mock.calls[0][0] as { model: string; messages: { content: string }[] };
    expect(params.model).toBe(CLEAN_MODEL);
    expect(params.messages[0].content).toBe(body.raw);
  });

  it('names a webm recording from Android with its own extension', async () => {
    const f = fakeFetch();
    await handleTranscribe(req({ type: 'audio/webm;codecs=opus' }), deps(f, fakeHaiku('x 1')));
    const form = f.calls.find((c) => c.url.includes('openai'))!.init!.body as FormData;
    expect((form.get('file') as File).name).toBe('recording.webm');
  });

  it('refuses a request with no sign-in, before calling OpenAI', async () => {
    const f = fakeFetch();
    const r = await handleTranscribe(req({ token: null }), deps(f));
    expect(r.status).toBe(401);
    expect(f.calls).toHaveLength(0);
  });

  it('refuses an expired token', async () => {
    const f = fakeFetch({ tokenOk: false });
    expect((await handleTranscribe(req(), deps(f))).status).toBe(401);
  });

  it('refuses a signed-in user who is not an active company member (e.g. any anonymous sign-in)', async () => {
    const f = fakeFetch({ member: false });
    const r = await handleTranscribe(req(), deps(f));
    expect(r.status).toBe(403);
    expect(f.calls.some((c) => c.url.includes('openai'))).toBe(false);
  });

  it('checks membership with the caller token, not a server key', async () => {
    const f = fakeFetch();
    await handleTranscribe(req({ token: 'abc' }), deps(f, fakeHaiku('x 1')));
    const m = f.calls.find((c) => c.url.includes('/rest/v1/members'))!;
    expect((m.init!.headers as Record<string, string>).Authorization).toBe('Bearer abc');
    expect(m.url).toContain('active=eq.true');
  });

  it('falls back to the raw text when Haiku fails', async () => {
    const r = await handleTranscribe(req(), deps(fakeFetch(), fakeHaiku(new Error('overloaded'))));
    const body = await r.json();
    expect(r.status).toBe(200);
    expect(body.clean).toBeNull();
    expect(body.cleanError).toBe('overloaded');
    expect(body.raw).toBeTruthy();
  });

  it('treats a Haiku refusal as a failed clean, not as text', async () => {
    const body = await (await handleTranscribe(req(), deps(fakeFetch(), fakeHaiku('', 'refusal')))).json();
    expect(body.clean).toBeNull();
  });

  it('works without an Anthropic key, returning raw only', async () => {
    const body = await (await handleTranscribe(req(), deps(fakeFetch()))).json();
    expect(body.clean).toBeNull();
    expect(body.cleanError).toMatch(/ANTHROPIC_API_KEY/);
  });

  it('cleans a failure reason into one sentence, with its own prompt', async () => {
    const h = fakeHaiku('הלקוח לא היה בבית\nוהשכן לא ענה.');
    const body = await (await handleTranscribe(req({ mode: 'reason' }), deps(fakeFetch({ text: 'אממ הלקוח לא היה בבית' }), h))).json();
    expect(body.mode).toBe('reason');
    expect(body.clean).toBe('הלקוח לא היה בבית והשכן לא ענה.');
    expect((h.create.mock.calls[0][0] as { system: string }).system).toMatch(/failed/);
  });

  it('rejects unknown audio types, empty and oversized recordings', async () => {
    expect((await handleTranscribe(req({ type: 'video/quicktime' }), deps(fakeFetch()))).status).toBe(415);
    expect((await handleTranscribe(req({ body: audio(10) }), deps(fakeFetch()))).status).toBe(400);
    expect((await handleTranscribe(req({ body: audio(4 * 1024 * 1024 + 1) }), deps(fakeFetch()))).status).toBe(413);
  });

  it('reports an OpenAI failure as 502 with its status', async () => {
    const r = await handleTranscribe(req(), deps(fakeFetch({ sttStatus: 429 })));
    expect(r.status).toBe(502);
    expect((await r.json()).error).toMatch(/429/);
  });

  it('says what is missing when the server has no OpenAI key', async () => {
    const r = await handleTranscribe(req(), { ...deps(fakeFetch()), openaiKey: undefined });
    expect(r.status).toBe(500);
    expect((await r.json()).error).toMatch(/OPENAI_API_KEY/);
  });

  it('returns an empty clean text for silence without calling Haiku', async () => {
    const h = fakeHaiku('should not be used');
    const body = await (await handleTranscribe(req(), deps(fakeFetch({ text: '  ' }), h))).json();
    expect(body.clean).toBe('');
    expect(h.create).not.toHaveBeenCalled();
  });
});

describe('limits and helpers', () => {
  it('limits recordings per user in a short window', () => {
    const now = 1_000_000_000_000;
    for (let i = 0; i < 20; i++) checkUserLimits('burst', now + i);
    expect(() => checkUserLimits('burst', now + 30)).toThrow(/ברצף/);
    expect(() => checkUserLimits('other', now + 30)).not.toThrow();
  });

  it('maps recording types to file extensions OpenAI accepts', () => {
    expect(extFor('audio/mp4')).toBe('mp4');
    expect(extFor('audio/webm;codecs=opus')).toBe('webm');
    expect(extFor('audio/x-m4a')).toBe('m4a');
    expect(extFor('text/plain')).toBeNull();
  });

  it('tidies Haiku output: no commas, bullets or blank lines', () => {
    expect(tidyStops('1. הרצל 8, רחובות\n\n- ויצמן 14 ,פתח תקווה \n')).toBe('הרצל 8 רחובות\nויצמן 14 פתח תקווה');
  });

  it('picks mp4 on iPhone Safari and webm on Android Chrome', () => {
    const all = () => true;
    expect(pickMime(all, 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 Version/18.5 Mobile/15E148 Safari/604.1')).toBe('audio/mp4');
    expect(pickMime(all, 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36')).toBe('audio/webm;codecs=opus');
    expect(pickMime((t) => t === 'audio/mp4', 'Mozilla/5.0 (Linux; Android 14) Chrome/131.0')).toBe('audio/mp4');
    expect(pickMime(() => false, 'x')).toBe('');
  });
});
