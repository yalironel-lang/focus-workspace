import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { serializeNotebookBlocks, parseNotebookBody } from '../notebookDialect';
import { hydrateNotebookPages, sanitizeNotebookPagesFields, applyNotebookPersist } from '../notebookPages/hydrate';
import { switchNotebookPage, addNotebookPage, deleteNotebookPage } from '../notebookPages/operations';
import { prepareNotebookForCloudPersist, notebookManifestFingerprint } from '../notebookPages/persist';
import type { NotebookContentWithPages } from '../notebookPages/types';
const legacy = '# Real title\n::hw::hw-legacy::';
const versioned = serializeNotebookBlocks([{ id: 'p', kind: 'paragraph', text: '# literal ⟨m⟩[]⟨/m⟩' }], 1);
function notebook(): NotebookContentWithPages {
  return { type: 'notebook', body: legacy, schemaVersion: 1, activeSectionId: 's', activePageId: 'old',
    sections: [{ id: 's', title: 'Notes', pageIds: ['old', 'new'] }],
    pages: [{ id: 'old', sectionId: 's', kind: 'document', documentBody: legacy },
      { id: 'new', sectionId: 's', kind: 'document', documentBody: versioned, documentBodyCodecVersion: 1 }] };
}
describe('exact-body version pairing with mixed Notebook pages', () => {
  beforeEach(() => vi.stubEnv('VITE_NOTEBOOK_V1_PAGES', 'true'));
  afterEach(() => vi.unstubAllEnvs());
  it('hydrates without rewriting or upgrading either page and does not write storage', () => {
    const input = notebook(); const before = JSON.stringify(input);
    const write = vi.spyOn(Storage.prototype, 'setItem'); const open = vi.spyOn(indexedDB, 'open');
    try {
      expect(hydrateNotebookPages(input)).toEqual(input);
      expect(JSON.stringify(input)).toBe(before);
      expect(write).not.toHaveBeenCalled(); expect(open).not.toHaveBeenCalled();
    } finally { write.mockRestore(); open.mockRestore(); }
  });
  it('switches both ways without sticky codec metadata', () => {
    const old = notebook();
    const next = switchNotebookPage(old, 'new', old.body);
    expect(next.bodyCodecVersion).toBe(1); expect(next.body).toBe(versioned);
    expect(parseNotebookBody(next.body, next.bodyCodecVersion)[0]).toMatchObject({ kind: 'paragraph', text: '# literal ⟨m⟩[]⟨/m⟩' });
    const back = switchNotebookPage(next, 'old', next.body);
    expect(back.bodyCodecVersion).toBeUndefined(); expect(back.body).toBe(legacy);
    expect(parseNotebookBody(back.body, back.bodyCodecVersion)[0].kind).toBe('title');
    expect(back.pages).toEqual(old.pages);
  });
  it('dual-write changes only the edited page and pairs the cloud projection', () => {
    const input = notebook(); const next = switchNotebookPage(input, 'new', input.body);
    const edited = serializeNotebookBlocks([{ id: 'p', kind: 'paragraph', text: '--- edited' }], 1);
    const saved = applyNotebookPersist({ ...next, body: edited });
    expect(saved.pages?.[0]).toEqual(input.pages?.[0]);
    expect(saved.pages?.[1]).toMatchObject({ documentBody: edited, documentBodyCodecVersion: 1 });
    const cloud = prepareNotebookForCloudPersist(saved);
    expect(cloud.body).toBe(edited); expect(cloud.bodyCodecVersion).toBe(1);
    expect(cloud.activePageId).toBeUndefined(); expect(cloud.activeSectionId).toBeUndefined();
    expect(prepareNotebookForCloudPersist(saved, 'old').bodyCodecVersion).toBeUndefined();
    const restored = { ...cloud, ...sanitizeNotebookPagesFields(JSON.parse(JSON.stringify(cloud))) };
    expect(restored.pages).toEqual(saved.pages);
    expect(notebookManifestFingerprint(restored)).toBe(notebookManifestFingerprint(saved));
  });
  it('new and fallback pages cannot inherit a different body codec', () => {
    const input = notebook(); const next = switchNotebookPage(input, 'new', input.body);
    const added = addNotebookPage(next, 's', next.body);
    expect(added.bodyCodecVersion).toBeUndefined();
    const deleted = deleteNotebookPage(next, 'new', next.body).content;
    expect(deleted.bodyCodecVersion).toBeUndefined(); expect(deleted.body).toBe(legacy);
  });
  it('legacy metadata and body bytes stay untouched by sanitization/projection', () => {
    const input = notebook(); input.pages = input.pages?.slice(0, 1); input.sections![0].pageIds = ['old'];
    const sanitized = sanitizeNotebookPagesFields(input);
    expect(sanitized.bodyCodecVersion).toBeUndefined();
    expect(sanitized.pages?.[0]).not.toHaveProperty('documentBodyCodecVersion');
    expect(prepareNotebookForCloudPersist(input).body).toBe(legacy);
  });
});
