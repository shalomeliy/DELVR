import { describe, expect, it } from 'vitest';
import { appendSession, mergeResults } from '../src/domain/transcript';

const f = (text: string) => ({ isFinal: true, text });

describe('mergeResults', () => {
  it('desktop: separate final results are joined once', () => {
    expect(mergeResults([f('הרצל 3 רחובות'), f('ויצמן 5 ראשון לציון')]).final).toBe('הרצל 3 רחובות ויצמן 5 ראשון לציון');
  });
  it('Android: growing results keep only the longest', () => {
    const r = mergeResults([f("ז'בוטינסקי 3"), f("ז'בוטינסקי 3 רמת גן"), f("ז'בוטינסקי 3 רמת גן דוכיפת 3")]);
    expect(r.final).toBe("ז'בוטינסקי 3 רמת גן דוכיפת 3");
  });
  it('Android: an exact repeat is dropped', () => {
    expect(mergeResults([f("ז'בוטינסקי 3 רמת גן"), f("ז'בוטינסקי 3 רמת גן")]).final).toBe("ז'בוטינסקי 3 רמת גן");
  });
  it('interim shows only the new words', () => {
    expect(mergeResults([f('הרצל 3'), { isFinal: false, text: 'הרצל 3 רחובות' }])).toEqual({ final: 'הרצל 3', interim: 'רחובות' });
  });
  it('unfinished text split over several results is all kept', () => {
    const i = (text: string) => ({ isFinal: false, text });
    expect(mergeResults([i('ביאליק'), i('9 ראשון לציון')]).interim).toBe('ביאליק 9 ראשון לציון');
  });
  it('Android: growing unfinished results keep only the longest', () => {
    const i = (text: string) => ({ isFinal: false, text });
    expect(mergeResults([i('ביאליק'), i('ביאליק 9'), i('ביאליק 9 ראשון לציון')]).interim).toBe('ביאליק 9 ראשון לציון');
  });
});

describe('appendSession', () => {
  it('adds a new phrase after the previous ones', () => expect(appendSession('הרצל 3 יבנה', 'דוכיפת 5')).toBe('הרצל 3 יבנה דוכיפת 5'));
  it('does not repeat a phrase sent again after a restart', () => expect(appendSession('הרצל 3 יבנה דוכיפת 5', 'דוכיפת 5')).toBe('הרצל 3 יבנה דוכיפת 5'));
  it('takes the longer text when the session repeats everything', () => expect(appendSession('הרצל 3', 'הרצל 3 יבנה')).toBe('הרצל 3 יבנה'));
});
