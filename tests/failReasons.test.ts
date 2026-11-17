import { describe, expect, it } from 'vitest';
import { canSaveFailReason, composeFailReason, FAIL_REASONS, parseFailReason } from '../src/domain/failReasons';

describe('failure reasons', () => {
  it('has the 7 approved reasons plus "אחר" last', () => {
    expect(FAIL_REASONS).toHaveLength(8);
    expect(FAIL_REASONS.at(-1)).toMatchObject({ code: 'other', needsText: true });
  });

  it('saves the label, with the note after a colon', () => {
    expect(composeFailReason('moved', '')).toBe('הנמען עבר דירה');
    expect(composeFailReason('moved', ' השכן אמר ')).toBe('הנמען עבר דירה: השכן אמר');
  });

  it('"אחר" saves only the note and needs one', () => {
    expect(composeFailReason('other', 'כלב בחצר')).toBe('כלב בחצר');
    expect(canSaveFailReason('other', '  ')).toBe(false);
    expect(canSaveFailReason('other', 'כלב בחצר')).toBe(true);
    expect(canSaveFailReason('vacant', '')).toBe(true);
    expect(canSaveFailReason('', '')).toBe(false);
  });

  it('reads a saved reason back', () => {
    for (const r of FAIL_REASONS.filter((x) => !x.needsText)) {
      expect(parseFailReason(composeFailReason(r.code, ''))).toEqual({ code: r.code, note: '' });
      expect(parseFailReason(composeFailReason(r.code, 'הערה'))).toEqual({ code: r.code, note: 'הערה' });
    }
  });

  it('opens free text from before the list as "אחר"', () => {
    expect(parseFailReason('אין מענה בדלת')).toEqual({ code: 'other', note: 'אין מענה בדלת' });
    expect(parseFailReason(undefined)).toEqual({ code: '', note: '' });
  });
});
