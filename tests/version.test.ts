import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Every merged PR bumps the version and adds a CHANGELOG entry (CLAUDE.md, "Release management").
const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };
const changelog = readFileSync('CHANGELOG.md', 'utf8');
const released = [...changelog.matchAll(/^## (\d+\.\d+\.\d+) - (\d{4}-\d{2}-\d{2})$/gm)].map((m) => m[1]);

const cmp = (a: string, b: string) => {
  const [x, y] = [a, b].map((v) => v.split('.').map(Number));
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
};

describe('version', () => {
  it('is a plain SemVer number', () => {
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('matches the newest CHANGELOG entry', () => {
    expect(released[0]).toBe(pkg.version);
  });

  it('CHANGELOG entries go from newest to oldest with no repeats', () => {
    for (let i = 1; i < released.length; i++) expect(cmp(released[i - 1], released[i])).toBeGreaterThan(0);
  });
});
