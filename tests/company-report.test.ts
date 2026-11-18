import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { LiveStop } from '../src/company/api';
import { crc32, parseQuery, photoName, routeCsv, zip } from '../src/company/report';

const s = (seq: number, address: string, delivery: LiveStop['delivery'], extra: Partial<LiveStop> = {}): LiveStop => ({
  id: `s${seq}`, seq, input: address, address, lat: null, lng: null, due_at: null, delivery, fail_code: null, fail_reason: null,
  handled_at: delivery === 'todo' ? null : '2026-11-18T08:30:00Z', handled_lat: null, handled_lng: null, ref: 100000 + seq, ...extra });

describe('report', () => {
  it('names a photo by address and delivery number, safe for any OS', () => {
    expect(photoName(s(1, 'הרצל 12, יבנה', 'delivered'))).toBe('הרצל 12, יבנה - 100001.jpg');
    expect(photoName(s(1, 'הרצל 12, יבנה', 'delivered'), new Set(), 'שלומי כהן')).toBe('הרצל 12, יבנה - 100001 - שלומי כהן.jpg');
    expect(photoName({ address: 'x', input: 'x' }, new Set(), 'דני/לוי')).toBe('x - דני לוי.jpg');
    expect(photoName(s(2, 'א/ב: "ג"?', 'delivered'))).toBe('א ב ג - 100002.jpg');
    const taken = new Set<string>();
    photoName({ address: 'x', input: 'x' }, taken);
    expect(photoName({ address: 'x', input: 'x' }, taken)).toBe('x (2).jpg');
  });

  it('CSV opens in Excel with Hebrew, totals, and no formula injection', () => {
    const csv = routeCsv('שלומי', '2026-11-18', [
      s(1, 'הרצל 12', 'delivered', { proof_path: 'p' }), s(2, 'שבזי 4', 'pasted'),
      s(3, '=HYPERLINK("x")', 'failed', { fail_code: 'moved', fail_reason: 'אמר השכן' }), s(4, 'דואני 30', 'todo')], () => 'עבר דירה');
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('"#100001","1","הרצל 12","נמסר","10:30","","הרצל 12 - 100001 - שלומי.jpg"');
    expect(csv).toContain('"עבר דירה: אמר השכן"');
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain('"נמסרו","1"');
    expect(csv).toContain('"לא סומנו","1"');
  });

  it('CRC32 matches the standard value', () => expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926));

  it('ZIP unpacks with the system unzip, Hebrew names intact', () => {
    const dir = mkdtempSync(join(tmpdir(), 'zip-'));
    const a = new Uint8Array([0xff, 0xd8, 1, 2, 3, 0xff, 0xd9]);
    writeFileSync(join(dir, 'r.zip'), zip([{ name: 'הרצל 12 - 100001.jpg', data: a }, { name: 'b.txt', data: new TextEncoder().encode('שלום') }]));
    let listing = '';
    try { listing = execFileSync('python3', ['-c', 'import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; print("|".join(z.namelist())); print(z.read("b.txt").decode())', join(dir, 'r.zip')]).toString(); }
    catch (e) { throw new Error(`zip check failed: ${e}`); }
    expect(listing).toContain('הרצל 12 - 100001.jpg|b.txt');
    expect(listing).toContain('שלום');
    expect(readFileSync(join(dir, 'r.zip')).length).toBeGreaterThan(a.length);
  });

  it('search reads a number or address words', () => {
    expect(parseQuery('#100042')).toEqual({ ref: 100042, text: '' });
    expect(parseQuery(' 100042 ')).toEqual({ ref: 100042, text: '' });
    expect(parseQuery('הרצל 12, יבנה')).toEqual({ ref: null, text: 'הרצל 12 יבנה' });
    expect(parseQuery('a%b*(c)')).toEqual({ ref: null, text: 'a b c' });
  });
});
