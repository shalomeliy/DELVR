// Spike: record on a real phone, send to /api/transcribe-stops, and compare OpenAI's raw text with Haiku's clean text.
// Throwaway page. The app itself is not changed; the result decides how AddStops and FailReason are rebuilt.
import { createClient } from '@supabase/supabase-js';
import { parseTranscript } from '../../src/domain/parser.js';
import { recorderSupported, startRecording, type ActiveRecording, type Recording } from '../../src/services/recorder';
import { sendRecording, type TranscribeMode, type TranscribeResult } from '../../src/services/transcribe';

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
// Its own storage key: signing in here never replaces a courier's anonymous identity or the admin's sign-in on this phone.
const sb = URL && KEY ? createClient(URL, KEY, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'passit-voice-spike-auth' } }) : null;

const app = document.getElementById('app')!;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

let mode: TranscribeMode = 'stops';
let active: ActiveRecording | null = null;
let last: Recording | null = null;
let busy = false;
let began = 0;
let clock = 0;
let error = '';
let result: TranscribeResult | null = null;

function parsedTable(text: string) {
  const rows = parseTranscript(text);
  if (!rows.length) return '<p class="muted">parser.js לא מצא כתובות</p>';
  return `<table><tr><th>רחוב</th><th>מס'</th><th>עיר</th><th>דגלים</th></tr>${rows.map((a) =>
    `<tr><td>${esc(a.street)}</td><td>${esc(a.number ?? '')}</td><td>${esc(a.city ?? '')}</td><td>${esc(a.flags.join(' '))}</td></tr>`).join('')}</table>`;
}

function renderLogin() {
  app.innerHTML = `
    <h1>ניסוי הקלטה</h1>
    <div class="card">
      <p class="muted">התחבר עם המייל והסיסמה של מנהל החברה. השרת מאשר הקלטות רק לחברי חברה.</p>
      <input id="email" type="email" autocomplete="username" placeholder="מייל" dir="ltr" />
      <input id="pass" type="password" autocomplete="current-password" placeholder="סיסמה" dir="ltr" />
      <button class="primary" id="login">התחבר</button>
      <p class="bad" id="lerr"></p>
    </div>`;
  document.getElementById('login')!.onclick = async () => {
    const email = (document.getElementById('email') as HTMLInputElement).value.trim();
    const password = (document.getElementById('pass') as HTMLInputElement).value;
    const r = await sb!.auth.signInWithPassword({ email, password });
    if (r.error) document.getElementById('lerr')!.textContent = r.error.message;
    else render();
  };
}

function render() {
  const secs = active ? Math.floor((Date.now() - began) / 1000) : 0;
  const t = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  app.innerHTML = `
    <h1>ניסוי הקלטה</h1>
    <div class="seg">
      <button data-mode="stops" class="${mode === 'stops' ? 'on' : ''}" ${active || busy ? 'disabled' : ''}>כתובות</button>
      <button data-mode="reason" class="${mode === 'reason' ? 'on' : ''}" ${active || busy ? 'disabled' : ''}>סיבת כישלון</button>
    </div>
    <div class="card">
      <button class="rec ${active ? 'live' : ''}" id="rec" ${busy ? 'disabled' : ''}>${active ? `עצור (${t})` : busy ? 'מעבד...' : mode === 'stops' ? 'הקלט כתובות' : 'הקלט סיבה'}</button>
      <div class="meter" ${active ? '' : 'hidden'}><div id="lvl"></div></div>
      <p class="muted">${active ? 'מקליט. דבר רגיל, כתובת אחרי כתובת. אפשר לתקן את עצמך ("לא סליחה").' : busy ? (mode === 'stops' ? 'מעבד כתובות...' : 'מעבד...') : 'לחץ, דבר, ולחץ שוב כשסיימת. עד 3 דקות.'}</p>
      ${last && !active && !busy ? '<button id="again">שלח שוב את אותה הקלטה</button>' : ''}
      ${error ? `<p class="bad">${esc(error)}</p>` : ''}
    </div>
    ${result ? `
    <div class="card">
      <div class="row muted"><span>${esc(last?.mime ?? '')} · ${last ? Math.round(last.blob.size / 1024) : 0}KB · ${last ? (last.ms / 1000).toFixed(1) : 0} שנ'</span>
        <span>תמלול ${(result.ms.transcribe / 1000).toFixed(1)} שנ' · Haiku ${(result.ms.clean / 1000).toFixed(1)} שנ'</span></div>
      <h3>גולמי (OpenAI)</h3><pre>${esc(result.raw)}</pre>
      <h3>נקי (Haiku)</h3><pre>${result.clean == null ? `<span class="bad">נכשל: ${esc(result.cleanError ?? '')}</span>` : esc(result.clean)}</pre>
    </div>
    ${result.mode === 'stops' ? `
    <div class="card"><h3>parser.js על הטקסט הנקי</h3>${parsedTable(result.clean ?? result.raw)}</div>
    <div class="card"><h3>parser.js על הגולמי (להשוואה)</h3>${parsedTable(result.raw)}</div>` : ''}` : ''}
    <p class="muted">${esc(navigator.userAgent)}</p>
    <button id="out">התנתק</button>`;

  app.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((b) => { b.onclick = () => { mode = b.dataset.mode as TranscribeMode; result = null; render(); }; });
  document.getElementById('rec')!.onclick = toggle;
  const again = document.getElementById('again');
  if (again) again.onclick = () => void send();
  document.getElementById('out')!.onclick = async () => { await sb!.auth.signOut(); renderLogin(); };
}

async function send() {
  if (!last) return;
  busy = true; error = ''; render();
  try {
    const { data } = await sb!.auth.getSession();
    if (!data.session) { busy = false; renderLogin(); return; }
    result = await sendRecording(last, mode, data.session.access_token);
  } catch (e) { error = (e as Error).message; }
  busy = false; render();
}

async function toggle() {
  if (active) {
    const a = active; active = null; clearInterval(clock);
    try { last = await a.stop(); } catch (e) { error = (e as Error).message; render(); return; }
    await send();
    return;
  }
  error = ''; result = null;
  try {
    active = await startRecording({
      onLevel: (l) => { const el = document.getElementById('lvl'); if (el) el.style.width = `${Math.round(l * 100)}%`; },
      onAutoStop: () => void toggle(),
    });
    began = Date.now();
    clock = window.setInterval(render, 1000);
  } catch (e) { error = (e as Error).message; }
  render();
}

if (!sb) app.innerHTML = '<p class="bad">חסרים VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY בבנייה</p>';
else if (!recorderSupported()) app.innerHTML = '<p class="bad">הדפדפן הזה לא תומך ב-MediaRecorder</p>';
else void sb.auth.getSession().then(({ data }) => (data.session ? render() : renderLogin()));
