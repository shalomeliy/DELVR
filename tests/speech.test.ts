import { afterEach, describe, expect, it, vi } from 'vitest';

// A fake Chrome recognizer whose start() can be told to throw, like Android does right after onend.
class FakeRec {
  static all: FakeRec[] = [];
  static failStarts = 0;
  lang = ''; continuous = false; interimResults = false;
  onresult: ((e: unknown) => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  constructor() { FakeRec.all.push(this); }
  start() { if (FakeRec.failStarts > 0) { FakeRec.failStarts--; throw new Error('already started'); } }
  aborted = false;
  stop() { this.onend?.(); }
  abort() { this.aborted = true; }
  hear(text: string) { this.onresult?.({ resultIndex: 0, results: [{ isFinal: false, 0: { transcript: text } }] }); }
  say(text: string) { this.onresult?.({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: text } }] }); }
}

async function load() {
  vi.resetModules();
  vi.stubGlobal('window', { webkitSpeechRecognition: FakeRec });
  vi.stubGlobal('navigator', { userAgent: 'Android' });
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} });
  return import('../src/services/speech');
}

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); FakeRec.all = []; FakeRec.failStarts = 0; });

describe('dictation restarts on Android', () => {
  it('keeps listening after the first address even when the restart is refused at first', async () => {
    vi.useFakeTimers();
    const { startDictation } = await load();
    let text = ''; let ended = false;
    startDictation({ onText: (f) => { text = f; }, onError: () => {}, onEnd: () => { ended = true; } });
    FakeRec.all[0].say('הרצל 3');
    FakeRec.failStarts = 2;
    FakeRec.all[0].onend!();
    await vi.advanceTimersByTimeAsync(2000);
    expect(ended).toBe(false);
    const live = FakeRec.all[FakeRec.all.length - 1];
    live.say('ויצמן 5');
    expect(text).toBe('הרצל 3 ויצמן 5');
  });

  it('stop between two sessions ends with the text so far', async () => {
    vi.useFakeTimers();
    const { startDictation } = await load();
    let text = ''; let ended = false;
    const d = startDictation({ onText: (f) => { text = f; }, onError: () => {}, onEnd: () => { ended = true; } });
    FakeRec.all[0].say('הרצל 3');
    FakeRec.all[0].onend!();
    d.stop();
    await vi.advanceTimersByTimeAsync(1000);
    expect(ended).toBe(true);
    expect(text).toBe('הרצל 3');
    expect(FakeRec.all).toHaveLength(1);
  });

  it('replaces a recognizer that goes quiet after interim-only results, keeping what it heard', async () => {
    vi.useFakeTimers();
    const { startDictation } = await load();
    let text = ''; let interim = '';
    const d = startDictation({ onText: (f, i) => { text = f; interim = i; }, onError: () => {}, onEnd: () => {} });
    FakeRec.all[0].hear('הרצל 3');
    expect(interim).toBe('הרצל 3');
    await vi.advanceTimersByTimeAsync(2500);   // Chrome went silent: no final, no onend
    expect(FakeRec.all[0].aborted).toBe(true);
    expect(FakeRec.all.length).toBeGreaterThan(1);
    expect(text).toBe('הרצל 3');
    FakeRec.all[FakeRec.all.length - 1].hear('ויצמן 5');
    d.stop();
    expect(text).toBe('הרצל 3 ויצמן 5');
  });

  it('stop keeps interim text even when the recognizer never fires onend', async () => {
    const { startDictation } = await load();
    let text = ''; let ended = false;
    const d = startDictation({ onText: (f) => { text = f; }, onError: () => {}, onEnd: () => { ended = true; } });
    FakeRec.all[0].stop = () => {};   // stuck: stop() does nothing
    FakeRec.all[0].hear('תל חי 13');
    d.stop();
    expect(ended).toBe(true);
    expect(text).toBe('תל חי 13');
  });
});
