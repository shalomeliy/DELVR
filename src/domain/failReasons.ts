// The approved failure reasons (בוס, 2026-11-17), same codes and labels as company mode's fail_reasons table.
// "Failed" means neither a delivery nor a sticker (הדבקה) was possible: out, no answer or no access is a sticker,
// and a refusal or a new date counts as delivered.

export interface FailReasonDef { code: string; label: string; needsText: boolean }

export const FAIL_REASONS: readonly FailReasonDef[] = [
  { code: 'bad_address', label: 'כתובת שגויה או לא קיימת', needsText: false },
  { code: 'incomplete', label: 'כתובת חסרה (בלי מספר בית, רחוב או דירה)', needsText: false },
  { code: 'not_known', label: 'הנמען לא מוכר בכתובת', needsText: false },
  { code: 'moved', label: 'הנמען עבר דירה', needsText: false },
  { code: 'deceased', label: 'הנמען נפטר', needsText: false },
  { code: 'vacant', label: 'הבניין ריק, נטוש או הרוס', needsText: false },
  { code: 'no_place', label: 'אין איפה להדביק (אין דלת או תיבה נגישה)', needsText: false },
  { code: 'other', label: 'אחר', needsText: true },
];

const byCode = (code: string) => FAIL_REASONS.find((r) => r.code === code);

/** The text saved on the stop and shown in reports: the label, then the courier's note after a colon. "אחר" is just the note. */
export function composeFailReason(code: string, note: string): string | undefined {
  const r = byCode(code);
  const n = note.trim();
  if (!r) return undefined;
  if (r.needsText) return n || undefined;
  return n ? `${r.label}: ${n}` : r.label;
}

/** Reads a saved reason back into a choice and a note. Free text from before the list (or "אחר") opens as "אחר". */
export function parseFailReason(saved: string | undefined): { code: string; note: string } {
  const s = (saved ?? '').trim();
  if (!s) return { code: '', note: '' };
  for (const r of FAIL_REASONS) {
    if (r.needsText) continue;
    if (s === r.label) return { code: r.code, note: '' };
    if (s.startsWith(r.label + ':')) return { code: r.code, note: s.slice(r.label.length + 1).trim() };
  }
  return { code: 'other', note: s };
}

/** Saving is allowed once a reason is picked, and for "אחר" only with a note. */
export function canSaveFailReason(code: string, note: string): boolean {
  const r = byCode(code);
  return !!r && (!r.needsText || note.trim().length > 0);
}
