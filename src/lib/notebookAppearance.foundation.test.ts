/**
 * Notebook Appearance V1 / Designer foundation — model, sanitize, presets, persistence.
 *
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureTestLocalStorage } from './knowledge/testLocalStorage';
ensureTestLocalStorage();

import {
  NOTEBOOK_DESIGN_PRESET_IDS,
  NOTEBOOK_IDENTITY_COLORS,
  NOTEBOOK_IDENTITY_TREATMENTS,
  NOTEBOOK_WRITING_WIDTHS,
  NOTEBOOK_WRITING_DENSITIES,
  NOTEBOOK_DESIGN_PRESETS,
  sanitizeNotebookAppearance,
  resolveNotebookAppearance,
  resolveNotebookDesignPresetTokens,
  appearanceFromNotebookDesignPreset,
  appearanceMatchesNotebookDesignPreset,
  resolveNotebookIdentityColor,
  resolveNotebookWritingWidth,
  resolveNotebookWritingDensity,
  DEFAULT_NOTEBOOK_IDENTITY_COLOR,
  DEFAULT_NOTEBOOK_WRITING_WIDTH,
  DEFAULT_NOTEBOOK_WRITING_DENSITY,
  type NotebookAppearanceV1,
} from './notebookAppearance';
import {
  ensureProjectObjectContent,
  type ProjectObjectContent,
  type ProjectSpaceObject,
} from '../hooks/useSectionFreeSpaceObjects';
import {
  hydrateNotebookPages,
  prepareNotebookForCloudPersist,
  type NotebookContentWithPages,
} from './notebookPages';
import { serializeNotebookBlocks, hasVersionedNotebookRecord } from './notebookDialect';
import { boardScopedFreeSpaceKeys } from './freeSpacePersistence';
import type { FreeSpaceObjectTombstone } from './knowledge/knowledgeTypes';
import { TOMBSTONES_STORE, idbPut, resetKnowledgeJournalDbForTests } from './knowledge/knowledgeJournalIdb';
import { restoreFromTombstone } from './knowledge/knowledgeRestore';
import { listTombstones } from './knowledge/tombstoneStore';
import { resetNotebookHandwritingStoreForTests } from './notebookHandwritingStore';

vi.mock('./focusCache/freeSpaceObjectDeleteEnqueue', () => ({
  cancelPendingFreeSpaceObjectDeletes: vi.fn(async () => ({ ok: true, removed: 1 })),
  enqueueFreeSpaceObjectDeletesAfterLocalDelete: vi.fn(),
  enqueueFreeSpaceObjectDelete: vi.fn(),
}));

vi.mock('./focusCache/freeSpaceObjectCreateEnqueue', () => ({
  enqueueFreeSpaceObjectCreate: vi.fn(async () => ({ ok: true })),
  FREE_SPACE_OBJECT_ENTITY_TYPE: 'free_space_object',
  buildFreeSpaceObjectWritePayload: vi.fn(),
}));

vi.mock('./notebookDeleteCascade', () => ({
  cascadeDeleteNotebookAssets: vi.fn(async () => ({ handwriting: 0, images: 0 })),
}));

const SECTION = 'sec-nb-appearance-v1';
const BOARD = 'main';
const USER = 'user-appearance-v1';

type NotebookContent = Extract<ProjectObjectContent, { type: 'notebook' }>;

function objectsKey() {
  return boardScopedFreeSpaceKeys(SECTION, BOARD).objects;
}

function baseNotebook(extra: Partial<NotebookContent> = {}): NotebookContent {
  return {
    type: 'notebook',
    body: 'Page 1 legacy notes for calculus',
    paperStyle: 'ruled',
    notebookMode: 'normal',
    notebookSurface: 'spatial',
    schemaVersion: 1,
    sections: [{ id: 'sec-notes', title: 'Notes', pageIds: ['page-1', 'page-3'] }],
    pages: [
      {
        id: 'page-1',
        sectionId: 'sec-notes',
        kind: 'document',
        title: 'Page 1',
        documentBody: 'Page 1 legacy notes for calculus',
      },
      {
        id: 'page-3',
        sectionId: 'sec-notes',
        kind: 'document',
        title: 'Page 3',
        documentBody: serializeNotebookBlocks(
          [{ kind: 'paragraph', text: 'Ipad test 123' }],
          1,
        ),
        documentBodyCodecVersion: 1,
      },
    ],
    ...extra,
  };
}

function snapshotBodies(c: NotebookContent) {
  return {
    body: c.body,
    bodyCodecVersion: c.bodyCodecVersion,
    pages: (c.pages ?? []).map(p =>
      p.kind === 'document'
        ? {
            id: p.id,
            documentBody: p.documentBody,
            documentBodyCodecVersion: p.documentBodyCodecVersion,
          }
        : { id: p.id, kind: p.kind },
    ),
  };
}

function makeTombstone(payload: ProjectSpaceObject): FreeSpaceObjectTombstone {
  return {
    kind: 'free_space_object',
    id: `ts-appearance-${payload.id}`,
    deletedAt: Date.now(),
    expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
    sectionId: SECTION,
    boardId: BOARD,
    label: payload.title || 'Notebook',
    objectId: payload.id,
    objectType: payload.type,
    payload,
  };
}

async function resetKnowledgeDb() {
  await resetKnowledgeJournalDbForTests();
}

const FULL_APPEARANCE: NotebookAppearanceV1 = {
  version: 1,
  identity: {
    preset: 'midnight',
    color: 'purple',
    accent: 'indigo',
    treatment: 'glass',
  },
  writing: {
    width: 'comfortable',
    density: 'comfortable',
  },
};

beforeEach(async () => {
  ensureTestLocalStorage();
  localStorage.clear();
  resetNotebookHandwritingStoreForTests();
  await resetKnowledgeDb();
  vi.stubEnv('VITE_NOTEBOOK_V1_PAGES', 'true');
});

afterEach(() => {
  ensureTestLocalStorage();
  localStorage.clear();
  vi.unstubAllEnvs();
});

describe('A–G sanitize + resolve', () => {
  it('A: notebook without appearance stays unchanged through ensure', () => {
    const raw = baseNotebook();
    const ensured = ensureProjectObjectContent('notebook', raw) as NotebookContent;
    expect(ensured.appearance).toBeUndefined();
    expect(ensured.paperStyle).toBe('ruled');
    expect(ensured.notebookSurface).toBe('spatial');
  });

  it('B: opening/hydrating does not persist appearance defaults', () => {
    const raw = baseNotebook();
    const ensured = ensureProjectObjectContent('notebook', JSON.parse(JSON.stringify(raw))) as NotebookContent;
    const hydrated = hydrateNotebookPages(ensured);
    expect(ensured.appearance).toBeUndefined();
    expect(hydrated.appearance).toBeUndefined();
    expect(JSON.stringify(hydrated).includes('"appearance"')).toBe(false);
    // Resolve is read-time only
    const resolved = resolveNotebookAppearance(undefined);
    expect(resolved.identity.color).toBe(DEFAULT_NOTEBOOK_IDENTITY_COLOR);
    expect(ensured.appearance).toBeUndefined();
  });

  it.each([...NOTEBOOK_DESIGN_PRESET_IDS])('C: preset id %s round-trips', preset => {
    expect(
      sanitizeNotebookAppearance({ version: 1, identity: { preset } })?.identity?.preset,
    ).toBe(preset);
  });

  it.each([...NOTEBOOK_IDENTITY_COLORS])('C: color %s round-trips', color => {
    expect(
      sanitizeNotebookAppearance({ version: 1, identity: { color } })?.identity?.color,
    ).toBe(color);
  });

  it.each([...NOTEBOOK_IDENTITY_TREATMENTS])('C: treatment %s round-trips', treatment => {
    expect(
      sanitizeNotebookAppearance({ version: 1, identity: { treatment } })?.identity?.treatment,
    ).toBe(treatment);
  });

  it.each([...NOTEBOOK_WRITING_WIDTHS])('C: width %s round-trips', width => {
    expect(
      sanitizeNotebookAppearance({ version: 1, writing: { width } })?.writing?.width,
    ).toBe(width);
  });

  it.each([...NOTEBOOK_WRITING_DENSITIES])('C: density %s round-trips', density => {
    expect(
      sanitizeNotebookAppearance({ version: 1, writing: { density } })?.writing?.density,
    ).toBe(density);
  });

  it('D: unknown enum values are dropped', () => {
    expect(
      sanitizeNotebookAppearance({
        version: 1,
        identity: { preset: 'neon', color: 'neon', treatment: 'neon' },
        writing: { width: 'huge', density: 'huge' },
      }),
    ).toBeUndefined();
  });

  it('E: unknown nested keys are dropped', () => {
    const out = sanitizeNotebookAppearance({
      version: 1,
      identity: { color: 'blue', glow: true, treatment: 'flat' },
      writing: { width: 'wide', margin: 9 },
      cover: { style: 'x' },
      page: { width: 'compact' },
      extra: true,
    });
    expect(out).toEqual({
      version: 1,
      identity: { color: 'blue', treatment: 'flat' },
      writing: { width: 'wide' },
    });
    expect(out).not.toHaveProperty('cover');
    expect(out).not.toHaveProperty('page');
    expect(JSON.stringify(out)).not.toContain('glow');
  });

  it('F: unknown version rejected safely', () => {
    expect(
      sanitizeNotebookAppearance({ version: 2, identity: { color: 'blue' } }),
    ).toBeUndefined();
    expect(() =>
      sanitizeNotebookAppearance({ version: '1', identity: { color: 'blue' } }),
    ).not.toThrow();
  });

  it('G: partial appearance resolves without mutating stored content', () => {
    const stored: NotebookAppearanceV1 = { version: 1, identity: { color: 'cyan' } };
    const copy = JSON.parse(JSON.stringify(stored));
    const resolved = resolveNotebookAppearance(stored);
    expect(resolved.identity.color).toBe('cyan');
    expect(resolved.identity.treatment).toBe('flat');
    expect(resolved.writing.width).toBe(DEFAULT_NOTEBOOK_WRITING_WIDTH);
    expect(resolved.writing.density).toBe(DEFAULT_NOTEBOOK_WRITING_DENSITY);
    expect(stored).toEqual(copy);
    expect(resolveNotebookIdentityColor(stored)).toBe('cyan');
    expect(resolveNotebookWritingWidth(undefined)).toBe(DEFAULT_NOTEBOOK_WRITING_WIDTH);
    expect(resolveNotebookWritingDensity(undefined)).toBe(DEFAULT_NOTEBOOK_WRITING_DENSITY);
  });
});

describe('H–I preset catalog', () => {
  it('H: every preset resolves into valid structured tokens', () => {
    for (const id of NOTEBOOK_DESIGN_PRESET_IDS) {
      const def = NOTEBOOK_DESIGN_PRESETS[id];
      expect(def.id).toBe(id);
      const tokens = resolveNotebookDesignPresetTokens(id);
      const sanitized = sanitizeNotebookAppearance({
        version: 1,
        ...tokens,
      });
      expect(sanitized?.identity?.preset).toBe(id);
      expect(sanitized?.identity?.color).toBe(def.identity.color);
      expect(sanitized?.identity?.treatment).toBe(def.identity.treatment);
      expect(sanitized?.writing?.width).toBe(def.writing.width);
      expect(sanitized?.writing?.density).toBe(def.writing.density);
      expect(appearanceMatchesNotebookDesignPreset(sanitized, id)).toBe(true);
    }
  });

  it('I: preset resolution does not touch body/page/codec', () => {
    const nb = baseNotebook();
    const before = snapshotBodies(nb);
    const fromPreset = appearanceFromNotebookDesignPreset('blueprint');
    expect(fromPreset.identity?.preset).toBe('blueprint');
    expect(snapshotBodies(nb)).toEqual(before);
    expect(nb.appearance).toBeUndefined();
  });

  it('custom divergence fails preset match', () => {
    const base = appearanceFromNotebookDesignPreset('midnight');
    expect(appearanceMatchesNotebookDesignPreset(base, 'midnight')).toBe(true);
    const tweaked: NotebookAppearanceV1 = {
      ...base,
      identity: { ...base.identity, color: 'orange' },
    };
    expect(appearanceMatchesNotebookDesignPreset(tweaked, 'midnight')).toBe(false);
  });
});

describe('J–N persistence + isolation', () => {
  it('J: appearance cloud persist round-trip', () => {
    const content = ensureProjectObjectContent(
      'notebook',
      baseNotebook({
        appearance: FULL_APPEARANCE,
        activePageId: 'page-3',
        activeSectionId: 'sec-notes',
      }),
    ) as NotebookContentWithPages;
    const bodiesBefore = snapshotBodies(content as NotebookContent);
    const cloud = prepareNotebookForCloudPersist(content, 'page-3') as NotebookContent;
    expect(cloud.appearance).toEqual(FULL_APPEARANCE);
    expect((cloud as { activePageId?: string }).activePageId).toBeUndefined();
    const pulled = ensureProjectObjectContent('notebook', cloud) as NotebookContent;
    expect(pulled.appearance).toEqual(FULL_APPEARANCE);
    expect(bodiesBefore.pages.find(p => p.id === 'page-3')).toEqual(
      snapshotBodies(pulled).pages.find(p => p.id === 'page-3'),
    );
  });

  it('K: whole-notebook tombstone restore preserves appearance', async () => {
    const content = ensureProjectObjectContent(
      'notebook',
      baseNotebook({ appearance: FULL_APPEARANCE }),
    ) as NotebookContent;
    const payload: ProjectSpaceObject = {
      id: 'nb-appearance-restore-1',
      type: 'notebook',
      title: 'Appearance Restore',
      content,
      createdAt: 1,
      updatedAt: 1,
    };
    const ts = makeTombstone(payload);
    await idbPut(TOMBSTONES_STORE, ts);
    window.localStorage.setItem(objectsKey(), JSON.stringify([]));

    const result = await restoreFromTombstone(ts, { userId: USER });
    expect(result).toEqual({ ok: true });

    const objects = JSON.parse(window.localStorage.getItem(objectsKey())!) as ProjectSpaceObject[];
    const restored = objects[0]!.content as NotebookContent;
    expect(restored.appearance).toEqual(FULL_APPEARANCE);
    expect(ensureProjectObjectContent('notebook', restored).appearance).toEqual(FULL_APPEARANCE);
    const remaining = await listTombstones(SECTION);
    expect(remaining.find(t => t.id === ts.id)).toBeUndefined();
  });

  it('L: page bodies remain intact when appearance is sanitized (page tombstone unaffected)', () => {
    const raw = baseNotebook({ appearance: FULL_APPEARANCE });
    const before = snapshotBodies(raw);
    const ensured = ensureProjectObjectContent('notebook', raw) as NotebookContent;
    expect(snapshotBodies(ensured).pages).toEqual(before.pages);
    // page-3 V1 codec pair preserved
    const p3 = ensured.pages?.find(p => p.id === 'page-3');
    expect(p3 && p3.kind === 'document' ? p3.documentBodyCodecVersion : null).toBe(1);
    expect(
      hasVersionedNotebookRecord(p3 && p3.kind === 'document' ? p3.documentBody ?? '' : ''),
    ).toBe(true);
  });

  it('M/N: mixed legacy/V1 pages + pageKey/body/codec isolation', () => {
    const appearance: NotebookAppearanceV1 = {
      version: 1,
      identity: { color: 'blue', treatment: 'flat' },
      writing: { width: 'wide', density: 'spacious' },
    };
    const raw = baseNotebook({ appearance });
    const before = snapshotBodies(raw);
    const ensured = ensureProjectObjectContent('notebook', raw) as NotebookContent;
    expect(ensured.appearance).toEqual(appearance);
    expect(snapshotBodies(ensured).pages).toEqual(before.pages);
    expect(hasVersionedNotebookRecord(ensured.body ?? '')).toBe(false);
    expect(ensured.bodyCodecVersion).toBeUndefined();
    const p1 = ensured.pages?.find(p => p.id === 'page-1');
    const p3 = ensured.pages?.find(p => p.id === 'page-3');
    expect(p1 && p1.kind === 'document' ? p1.documentBodyCodecVersion : 1).toBeUndefined();
    expect(p3 && p3.kind === 'document' ? p3.documentBodyCodecVersion : null).toBe(1);
  });
});

describe('O: no TipTap / content write from appearance model', () => {
  it('helpers are pure and do not invent TipTap writes', () => {
    const nb = baseNotebook();
    const jsonBefore = JSON.stringify(nb);
    resolveNotebookAppearance(undefined);
    appearanceFromNotebookDesignPreset('aurora');
    resolveNotebookDesignPresetTokens('ink');
    expect(JSON.stringify(nb)).toBe(jsonBefore);
  });
});
