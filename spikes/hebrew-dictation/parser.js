// Splits a Hebrew dictation transcript into structured addresses.
// Pure function, no network. Same module runs in the browser and in Node.
import { CITIES } from './cities.js';

const norm = (s) => s
  .replace(/[֑-ׇ]/g, '')          // niqqud
  .replace(/[״”“]/g, '"').replace(/[׳’‘`]/g, "'")
  .replace(/קרית/g, 'קריית').replace(/תקוה/g, 'תקווה')
  .replace(/-/g, ' ')
  .replace(/\s+/g, ' ').trim();

// Variant (normalized, as token array) -> canonical city. Longest variants first.
const CITY_VARIANTS = CITIES.flatMap(([canon, ...alts]) =>
  [canon, ...alts].map((v) => ({ toks: norm(v).split(' '), canon }))
).sort((a, b) => b.toks.length - a.toks.length);

const UNITS = {
  'אחת': 1, 'אחד': 1, 'שתיים': 2, 'שתים': 2, 'שניים': 2, 'שנים': 2, 'שתי': 2, 'שני': 2,
  'שלוש': 3, 'שלושה': 3, 'ארבע': 4, 'ארבעה': 4, 'חמש': 5, 'חמישה': 5,
  'שש': 6, 'שישה': 6, 'שבע': 7, 'שבעה': 7, 'שמונה': 8, 'תשע': 9, 'תשעה': 9,
};
const TENS = {
  'עשר': 10, 'עשרה': 10, 'עשרים': 20, 'שלושים': 30, 'ארבעים': 40, 'חמישים': 50,
  'שישים': 60, 'שבעים': 70, 'שמונים': 80, 'תשעים': 90,
};
const HUNDREDS = { 'מאה': 100, 'מאתיים': 200 };

// Number-word value of one token, allowing a leading conjunction ו.
function wordVal(tok) {
  for (const t of [tok, tok.startsWith('ו') ? tok.slice(1) : null]) {
    if (t == null) continue;
    if (t in UNITS) return { kind: 'unit', v: UNITS[t] };
    if (t in TENS) return { kind: 'ten', v: TENS[t] };
    if (t in HUNDREDS) return { kind: 'hundred', v: HUNDREDS[t] };
    if (t === 'מאות') return { kind: 'hundreds', v: 0 };
  }
  return null;
}

// Street names that begin with a number word, kept as words ("אחד העם 1" is not "1 העם 1").
const NUMBER_WORD_STREETS = [['אחד', 'העם']];
const startsNumberWordStreet = (tokens, i) => NUMBER_WORD_STREETS.some((p) => p.every((w, k) => String(tokens[i + k] ?? '').replace(/^ו/, '') === w));

// Collapse runs of number words into one digit token ("מאה ועשרים ושלוש" -> "123").
function wordsToDigits(tokens) {
  const out = [];
  let i = 0;
  while (i < tokens.length) {
    if (startsNumberWordStreet(tokens, i)) { out.push(tokens[i], tokens[i + 1]); i += 2; continue; }
    if (!wordVal(tokens[i]) || tokens[i].isCity) { out.push(tokens[i]); i++; continue; }
    let total = 0, cur = 0, j = i;
    while (j < tokens.length && !tokens[j].isCity) {
      const w = wordVal(tokens[j]);
      if (!w) break;
      if (w.kind === 'hundreds') { total += (cur || 1) * 100; cur = 0; }
      else if (w.kind === 'hundred') { total += w.v; cur = 0; }
      else if (w.kind === 'ten' && w.v === 10 && cur > 0 && cur < 10) cur += 10; // שלוש עשרה
      else cur += w.v;
      j++;
    }
    out.push(String(total + cur));
    i = j;
  }
  return out;
}

const SEPARATORS = [
  'ואחר כך', 'אחר כך', 'ואחרי זה', 'אחרי זה', 'ואחריה', 'הכתובת הבאה', 'כתובת הבאה',
  'העצירה הבאה', 'עצירה הבאה', 'הבאה', 'הבא', 'נקודה', 'פסיק', 'וגם',
];
// Streets that genuinely start with ו, so the conjunction must not be stripped.
const VAV_STREETS = ['ויצמן', 'ורבורג', 'וולפסון', 'ויסוצקי', 'וינגייט', 'ושינגטון', 'ולנברג', 'ורדים', 'ויתקין', 'וילנה', 'ולפסון'];
const QUAL = { 'דירה': 'apartment', 'קומה': 'floor', 'כניסה': 'entrance', 'קוד': 'code' };
const isNum = (t) => /^\d+[א-ת]?$/.test(t);  // "17א"
const isLetterSuffix = (t) => /^[א-ת]'?$/.test(t);

function matchCity(tokens, i) {
  for (const { toks, canon } of CITY_VARIANTS) {
    for (const prefix of ['', 'ב', 'ל']) {
      const first = tokens[i];
      if (!first || !first.startsWith(prefix)) continue;
      const head = first.slice(prefix.length);
      if (head !== toks[0]) continue;
      if (toks.every((t, k) => (k === 0 ? head : tokens[i + k]) === t)) return { canon, len: toks.length };
    }
  }
  return null;
}

function startsStreet(toks, i) {
  return i + 1 < toks.length && isNum(String(toks[i + 1]));
}

export function parseTranscript(text, { defaultCity = null } = {}) {
  let s = ' ' + norm(text).replace(/[,.;:\n!?]/g, ' | ') + ' ';
  for (const sep of SEPARATORS) s = s.split(` ${sep} `).join(' | ');
  const chunks = s.split('|').map((c) => c.trim()).filter(Boolean);

  const addresses = [];
  for (const chunk of chunks) {
    // Mark city spans first so "באר שבע" is not read as the number 7.
    const raw = chunk.split(' ');
    const marked = [];
    for (let i = 0; i < raw.length;) {
      const c = matchCity(raw, i);
      if (c) { const t = new String(raw.slice(i, i + c.len).join(' ')); t.isCity = c.canon; marked.push(t); i += c.len; }
      else marked.push(raw[i++]);
    }
    const toks = wordsToDigits(marked);
    let cur = null;
    const flush = () => { if (cur && (cur.streetToks.length || cur.number)) addresses.push(cur); cur = null; };
    const fresh = () => ({ streetToks: [], number: null, city: null, apartment: null, floor: null, entrance: null, code: null });

    for (let i = 0; i < toks.length; i++) {
      let t = toks[i];
      const tStr = String(t);
      if (!cur) cur = fresh();

      if (cur.number) {
        // After the house number: qualifiers and city extend this address; anything else starts the next one.
        if (QUAL[tStr] && toks[i + 1] !== undefined) {
          let val = String(toks[i + 1]); i++;
          if (tStr === 'קוד' && val === 'כניסה' && toks[i + 1] !== undefined) { val = String(toks[i + 1]); i++; }
          cur[QUAL[tStr]] = val; continue;
        }
        // A city name followed by a house number is the next address's street ("ירושלים 4", "שדרות ירושלים 120").
        if (t.isCity && !cur.city && !startsStreet(toks, i)) { cur.city = t.isCity; continue; }
        if (isLetterSuffix(tStr) && !cur.suffixDone) { cur.number += tStr.replace("'", ''); cur.suffixDone = true; continue; }
        flush(); cur = fresh();
      }
      if (isNum(tStr) && cur.streetToks.length) { cur.number = tStr; continue; }
      if (tStr === 'רחוב' || tStr === 'ברחוב' || tStr === 'מספר') continue;
      let word = t.isCity ? String(t) : tStr;            // a city name before the number is a street name
      if (!cur.streetToks.length && word.startsWith('ו') && word.length > 2 && !VAV_STREETS.some((v) => word === v)) word = word.slice(1);
      if (cur.streetToks[cur.streetToks.length - 1] === word) continue;  // stutter: "הרצל הרצל 14"
      cur.streetToks.push(word);
    }
    flush();
  }

  return addresses.map((a) => {
    const street = a.streetToks.join(' ');
    const city = a.city || defaultCity;
    const flags = [];
    if (/^[\d\s]+$/.test(street)) flags.push('unclear');      // e.g. Chrome wrote ":43" with no street
    if (!a.number) flags.push('no_number');
    if (!a.city) flags.push(defaultCity ? 'city_defaulted' : 'no_city');
    return {
      street, number: a.number, city,
      apartment: a.apartment, floor: a.floor, entrance: a.entrance, code: a.code,
      geocodeQuery: [street + (a.number ? ' ' + a.number : ''), city].filter(Boolean).join(', '),
      flags,
    };
  });
}
