// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const upsertMock = vi.fn();

vi.mock('../supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      upsert: upsertMock,
    })),
  },
  isSupabaseConfigured: true,
}));

import { upsertFreeSpaceObjectFromCreatePayload } from './freeSpaceObjectCloud';

beforeEach(() => {
  upsertMock.mockReset();
  upsertMock.mockResolvedValue({ error: null });
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
