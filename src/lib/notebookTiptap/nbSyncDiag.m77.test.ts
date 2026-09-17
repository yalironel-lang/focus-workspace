/**
 * M7.7 — nbSyncDiag production gating.
 *
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mem = new Map<string, string>();

beforeEach(() => {
  mem.clear();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => {
      mem.set(k, v);
    },
    removeItem: (k: string) => {
      mem.delete(k);
    },
    clear: () => mem.clear(),
    key: () => null,
    length: 0,
  });
  // Re-sync hook after storage stub.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  try {
    delete (window as Window & { __fwNbSyncDiagFetchObject?: unknown }).__fwNbSyncDiagFetchObject;
  } catch {
    /* ignore */
  }
});

describe('M7.7 nbSyncDiag production gating', () => {
  it('default product mode: no body console dump and no global helper', async () => {
    mem.delete('notebookEngineeringChrome');
    vi.resetModules();
    const diag = await import('../notebookPages/nbSyncDiag');
    diag.syncNbSyncDiagWindowHook();

    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    diag.nbSyncDiagLog('A_before_updateObjectContent', { objectId: 'o1' }, {
      content: diag.nbSyncDiagSummarizeContent({
        type: 'notebook',
        body: 'SECRET_BODY',
        pages: [
          {
            id: 'p1',
            sectionId: 's1',
            kind: 'document',
            title: 'P',
            documentBody: 'SECRET_PAGE_BODY',
          },
        ],
      }),
    });

    expect(diag.isNbSyncDiagEnabled()).toBe(false);
    expect(info).not.toHaveBeenCalled();
    expect(diag.nbSyncDiagSummarizeContent({ type: 'notebook', body: 'x' })).toBeNull();
    expect(window.__fwNbSyncDiagFetchObject).toBeUndefined();
  });

  it('engineering opt-in: diagnostics and window helper work', async () => {
    mem.set('notebookEngineeringChrome', '1');
    vi.resetModules();
    const diag = await import('../notebookPages/nbSyncDiag');
    diag.syncNbSyncDiagWindowHook();

    expect(diag.isNbSyncDiagEnabled()).toBe(true);
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const summary = diag.nbSyncDiagSummarizeContent({
      type: 'notebook',
      body: 'VISIBLE_BODY',
      pages: [
        {
          id: 'p1',
          sectionId: 's1',
          kind: 'document',
          title: 'P',
          documentBody: 'VISIBLE_PAGE',
        },
      ],
    });
    expect(summary).toBeTruthy();
    expect(JSON.stringify(summary)).toContain('VISIBLE_PAGE');

    diag.nbSyncDiagLog('I_hydrate_input', { objectId: 'o1' }, { content: summary });
    expect(info).toHaveBeenCalled();
    const dumped = info.mock.calls
      .map(c => c.map(x => String(x)).join(' '))
      .join('\n');
    expect(dumped).toContain('[NB-SYNC-DIAG]');
    expect(dumped).toContain('VISIBLE_PAGE');

    expect(typeof window.__fwNbSyncDiagFetchObject).toBe('function');
  });
});
