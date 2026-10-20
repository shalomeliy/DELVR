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

export const speechSupported = () => !!SR;

export interface Dictation { stop(): void }

export function startDictation(handlers: { onText: (finalText: string, interim: string) => void; onError: (msg: string) => void; onEnd: () => void }): Dictation {
  if (!SR) throw new Error('הדפדפן הזה לא תומך בהקלטה. פתח ב-Chrome');
  const rec = new SR();
  rec.lang = 'he-IL'; rec.continuous = true; rec.interimResults = true;
  let finalText = '';
  let wanted = true;
  rec.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) finalText += ' ' + r[0].transcript; else interim += r[0].transcript;
    }
    handlers.onText(finalText.trim(), interim);
  };
  rec.onerror = (e) => {
    logWarn('speech_error', { error: e.error });
    if (e.error === 'no-speech' || e.error === 'aborted') return;
    wanted = false;
    handlers.onError(e.error === 'not-allowed' ? 'אין הרשאה למיקרופון. אשר גישה בדפדפן' : `שגיאת הקלטה: ${e.error}`);
  };
  rec.onend = () => { if (wanted) { try { rec.start(); return; } catch { /* fall through */ } } handlers.onEnd(); };
  rec.start();
  logInfo('speech_start');
  return { stop() { wanted = false; rec.stop(); logInfo('speech_stop', { transcript: finalText.trim() }); } };
}
