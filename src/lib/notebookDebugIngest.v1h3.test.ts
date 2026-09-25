/**
 * V1-H3 — debug ingest Production inertness.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isNbAgentDebugIngestEnabled, nbAgentLog } from './notebookDebugIngest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('notebookDebugIngest V1-H3', () => {
  it('3. Production mode gate is false (no LS override path)', () => {
    expect(isNbAgentDebugIngestEnabled({ DEV: false })).toBe(false);
    try {
      localStorage.setItem('NB_AGENT_DEBUG', '1');
    } catch {
      /* ignore */
    }
    expect(isNbAgentDebugIngestEnabled({ DEV: false })).toBe(false);
  });

  it('4. DEV mode gate remains true', () => {
    expect(isNbAgentDebugIngestEnabled({ DEV: true })).toBe(true);
  });

  it('Production override: nbAgentLog does not fetch when disabled', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    nbAgentLog('test', 'msg', { a: 1 }, 'H', 'pre-fix', false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('source: no Production module-level remote debug ingest URL', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'src/lib/notebookDebugIngest.ts'),
      'utf8',
    );
    expect(src).not.toMatch(/127\.0\.0\.1:7714/);
  });
});
