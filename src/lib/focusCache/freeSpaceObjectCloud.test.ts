// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const upsertMock = vi.fn();
const selectEqMock = vi.fn();
const selectMock = vi.fn(() => ({ eq: selectEqMock }));

vi.mock('../supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      upsert: upsertMock,
      select: selectMock,
    })),
  },
  isSupabaseConfigured: true,
}));

import {
  fetchFreeSpaceObjectsForSection,
  upsertFreeSpaceObjectFromCreatePayload,
} from './freeSpaceObjectCloud';

beforeEach(() => {
  upsertMock.mockReset();
  upsertMock.mockResolvedValue({ error: null });
  selectMock.mockClear();
  selectEqMock.mockReset();
  selectEqMock.mockResolvedValue({ data: [], error: null });
});

describe('upsertFreeSpaceObjectFromCreatePayload', () => {
  it('upserts on conflict id with expected row shape', async () => {
    const result = await upsertFreeSpaceObjectFromCreatePayload({
      userId: 'user-1',
      sectionId: '11111111-1111-1111-1111-111111111111',
      boardId: 'main',
      objectId: 'ps-note-1',
      object: { id: 'ps-note-1', type: 'note', title: 'N', content: { type: 'note', body: '' }, createdAt: 1, updatedAt: 1 },
    });

    expect(result).toEqual({ ok: true });
    expect(upsertMock).toHaveBeenCalledWith(
      {
        id: 'ps-note-1',
        user_id: 'user-1',
        section_id: '11111111-1111-1111-1111-111111111111',
        board_id: 'main',
        object: expect.objectContaining({ id: 'ps-note-1' }),
      },
      { onConflict: 'id' },
    );
  });

  it('rejects invalid ids without calling supabase', async () => {
    const result = await upsertFreeSpaceObjectFromCreatePayload({
      userId: '',
      sectionId: 'section-1',
      boardId: 'main',
      objectId: 'ps-note-1',
      object: { id: 'ps-note-1' },
    });
    expect(result).toEqual({ ok: false, reason: 'invalid_payload' });
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('maps supabase errors to cloud_write_failed', async () => {
    upsertMock.mockResolvedValue({ error: { message: 'RLS' } });
    const result = await upsertFreeSpaceObjectFromCreatePayload({
      userId: 'user-1',
      sectionId: '11111111-1111-1111-1111-111111111111',
      boardId: '',
      objectId: 'ps-note-1',
      object: { id: 'ps-note-1' },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('cloud_write_failed');
  });
});

describe('fetchFreeSpaceObjectsForSection', () => {
  it('selects by section_id and returns rows', async () => {
    selectEqMock.mockResolvedValue({
      data: [
        {
          id: 'ps-1',
          user_id: 'user-1',
          section_id: 'section-1',
          board_id: 'main',
          object: { id: 'ps-1', type: 'note', title: 'N', content: { type: 'note', body: '' }, createdAt: 1, updatedAt: 1 },
          created_at: 't',
          updated_at: 't',
        },
      ],
      error: null,
    });

    const result = await fetchFreeSpaceObjectsForSection('section-1');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.id).toBe('ps-1');
    expect(selectMock).toHaveBeenCalled();
    expect(selectEqMock).toHaveBeenCalledWith('section_id', 'section-1');
  });

  it('rejects empty sectionId without calling supabase', async () => {
    const result = await fetchFreeSpaceObjectsForSection('');
    expect(result).toEqual({ ok: false, reason: 'invalid_payload' });
    expect(selectMock).not.toHaveBeenCalled();
  });

  it('maps supabase errors to cloud_read_failed', async () => {
    selectEqMock.mockResolvedValue({ data: null, error: { message: 'network' } });
    const result = await fetchFreeSpaceObjectsForSection('section-1');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('cloud_read_failed');
  });

  it('17. does not call delete', async () => {
    const from = (await import('../supabase')).supabase.from as unknown as ReturnType<typeof vi.fn>;
    await fetchFreeSpaceObjectsForSection('section-1');
    const builder = from.mock.results[0]?.value as Record<string, unknown>;
    expect(builder.delete).toBeUndefined();
  });
});
