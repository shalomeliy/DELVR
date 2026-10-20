// Turns the recognizer's result list into one clean transcript.
// Chrome on Android repeats itself: each new result often contains the previous one
// ("הרצל 3", "הרצל 3 רחובות", "הרצל 3 רחובות ויצמן 5"), and results can be re-sent after a restart.
// So we rebuild from the whole list every time and drop any result already covered by a neighbour.

export interface ResultLike { isFinal: boolean; text: string }

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

export function mergeResults(results: ResultLike[]): { final: string; interim: string } {
  const parts: string[] = [];
  let interim = '';
  for (const r of results) {
    const t = norm(r.text);
    if (!t) continue;
    if (!r.isFinal) { interim = t; continue; }
    const last = parts[parts.length - 1];
    if (last !== undefined && t.startsWith(last)) parts[parts.length - 1] = t;   // grew: keep the longer one
    else if (last !== undefined && last.endsWith(t)) continue;                     // repeat of what we have
    else parts.push(t);
  }
  const final = parts.join(' ');
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
