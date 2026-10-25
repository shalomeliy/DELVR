import { afterEach, describe, expect, it, vi } from 'vitest';

// A fake Chrome recognizer. Since 2026-10-20 Chrome on Android sends only interim results.
class FakeRec {
  static all: FakeRec[] = [];
  lang = ''; continuous = false; interimResults = false;
  onresult: ((e: unknown) => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  constructor() { FakeRec.all.push(this); }
  start() {}
  stop() { this.onend?.(); }
  hear(text: string) { this.onresult?.({ resultIndex: 0, results: [{ isFinal: false, 0: { transcript: text } }] }); }
}

async function load() {
  vi.resetModules();
  vi.stubGlobal('window', { webkitSpeechRecognition: FakeRec });
  vi.stubGlobal('navigator', { userAgent: 'Android' });
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} });
  return import('../src/services/speech');
}

afterEach(() => { vi.unstubAllGlobals(); FakeRec.all = []; });

describe('dictation with interim-only results (Chrome on Android)', () => {
  it('keeps the address heard before a pause when the next session starts', async () => {
    const { startDictation } = await load();
    let text = ''; let interim = '';
    const d = startDictation({ onText: (f, i) => { text = f; interim = i; }, onError: () => {}, onEnd: () => {} });
    FakeRec.all[0].hear('תל חי 13 ראשון לציון');
    FakeRec.all[0].onend!();                    // Chrome ends the session after a pause
    FakeRec.all[1].hear('ביאליק 9 ראשון לציון');
    expect(text).toBe('תל חי 13 ראשון לציון');
    expect(interim).toBe('ביאליק 9 ראשון לציון');
    d.stop();
    expect(text).toBe('תל חי 13 ראשון לציון ביאליק 9 ראשון לציון');
  });

  it('stop returns the text even if the recognizer never fires onend', async () => {
    const { startDictation } = await load();
    let text = ''; let ended = false;
    const d = startDictation({ onText: (f) => { text = f; }, onError: () => {}, onEnd: () => { ended = true; } });
    FakeRec.all[0].stop = () => {};
    FakeRec.all[0].hear('הרצל 3');
    d.stop();
    expect(ended).toBe(true);
    expect(text).toBe('הרצל 3');
  });
});
