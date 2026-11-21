// Records the microphone with MediaRecorder, which works in Safari on iPhone (also as a home-screen app) and in Chrome on Android.
// The text comes from the server after the recording ends, not while the courier speaks.

/** Safari records mp4 (AAC); Chrome records webm (Opus). Newer Safari also claims webm, but its mp4 is the proven path. */
export function pickMime(isTypeSupported: (t: string) => boolean, userAgent: string): string {
  const apple = /iPhone|iPad|iPod|Macintosh/.test(userAgent) && !/Chrome|CriOS|Android/.test(userAgent);
  const order = apple
    ? ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm']
    : ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  return order.find((t) => { try { return isTypeSupported(t); } catch { return false; } }) ?? '';
}

export const recorderSupported = () =>
  typeof window !== 'undefined' && typeof window.MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

export interface Recording { blob: Blob; mime: string; ms: number }
export interface ActiveRecording { mime: string; stop(): Promise<Recording>; cancel(): void }

/** Three minutes of iPhone AAC is about 2 MB, well under the server's 4 MB limit. */
export const MAX_RECORD_MS = 180_000;

export async function startRecording(opts: { onLevel?: (level: number) => void; onAutoStop?: () => void; maxMs?: number } = {}): Promise<ActiveRecording> {
  if (!recorderSupported()) throw new Error('הדפדפן הזה לא מאפשר הקלטה. אפשר להקליד');
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  } catch (e) {
    const name = (e as DOMException).name;
    throw new Error(name === 'NotAllowedError' ? 'אין הרשאה למיקרופון. אשר גישה בהגדרות הדפדפן' : name === 'NotFoundError' ? 'לא נמצא מיקרופון' : 'לא הצלחתי לפתוח את המיקרופון');
  }
  const wanted = pickMime((t) => MediaRecorder.isTypeSupported(t), navigator.userAgent);
  const rec = new MediaRecorder(stream, wanted ? { mimeType: wanted, audioBitsPerSecond: 64_000 } : undefined);
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };

  // Sound level for the waves on screen. Failing here never stops the recording.
  let ctx: AudioContext | null = null;
  let raf = 0;
  if (opts.onLevel) {
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new AC();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const buf = new Uint8Array(analyser.fftSize);
      const tick = () => {
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (const v of buf) sum += ((v - 128) / 128) ** 2;
        opts.onLevel!(Math.min(1, Math.sqrt(sum / buf.length) * 4));
        raf = requestAnimationFrame(tick);
      };
      tick();
    } catch { ctx = null; }
  }

  const began = Date.now();
  let done: Promise<Recording> | null = null;
  const release = () => {
    cancelAnimationFrame(raf);
    clearTimeout(timer);
    stream.getTracks().forEach((t) => t.stop());
    void ctx?.close().catch(() => {});
  };
  const stop = () => {
    done ??= new Promise<Recording>((resolve, reject) => {
      rec.onstop = () => {
        release();
        const mime = (rec.mimeType || wanted || 'audio/mp4').split(';')[0];
        const blob = new Blob(chunks, { type: mime });
        if (!blob.size) reject(new Error('ההקלטה יצאה ריקה. נסה שוב'));
        else resolve({ blob, mime, ms: Date.now() - began });
      };
      rec.onerror = () => { release(); reject(new Error('ההקלטה נקטעה')); };
      if (rec.state === 'inactive') rec.onstop(new Event('stop'));
      else rec.stop();
    });
    return done;
  };
  const timer = setTimeout(() => { opts.onAutoStop?.(); }, opts.maxMs ?? MAX_RECORD_MS);
  // No timeslice: Safari writes one whole mp4 on stop, which is the safest file to send.
  rec.start();
  return {
    mime: (rec.mimeType || wanted).split(';')[0],
    stop,
    cancel() { rec.onstop = null; try { rec.stop(); } catch { /* already stopped */ } release(); },
  };
}
