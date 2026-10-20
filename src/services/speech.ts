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
  let wanted = true;
  let rec: Rec;

  const begin = () => {
    rec = new SR!();
    rec.lang = 'he-IL'; rec.continuous = !ANDROID; rec.interimResults = true;
    session = '';
    rec.onresult = (e) => {
      const list = Array.from(e.results, (r) => ({ isFinal: r.isFinal, text: r[0].transcript }));
      const { final, interim } = mergeResults(list);
      session = final;
      handlers.onText(appendSession(committed, session), interim);
    };
    rec.onerror = (e) => {
      logWarn('speech_error', { error: e.error });
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      wanted = false;
      handlers.onError(e.error === 'not-allowed' ? 'אין הרשאה למיקרופון. אשר גישה בדפדפן' : `שגיאת הקלטה: ${e.error}`);
    };
    rec.onend = () => {
      committed = appendSession(committed, session);
      session = '';
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
      wanted = false; rec.stop();
      logInfo('speech_stop', { transcript: appendSession(committed, session) });
    },
  };
}
