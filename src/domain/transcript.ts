// Turns the recognizer's result list into one clean transcript.
// Chrome on Android repeats itself: each new result often contains the previous one
// ("הרצל 3", "הרצל 3 רחובות", "הרצל 3 רחובות ויצמן 5"), and results can be re-sent after a restart.
// So we rebuild from the whole list every time and drop any result already covered by a neighbour.

export interface ResultLike { isFinal: boolean; text: string }

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

// Growing results keep the longer one, exact repeats are dropped, anything else is a new phrase.
function dedupe(texts: string[]): string {
  const parts: string[] = [];
  for (const t of texts) {
    const last = parts[parts.length - 1];
    if (last !== undefined && t.startsWith(last)) parts[parts.length - 1] = t;
    else if (last !== undefined && last.endsWith(t)) continue;
    else parts.push(t);
  }
  return parts.join(' ');
}

export function mergeResults(results: ResultLike[]): { final: string; interim: string } {
  const finals: string[] = [];
  const interims: string[] = [];
  for (const r of results) {
    const t = norm(r.text);
    if (t) (r.isFinal ? finals : interims).push(t);
  }
  const final = dedupe(finals);
  // Chrome can split the unfinished text over several results ("ביאליק" + "9 ראשון לציון"), so all are kept, not just the last.
  let interim = dedupe(interims);
  // Android's interim often repeats the final text; show only what is new.
  if (interim && final && interim.startsWith(final)) interim = norm(interim.slice(final.length));
  return { final, interim };
}

/** Joins text from one recording session onto the text so far, without repeating an overlap. */
export function appendSession(soFar: string, session: string): string {
  const a = norm(soFar), b = norm(session);
  if (!a) return b;
  if (!b || a.endsWith(b)) return a;
  if (b.startsWith(a)) return b;
  return `${a} ${b}`;
}
