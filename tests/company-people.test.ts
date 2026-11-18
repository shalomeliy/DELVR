import { describe, expect, it } from 'vitest';
import { cleanName, cleanPhone, telLink } from '../src/company/people';
import { prefs } from '../src/company/prefs';

describe('courier name and phone', () => {
  it('tidies a name', () => expect(cleanName('  שלומי   כהן ')).toBe('שלומי כהן'));

  it.each([
    ['', null], ['   ', null],
    ['050-1234567', '050-1234567'], ['+972 50 123 4567', '+972 50 123 4567'], ['(03) 555-1234', '03 555-1234'],
    ['abc', false], ['050-12', false], ['050-123456789012345', false], ['tel:0501234567', false], ['050-1234567;', false],
  ])('%j -> %j', (raw, out) => expect(cleanPhone(raw)).toBe(out));

  it('dials only digits and +', () => expect(telLink('+972 50-123 4567')).toBe('tel:+972501234567'));
});

describe('device preferences', () => {
  const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } }; };

  it('map is open until folded, per app', () => {
    const ls = mem();
    expect(prefs.mapOpen('admin', ls)).toBe(true);
    prefs.setMapOpen('admin', false, ls);
    expect(prefs.mapOpen('admin', ls)).toBe(false);
    expect(prefs.mapOpen('courier', ls)).toBe(true);
  });

  it('vehicle defaults to scooter, is kept per company and ignores junk', () => {
    const ls = mem();
    expect(prefs.vehicle('c1', ls)).toBe('scooter');
    prefs.setVehicle('c1', 'car', ls);
    expect(prefs.vehicle('c1', ls)).toBe('car');
    expect(prefs.vehicle('c2', ls)).toBe('scooter');
    ls.setItem('passit_vehicle_c3', 'truck');
    expect(prefs.vehicle('c3', ls)).toBe('scooter');
  });

  it('a blocked storage falls back to the defaults', () => {
    const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(prefs.mapOpen('courier', broken)).toBe(true);
    expect(() => prefs.setVehicle('c1', 'car', broken)).not.toThrow();
  });
});
