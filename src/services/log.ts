// Diagnostic log kept on the device, so the courier can share it (WhatsApp) when something goes wrong.
// Never stores the Google key: anything that looks like one is masked before it is saved.

export type LogLevel = 'info' | 'warn' | 'error';
export interface LogEntry { t: string; level: LogLevel; event: string; data?: unknown }

const STORE = 'delvr_log';
const MAX = 300;
let entries: LogEntry[] = [];
try { entries = JSON.parse(localStorage.getItem(STORE) || '[]'); } catch { entries = []; }

const mask = (s: string) => s.replace(/AIza[0-9A-Za-z_-]{10,}/g, '[key]').replace(/([?&]key=)[^&\s"]+/g, '$1[key]');

function clean(data: unknown): unknown {
  if (data instanceof Error) return { name: data.name, message: mask(data.message), stack: data.stack ? mask(data.stack).split('\n').slice(0, 6).join('\n') : undefined };
  try { return JSON.parse(mask(JSON.stringify(data) ?? 'null')); } catch { return mask(String(data)); }
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;
function flush() {
  clearTimeout(saveTimer);
  try { localStorage.setItem(STORE, JSON.stringify(entries)); } catch { /* storage full or blocked */ }
}
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 200);
}

export function log(level: LogLevel, event: string, data?: unknown) {
  entries.push({ t: new Date().toISOString(), level, event, ...(data === undefined ? {} : { data: clean(data) }) });
  if (entries.length > MAX) entries = entries.slice(-MAX);
  persist();
}

export const logInfo = (event: string, data?: unknown) => log('info', event, data);
export const logWarn = (event: string, data?: unknown) => log('warn', event, data);
export const logError = (event: string, data?: unknown) => log('error', event, data);

export function clearLog() { entries = []; try { localStorage.removeItem(STORE); } catch { /* ignore */ } }

/** Uncaught errors and failed promises go into the log too. */
export function installGlobalHandlers() {
  window.addEventListener('error', (e) => logError('uncaught', { message: e.message, source: e.filename, line: e.lineno }));
  window.addEventListener('unhandledrejection', (e) => logError('unhandled_rejection', e.reason instanceof Error ? e.reason : String(e.reason)));
  window.addEventListener('online', () => logInfo('online'));
  window.addEventListener('offline', () => logWarn('offline'));
  // Switching to Waze or WhatsApp hides the page: save right away so nothing is lost.
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
}

async function permission(name: string) {
  try { return (await navigator.permissions.query({ name: name as PermissionName })).state; } catch { return 'unknown'; }
}

/** Everything useful for debugging, as one text report. */
export async function buildReport(extra: Record<string, unknown>): Promise<string> {
  const device = {
    app: 'Delvr', build: import.meta.env.VITE_BUILD ?? 'dev', url: location.origin,
    userAgent: navigator.userAgent, language: navigator.language, online: navigator.onLine,
    screen: `${screen.width}x${screen.height} @${devicePixelRatio}`,
    standalone: matchMedia('(display-mode: standalone)').matches,
    speech: 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window,
    mapsKey: !!import.meta.env.VITE_GOOGLE_MAPS_KEY,
    googleLoaded: !!window.google?.maps,
    microphone: await permission('microphone'),
    geolocation: await permission('geolocation'),
    time: new Date().toString(),
  };
  return mask(JSON.stringify({ device, ...extra, log: entries }, null, 1));
}

/** Opens the phone's share sheet (WhatsApp etc.). Falls back to download, then clipboard. Returns what happened. */
export async function shareReport(report: string): Promise<'shared' | 'downloaded' | 'copied' | 'cancelled'> {
  const name = `delvr-log-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.txt`;
  const file = new File([report], name, { type: 'text/plain' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'לוגים של Delvr', text: 'לוגים של Delvr' }); return 'shared'; }
    catch (e) { if ((e as Error).name === 'AbortError') return 'cancelled'; }
  }
  try {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    return 'downloaded';
  } catch {
    await navigator.clipboard.writeText(report);
    return 'copied';
  }
}
