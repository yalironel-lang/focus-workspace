// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  buildFreeSpaceBoardRealtimePostgresBindings,
  isFreeSpaceBoardRealtimeDeleteInSectionScope,
  normalizeFreeSpaceBoardRealtimePayload,
} from './freeSpaceBoardRealtime';

const SECTION = 'section-rt-1';

describe('freeSpaceBoardRealtime', () => {
  it('D/E/F bindings use filtered INSERT/UPDATE and unfiltered DELETE (Option B)', () => {
    const bindings = buildFreeSpaceBoardRealtimePostgresBindings(SECTION);
    expect(bindings).toHaveLength(3);
    expect(bindings[0]).toMatchObject({ event: 'INSERT', filter: `section_id=eq.${SECTION}` });
    expect(bindings[1]).toMatchObject({ event: 'UPDATE', filter: `section_id=eq.${SECTION}` });
    expect(bindings[2]).toMatchObject({ event: 'DELETE', table: 'free_space_boards' });
    expect(bindings[2]?.filter).toBeUndefined();
  });

  it('normalizes INSERT for peer create', () => {
    const event = normalizeFreeSpaceBoardRealtimePayload(
      {
        eventType: 'INSERT',
        new: {
          id: 'board-new',
          section_id: SECTION,
          user_id: 'u1',
          name: 'New',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        old: {},
      },
      SECTION,
    );
    expect(event.ignored).toBe(false);
    expect(event.row?.id).toBe('board-new');
  });

  it('DELETE scoped to mounted section when section_id present', () => {
    expect(
      isFreeSpaceBoardRealtimeDeleteInSectionScope({ section_id: SECTION, id: 'b1' }, SECTION),
    ).toBe(true);
    expect(
      isFreeSpaceBoardRealtimeDeleteInSectionScope({ section_id: 'other', id: 'b1' }, SECTION),
    ).toBe(false);
  });

  it('id-only DELETE allowed through for mounted section fallback', () => {
    const event = normalizeFreeSpaceBoardRealtimePayload(
      { eventType: 'DELETE', old: { id: 'board-del' }, new: {} },
      SECTION,
    );
    expect(event.ignored).toBe(false);
    expect(event.row?.section_id).toBe(SECTION);
  });
});
