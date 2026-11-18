import { describe, expect, it } from 'vitest';
import { modeFor } from '../src/company/mode';

describe('mode by path', () => {
  it.each([
    ['/', 'solo'], ['', 'solo'], ['/archive', 'solo'], ['/administrator', 'solo'], ['/cx', 'solo'],
    ['/admin', 'admin'], ['/admin/', 'admin'], ['/admin/payments', 'admin'],
    ['/c', 'courier'], ['/c/', 'courier'],
  ])('%s opens %s', (path, mode) => expect(modeFor(path)).toBe(mode));
});
