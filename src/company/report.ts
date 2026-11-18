// The admin's daily report for one courier: a CSV that opens in Excel (Hebrew intact) and a ZIP of the door photos,
// each named "<address> - <delivery number> - <courier>.jpg". Pure, so it is tested without a browser.
import type { LiveStop } from './api';

export const STATUS_HE: Record<LiveStop['delivery'], string> = { todo: 'לא סומן', delivered: 'נמסר', pasted: 'הדבקה', failed: 'נכשל' };

/** "#100042", or empty before migration 0005 ran. */
export const refText = (s: { ref?: number | null }) => (s.ref ? `#${s.ref}` : '');

/** A file name Windows, macOS and phones all accept: no / \ : * ? " < > |, no control characters, not too long. */
const safe = (t: string, max: number) => t.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

export function photoName(s: Pick<LiveStop, 'address' | 'input'> & { ref?: number | null }, taken = new Set<string>(), courier = '') {
  const addr = safe(s.address ?? s.input, 80) || 'כתובת';
  const who = safe(courier, 40);
  const base = [addr, s.ref ? String(s.ref) : '', who].filter(Boolean).join(' - ');
  let name = `${base}.jpg`;
  for (let i = 2; taken.has(name); i++) name = `${base} (${i}).jpg`;
  taken.add(name);
  return name;
}

const cell = (v: string | number | null | undefined) => {
  const t = v == null ? '' : String(v);
  // Quote everything; a leading = + - @ would run as a formula in Excel, so it gets a ' in front.
  return `"${(/^[=+\-@]/.test(t) ? `'${t}` : t).replace(/"/g, '""')}"`;
};
const clock = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' }) : '');

export function routeCsv(courier: string, day: string, list: LiveStop[], reason: (code: string) => string = (c) => c) {
  const taken = new Set<string>();
  const head = ['מספר משלוח', 'עצירה', 'כתובת', 'סטטוס', 'שעת סימון', 'סיבת כישלון', 'תמונה'];
  const rows = list.map((s) => [refText(s), s.seq, s.address ?? s.input, STATUS_HE[s.delivery], clock(s.handled_at),
    s.delivery === 'failed' ? [s.fail_code ? reason(s.fail_code) : '', s.fail_reason ?? ''].filter(Boolean).join(': ') : '',
    s.proof_path ? photoName(s, taken, courier) : '']);
  const n = (d: LiveStop['delivery']) => list.filter((s) => s.delivery === d).length;
  const lines = [
    [`דוח משלוחים · ${courier} · ${day}`], [], head, ...rows, [],
    ['סה"כ', list.length], ['נמסרו', n('delivered')], ['הדבקות', n('pasted')], ['נכשלו', n('failed')], ['לא סומנו', n('todo')],
  ];
  // BOM so Excel reads UTF-8 Hebrew; CRLF as Excel expects.
  return '﻿' + lines.map((l) => l.map(cell).join(',')).join('\r\n') + '\r\n';
}

export const reportName = (courier: string, day: string, ext: string) => `${courier.replace(/[\\/:*?"<>|]+/g, ' ').trim()} ${day}.${ext}`;

// ---------- ZIP (stored, no compression: JPEGs do not shrink anyway) ----------

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
export function crc32(d: Uint8Array) {
  let c = 0xffffffff;
  for (let i = 0; i < d.length; i++) c = CRC[(c ^ d[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** A ZIP of the given files. Names are UTF-8 (flag bit 11), so Hebrew file names survive on Windows and macOS. */
export function zip(files: { name: string; data: Uint8Array }[], when = new Date()): Uint8Array<ArrayBuffer> {
  const enc = new TextEncoder();
  const dosTime = (when.getHours() << 11) | (when.getMinutes() << 5) | (when.getSeconds() >> 1);
  const dosDate = ((when.getFullYear() - 1980) << 9) | ((when.getMonth() + 1) << 5) | when.getDate();
  const locals: Uint8Array[] = []; const centrals: Uint8Array[] = []; let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name); const crc = crc32(f.data); const size = f.data.length;
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true); lh.setUint32(14, crc, true);
    lh.setUint32(18, size, true); lh.setUint32(22, size, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
    const local = concat([new Uint8Array(lh.buffer), name, f.data]);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
    ch.setUint16(10, 0, true); ch.setUint16(12, dosTime, true); ch.setUint16(14, dosDate, true); ch.setUint32(16, crc, true);
    ch.setUint32(20, size, true); ch.setUint32(24, size, true); ch.setUint16(28, name.length, true);
    ch.setUint32(42, offset, true);
    centrals.push(concat([new Uint8Array(ch.buffer), name]));
    locals.push(local); offset += local.length;
  }
  const cd = concat(centrals);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cd.length, true); end.setUint32(16, offset, true);
  return concat([...locals, cd, new Uint8Array(end.buffer)]);
}

function concat(parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let i = 0; for (const p of parts) { out.set(p, i); i += p.length; }
  return out;
}

/** Text the admin typed into search: a delivery number (with or without #), or words of an address. */
export function parseQuery(q: string): { ref: number | null; text: string } {
  const t = q.trim();
  const m = /^#?\s*(\d{5,9})$/.exec(t);
  // Commas, parentheses, '*' and '%' would break the server filter; they never matter in an address search.
  return m ? { ref: Number(m[1]), text: '' } : { ref: null, text: t.replace(/[,()*%\\]/g, ' ').replace(/\s+/g, ' ').trim() };
}
