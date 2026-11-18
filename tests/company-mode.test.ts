import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { identityFor, modeFor } from '../src/company/mode';

describe('mode by path', () => {
  it.each([
    ['/', 'solo'], ['', 'solo'], ['/archive', 'solo'], ['/administrator', 'solo'], ['/cx', 'solo'],
    ['/admin', 'admin'], ['/admin/', 'admin'], ['/admin/payments', 'admin'],
    ['/c', 'courier'], ['/c/', 'courier'],
  ])('%s opens %s', (path, mode) => expect(modeFor(path)).toBe(mode));
});

describe('separate home-screen apps', () => {
  it('solo keeps the default manifest', () => expect(identityFor('solo')).toBeNull());

  it.each([['admin', '/admin'], ['courier', '/c']] as const)('%s installs as its own app that opens %s', (mode, path) => {
    const id = identityFor(mode)!;
    const manifest = JSON.parse(readFileSync(join('public', id.manifest), 'utf8'));
    expect(manifest.id).toBe(path);
    expect(manifest.start_url).toBe(path);
    expect(manifest.scope).toBe(path);
    expect(modeFor(manifest.start_url)).toBe(mode);
    expect(manifest.short_name).toBe(id.title);
    for (const f of [...manifest.icons.map((i: { src: string }) => i.src), id.icon, id.appleIcon]) expect(existsSync(join('public', f))).toBe(true);
  });
});
