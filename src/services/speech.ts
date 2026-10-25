import { appendSession, mergeResults } from '../domain/transcript';
import { logInfo, logWarn } from './log';

// Chrome's built-in recognizer in Hebrew. It stops after silence, so we restart it until the courier presses stop.
type Rec = {
  lang: string; continuous: boolean; interimResults: boolean;
  start(): void; stop(): void; abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};

const SR = (window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec }).SpeechRecognition
  ?? (window as unknown as { webkitSpeechRecognition?: new () => Rec }).webkitSpeechRecognition;

// Android's continuous mode duplicates results, so there we listen one phrase at a time and restart.
const ANDROID = /Android/i.test(navigator.userAgent);

export const speechSupported = () => !!SR;

/** Silence after which a recognizer is treated as stuck and replaced. */
const STUCK_MS = 1500;

export interface Dictation { stop(): void }

export function startDictation(handlers: { onText: (finalText: string, interim: string) => void; onError: (msg: string) => void; onEnd: () => void }): Dictation {
  if (!SR) throw new Error('הדפדפן הזה לא תומך בהקלטה. פתח ב-Chrome');
  let committed = '';   // text from finished sessions
  let session = '';     // final text of the current session
  let pending = '';     // interim text of the current session not yet covered by the final text
  let wanted = true;
  let rec: Rec;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastHeard = Date.now();

  // Chrome on Android sometimes sends only interim results and then goes quiet after a short pause:
  // no final text, no onend, no error. Interim text is kept as if it were final so nothing is lost.
  const commit = () => {
    committed = appendSession(committed, [session, pending].filter(Boolean).join(' '));
    session = ''; pending = '';
  };

  const detach = (r: Rec) => { r.onresult = null; r.onend = null; r.onerror = null; };

  const finish = () => {
    clearInterval(watchdog);
    handlers.onText(committed, '');
    handlers.onEnd();
  };

  // Chrome on Android often refuses a start() made right inside onend ("already started").
  // That used to end the recording after the first address, so the restart waits a moment and retries.
  const restart = (attempt: number) => {
    timer = undefined;
    if (!wanted) { finish(); return; }
    try { begin(); }
    catch (e) {
      logWarn('speech_restart_failed', { attempt, error: (e as Error).message });
      if (attempt < 5) { timer = setTimeout(() => restart(attempt + 1), 300); return; }
      wanted = false;
      finish();
    }
  };

  const begin = () => {
    rec = new SR!();
    rec.lang = 'he-IL'; rec.continuous = !ANDROID; rec.interimResults = true;
    session = ''; pending = '';
    lastHeard = Date.now();
    rec.onresult = (e) => {
      const list = Array.from(e.results, (r) => ({ isFinal: r.isFinal, text: r[0].transcript }));
      const { final, interim } = mergeResults(list);
      session = final; pending = interim;
      lastHeard = Date.now();
      handlers.onText(appendSession(committed, session), interim);
    };
    rec.onerror = (e) => {
      logWarn('speech_error', { error: e.error });
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      wanted = false;
      clearInterval(watchdog);
      handlers.onError(e.error === 'not-allowed' ? 'אין הרשאה למיקרופון. אשר גישה בדפדפן' : `שגיאת הקלטה: ${e.error}`);
    };
    rec.onend = () => {
      commit();
      if (wanted) { timer = setTimeout(() => restart(1), ANDROID ? 150 : 0); return; }
      finish();
    };
    rec.start();
  };

  // A recognizer that has heard nothing for a moment may be stuck, so it is replaced with a fresh one.
  // Replacing one that was only waiting costs nothing: what it heard is already committed.
  const watchdog = setInterval(() => {
    if (!ANDROID || !wanted || timer || Date.now() - lastHeard < STUCK_MS) return;
    logInfo('speech_recycle', { heard: !!(session || pending) });
    const old = rec;
    detach(old);
    try { old.abort(); } catch { /* already ended */ }
    commit();
    handlers.onText(committed, '');
    restart(1);
  }, 500);

  begin();
  logInfo('speech_start', { android: ANDROID });
  return {
    stop() {
      if (!wanted) return;
      wanted = false;
      clearTimeout(timer); timer = undefined;
      // A stuck recognizer never fires onend, so the text is committed and handed back right here.
      detach(rec);
      try { rec.stop(); } catch { /* already ended */ }
      commit();
      logInfo('speech_stop', { transcript: committed });
      finish();
    },
  };
}
