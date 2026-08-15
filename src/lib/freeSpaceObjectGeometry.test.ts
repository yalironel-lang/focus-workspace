// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  normalizeProjectSpaceObject,
  repairFreeSpaceObjectList,
  type ProjectSpaceObject,
} from '../hooks/useSectionFreeSpaceObjects';
import { buildFreeSpaceObjectWritePayload } from './focusCache/freeSpaceObjectCreateEnqueue';
import { parseCloudObjectForPull } from './focusCache/freeSpaceObjectPull';
import { mergeFreeSpaceObjects } from './freeSpaceLocalMerge';
import { stripPdfThumbnailsFromObjects } from './freeSpacePdfThumbIdb';
import {
  normalizeFreeSpaceObjectGeometry,
  type FreeSpaceObjectGeometry,
} from './freeSpaceObjectGeometry';

const SECTION = 'section-geom-a';

/** geometry.updatedAt uses the same client-ms convention as object.updatedAt (V1). */
const VALID_GEOMETRY: FreeSpaceObjectGeometry = {
  x: 120,
  y: -40,
  w: 320,
  h: 180,
  updatedAt: 1780000000000,
};

function legacyNote(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'ps-note-1',
    type: 'note',
    title: 'Note',
    content: { type: 'note', body: 'hello' },
    createdAt: 100,
    updatedAt: 200,
    ...overrides,
  };
}

describe('normalizeFreeSpaceObjectGeometry', () => {
  it('A: preserves identical valid geometry', () => {
    expect(normalizeFreeSpaceObjectGeometry(VALID_GEOMETRY)).toEqual(VALID_GEOMETRY);
  });

  it('B: preserves w/h = 0 (BlockPos auto/default)', () => {
    const geom: FreeSpaceObjectGeometry = {
      x: 10,
      y: 20,
      w: 0,
      h: 0,
      updatedAt: 1780000000000,
    };
    expect(normalizeFreeSpaceObjectGeometry(geom)).toEqual(geom);
  });

  it('C: omits NaN / Infinity / string / missing / invalid updatedAt', () => {
    expect(normalizeFreeSpaceObjectGeometry({ ...VALID_GEOMETRY, x: NaN })).toBeUndefined();
    expect(normalizeFreeSpaceObjectGeometry({ ...VALID_GEOMETRY, y: Infinity })).toBeUndefined();
    expect(normalizeFreeSpaceObjectGeometry({ ...VALID_GEOMETRY, w: '-1' })).toBeUndefined();
    expect(normalizeFreeSpaceObjectGeometry({ y: -40, w: 320, h: 180, updatedAt: 1780000000000 })).toBeUndefined();
    expect(normalizeFreeSpaceObjectGeometry({ ...VALID_GEOMETRY, updatedAt: 0 })).toBeUndefined();
    expect(normalizeFreeSpaceObjectGeometry({ ...VALID_GEOMETRY, updatedAt: -1 })).toBeUndefined();
    expect(normalizeFreeSpaceObjectGeometry({ ...VALID_GEOMETRY, updatedAt: NaN })).toBeUndefined();
    expect(normalizeFreeSpaceObjectGeometry({ ...VALID_GEOMETRY, h: Number.POSITIVE_INFINITY })).toBeUndefined();
  });

  it('omits negative w/h and non-objects rather than clamping', () => {
    expect(normalizeFreeSpaceObjectGeometry({ ...VALID_GEOMETRY, w: -1 })).toBeUndefined();
    expect(normalizeFreeSpaceObjectGeometry({ ...VALID_GEOMETRY, h: -8 })).toBeUndefined();
    expect(normalizeFreeSpaceObjectGeometry(null)).toBeUndefined();
    expect(normalizeFreeSpaceObjectGeometry([{ ...VALID_GEOMETRY }])).toBeUndefined();
  });

  it('drops unknown extra keys on an otherwise valid geometry object', () => {
    expect(
      normalizeFreeSpaceObjectGeometry({ ...VALID_GEOMETRY, extra: true, panX: 3 }),
    ).toEqual(VALID_GEOMETRY);
  });
});

