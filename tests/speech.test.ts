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
  stop() { this.onend?.(); }
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
});
