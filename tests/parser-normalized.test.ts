import { describe, expect, it } from 'vitest';
import { parseTranscript } from '../src/domain/parser.js';
import { tidyStops } from '../api/_lib/transcribe';

// The format Haiku is told to return: one address per line, "street number city", no commas.
// These pin that parser.js reads that format the same way every time.
const parse = (text: string, defaultCity = 'רחובות') =>
  parseTranscript(tidyStops(text), { defaultCity }).map((a) => [a.street, a.number, a.city]);

describe('parser.js on the cleaned format', () => {
  it('reads one address per line with and without a city', () => {
    expect(parse('הרצל 8 רחובות\nויצמן 14 פתח תקווה\nביאליק 3')).toEqual([
      ['הרצל', '8', 'רחובות'], ['ויצמן', '14', 'פתח תקווה'], ['ביאליק', '3', 'רחובות'],
    ]);
  });

  it('keeps cities of two words and streets named after cities', () => {
    expect(parse('שדרות ירושלים 120 תל אביב\nהנשיא 5 ראשון לציון\nאחד העם 1 באר שבע')).toEqual([
      ['שדרות ירושלים', '120', 'תל אביב-יפו'], ['הנשיא', '5', 'ראשון לציון'], ['אחד העם', '1', 'באר שבע'],
    ]);
  });

  it('keeps a house letter and apartment details', () => {
    const [a] = parseTranscript(tidyStops('הרצל 17א רחובות דירה 4 קומה 2'), { defaultCity: null });
    expect([a.street, a.number, a.city, a.apartment, a.floor]).toEqual(['הרצל', '17א', 'רחובות', '4', '2']);
  });

  it('survives a comma Haiku should not have written', () => {
    expect(parse('הרצל 8, רחובות\nויצמן 14, פתח תקווה')).toEqual([['הרצל', '8', 'רחובות'], ['ויצמן', '14', 'פתח תקווה']]);
  });

  it('documents why commas are stripped: parser.js splits on them', () => {
    const raw = parseTranscript('הרצל 8, רחובות', { defaultCity: null });
    expect(raw.length).toBe(2);   // "הרצל 8" and a bogus "רחובות" with no number
  });
});
