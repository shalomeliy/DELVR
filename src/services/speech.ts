import { appendSession, mergeResults } from '../domain/transcript';
import { logInfo, logWarn } from './log';

// Chrome's built-in recognizer in Hebrew. It stops after silence, so we restart it until the courier presses stop.
type Rec = {
  lang: string; continuous: boolean; interimResults: boolean;
  start(): void; stop(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};

const SR = (window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec }).SpeechRecognition
  ?? (window as unknown as { webkitSpeechRecognition?: new () => Rec }).webkitSpeechRecognition;

// Android's continuous mode duplicates results, so there we listen one phrase at a time and restart.
const ANDROID = /Android/i.test(navigator.userAgent);

export const speechSupported = () => !!SR;

export interface Dictation { stop(): void }

export function startDictation(handlers: { onText: (finalText: string, interim: string) => void; onError: (msg: string) => void; onEnd: () => void }): Dictation {
  if (!SR) throw new Error('הדפדפן הזה לא תומך בהקלטה. פתח ב-Chrome');
  let committed = '';   // text from finished sessions
  let session = '';     // final text of the current session
  // Since 2026-10-20 Chrome on Android sends only interim results and never marks them final.
  // The interim text was dropped when a session ended after a pause, so only the last address survived.
  let pending = '';     // interim text of the current session not covered by the final text
  let wanted = true;
  let rec: Rec;
  let began = 0;
  let raw: { f: boolean; t: string }[] = [];   // the recognizer's last result list, logged when a session ends
  const commit = () => {
    committed = appendSession(committed, [session, pending].filter(Boolean).join(' '));
    session = ''; pending = '';
  };

  const begin = () => {
    rec = new SR!();
    rec.lang = 'he-IL'; rec.continuous = !ANDROID; rec.interimResults = true;
    session = ''; pending = ''; began = Date.now(); raw = [];
    rec.onresult = (e) => {
      const list = Array.from(e.results, (r) => ({ isFinal: r.isFinal, text: r[0].transcript }));
      raw = list.map((r) => ({ f: r.isFinal, t: r.text }));
      const { final, interim } = mergeResults(list);
      session = final; pending = interim;
      handlers.onText(appendSession(committed, session), interim);
    };
    rec.onerror = (e) => {
      logWarn('speech_error', { error: e.error });
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      wanted = false;
      handlers.onError(e.error === 'not-allowed' ? 'אין הרשאה למיקרופון. אשר גישה בדפדפן' : `שגיאת הקלטה: ${e.error}`);
    };
    rec.onend = () => {
      logInfo('speech_session_end', { ms: Date.now() - began, committed, final: session, interim: pending, raw });
      commit();
      if (wanted) { try { begin(); return; } catch { /* fall through */ } }
      handlers.onText(committed, '');
      handlers.onEnd();
    };
    rec.start();
  };

  begin();
  logInfo('speech_start', { android: ANDROID });
  return {
    stop() {
      if (!wanted) return;
      wanted = false;
      // Hand the text back right away instead of waiting for onend, which may come late or not at all.
      rec.onresult = null; rec.onend = null; rec.onerror = null;
      try { rec.stop(); } catch { /* already ended */ }
      logInfo('speech_session_end', { stopped: true, ms: Date.now() - began, committed, final: session, interim: pending, raw });
      commit();
      logInfo('speech_stop', { transcript: committed });
      handlers.onText(committed, '');
      handlers.onEnd();
    },
  };
}
