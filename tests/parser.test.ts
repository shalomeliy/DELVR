import { describe, expect, it } from 'vitest';
import { parseTranscript } from '../src/domain/parser.js';
import { CASES } from './test-cases.js';

type Case = { name: string; defaultCity: string; text: string; expected: [string, string, string, Record<string, string>?][] };

describe('parseTranscript', () => {
  for (const c of CASES as Case[]) {
    it(c.name, () => {
      const got = parseTranscript(c.text, { defaultCity: c.defaultCity });
      expect(got).toHaveLength(c.expected.length);
      c.expected.forEach(([street, number, city, extra = {}], i) => {
        expect({ street: got[i].street, number: got[i].number, city: got[i].city }).toEqual({ street, number, city });
        for (const [k, v] of Object.entries(extra)) expect(got[i][k as keyof typeof got[number]]).toBe(v);
      });
    });
  }
});