describe('normalizeProjectSpaceObject geometry', () => {
  it('A: valid geometry survives object normalization', () => {
    const n = normalizeProjectSpaceObject(legacyNote({ geometry: VALID_GEOMETRY }));
    expect(n?.geometry).toEqual(VALID_GEOMETRY);
  });

  it('B: w/h = 0 survives on the object', () => {
    const geometry: FreeSpaceObjectGeometry = {
      x: 8,
      y: 9,
      w: 0,
      h: 0,
      updatedAt: 1780000000000,
    };
    const n = normalizeProjectSpaceObject(legacyNote({ geometry }));
    expect(n?.geometry).toEqual(geometry);
  });

  it('C: invalid geometry is omitted entirely (no partial accept)', () => {
    const cases: unknown[] = [
      { ...VALID_GEOMETRY, x: NaN },
      { ...VALID_GEOMETRY, y: Infinity },
      { ...VALID_GEOMETRY, w: '320' },
      { x: 120, y: -40, w: 320, h: 180 },
      { ...VALID_GEOMETRY, updatedAt: 0 },
      { x: 120 },
    ];
    for (const geometry of cases) {
      const n = normalizeProjectSpaceObject(legacyNote({ geometry }));
      expect(n).not.toBeNull();
      expect(n).not.toHaveProperty('geometry');
    }
  });

  it('D: legacy object without geometry stays geometry === undefined', () => {
    const n = normalizeProjectSpaceObject(legacyNote());
    expect(n).not.toBeNull();
    expect(n).not.toHaveProperty('geometry');
    expect(n?.geometry).toBeUndefined();
  });

  it('E: unrelated unknown fields are still dropped', () => {
    const n = normalizeProjectSpaceObject(
      legacyNote({
        geometry: VALID_GEOMETRY,
        mystery: 1,
        panX: 99,
        extra: { nested: true },
      }),
    );
    expect(n).not.toBeNull();
    expect(n).not.toHaveProperty('mystery');
    expect(n).not.toHaveProperty('panX');
    expect(n).not.toHaveProperty('extra');
    expect(n?.geometry).toEqual(VALID_GEOMETRY);
  });

  it('F: content fields remain unaffected', () => {
    const n = normalizeProjectSpaceObject(
      legacyNote({
        title: 'Kept title',
        content: { type: 'note', body: 'kept body' },
        viewMode: 'split',
        splitSide: 'left',
        geometry: VALID_GEOMETRY,
      }),
    );
    expect(n?.title).toBe('Kept title');
    expect(n?.content).toEqual({ type: 'note', body: 'kept body' });
    expect(n?.viewMode).toBe('split');
    expect(n?.splitSide).toBe('left');
    expect(n?.createdAt).toBe(100);
    expect(n?.updatedAt).toBe(200);
    expect(n?.geometry).toEqual(VALID_GEOMETRY);
  });
});

describe('geometry serialization / copy paths', () => {
  it('G: round-trips through repair, JSON persist, write payload, pull parse, merge, strip', () => {
    const { objects } = repairFreeSpaceObjectList(
      [legacyNote({ geometry: VALID_GEOMETRY, mystery: 'drop-me' })],
      SECTION,
    );
    expect(objects).toHaveLength(1);
    expect(objects[0].geometry).toEqual(VALID_GEOMETRY);
    expect(objects[0]).not.toHaveProperty('mystery');

    const persisted = JSON.parse(JSON.stringify(objects)) as unknown;
    const repairedAgain = repairFreeSpaceObjectList(persisted, SECTION).objects;
    expect(repairedAgain[0].geometry).toEqual(VALID_GEOMETRY);

    const payload = buildFreeSpaceObjectWritePayload('main', repairedAgain[0]);
    expect(payload).not.toBeNull();
    const payloadObj = (payload as unknown as { object: ProjectSpaceObject }).object;
    expect(payloadObj.geometry).toEqual(VALID_GEOMETRY);

    const fromPull = parseCloudObjectForPull(payloadObj, SECTION);
    expect(fromPull?.geometry).toEqual(VALID_GEOMETRY);

    const { merged } = mergeFreeSpaceObjects([], repairedAgain);
    expect(merged[0].geometry).toEqual(VALID_GEOMETRY);

    const stripped = stripPdfThumbnailsFromObjects(repairedAgain);
    expect(stripped[0].geometry).toEqual(VALID_GEOMETRY);
  });

  it('G: spread/replace helpers keep geometry when present', () => {
    const n = normalizeProjectSpaceObject(legacyNote({ geometry: VALID_GEOMETRY }))!;
    const spread: ProjectSpaceObject = { ...n, updatedAt: 300 };
    expect(spread.geometry).toEqual(VALID_GEOMETRY);
    const duplicateLike: ProjectSpaceObject = {
      ...n,
      id: 'ps-note-dup',
      createdAt: 400,
      updatedAt: 400,
    };
    expect(duplicateLike.geometry).toEqual(VALID_GEOMETRY);
  });

  it('does not invent geometry for a repaired legacy list', () => {
    const { objects, repaired } = repairFreeSpaceObjectList([legacyNote()], SECTION);
    expect(repaired).toBe(false);
    expect(objects[0].geometry).toBeUndefined();
    expect(objects[0]).not.toHaveProperty('geometry');
  });
});
