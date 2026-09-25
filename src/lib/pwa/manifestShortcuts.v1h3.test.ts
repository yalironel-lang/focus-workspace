/**
 * V1-H3 — PWA shortcuts honesty.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assertPwaShortcutsHonest,
  isPwaShortcutPathKnown,
  PWA_MANIFEST_SHORTCUTS,
} from './manifestShortcuts';

describe('PWA manifest shortcuts V1-H3', () => {
  it('9–10. shipped shortcuts list is empty / honest', () => {
    expect(PWA_MANIFEST_SHORTCUTS).toEqual([]);
    expect(assertPwaShortcutsHonest(PWA_MANIFEST_SHORTCUTS)).toEqual({ ok: true });
  });

  it('rejects nonexistent routes', () => {
    expect(isPwaShortcutPathKnown('/today')).toBe(false);
    expect(isPwaShortcutPathKnown('/capture')).toBe(false);
    expect(
      assertPwaShortcutsHonest([
        {
          name: 'Today',
          short_name: 'Today',
          description: 'x',
          url: '/today',
          icons: [],
        },
      ]).ok,
    ).toBe(false);
  });

  it('known paths alone are not enough to ship (no nonfunctional deep links)', () => {
    const r = assertPwaShortcutsHonest([
      {
        name: 'Capture',
        short_name: 'Capture',
        description: 'x',
        url: '/dashboard?capture=1',
        icons: [],
      },
    ]);
    expect(r.ok).toBe(false);
    expect(isPwaShortcutPathKnown('/dashboard?capture=1')).toBe(true);
  });

  it('vite.config.ts ships empty shortcuts (no /today /capture /dead deep links)', () => {
    const src = readFileSync(resolve(process.cwd(), 'vite.config.ts'), 'utf8');
    expect(src).toMatch(/shortcuts:\s*\[\s*\]/);
    expect(src).not.toMatch(/url:\s*['"]\/today['"]/);
    expect(src).not.toMatch(/url:\s*['"]\/capture['"]/);
    expect(src).not.toMatch(/\/dashboard\?capture=1/);
    expect(src).not.toMatch(/\/dashboard\?focus=1/);
  });
});
