/**
 * @vitest-environment node
 *
 * M0.7B.3 — flush hooks call knowledge wiring after durable Storage / FSO success.
 * Mocks only: no real Storage / network / provider.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CacheNamespace } from '../focusCacheNamespace';
import type { PendingOperation } from './types';

const notifyPdf = vi.fn();
const notifyFso = vi.fn();

vi.mock('../ai/knowledgeProcessHandoff/pdfKnowledgeWiring', () => ({
  notifyPdfStorageUploadSucceededSafe: (...args: unknown[]) => notifyPdf(...args),
  notifyFreeSpaceObjectCloudWriteSucceededSafe: (...args: unknown[]) => notifyFso(...args),
}));

vi.mock('./pendingOperations', () => ({
  listPendingOperations: vi.fn(),
  removePendingOperation: vi.fn(),
}));

vi.mock('./freeSpaceObjectCloud', () => ({
  upsertFreeSpaceObjectFromCreatePayload: vi.fn(),
  deleteFreeSpaceObjectFromCloud: vi.fn(),
}));

vi.mock('./freeSpaceBoardCloud', () => ({
  upsertFreeSpaceBoardFromPayload: vi.fn(),
  deleteFreeSpaceBoardFromCloud: vi.fn(),
}));

vi.mock('../userContentAssetFlush', () => ({
  isUserContentAssetWrite: (op: PendingOperation) =>
    op.entityType === 'user_content_asset',
  processUserContentAssetOp: vi.fn(),
}));

vi.mock('../freeSpacePersistence', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../freeSpacePersistence')>();
  return { ...actual, fwPersistWarn: vi.fn() };
});

import { upsertFreeSpaceObjectFromCreatePayload } from './freeSpaceObjectCloud';
import { flushPendingFreeSpaceCreates } from './flushPendingFreeSpaceCreates';
import {
  listPendingOperations,
  removePendingOperation,
} from './pendingOperations';
import { processUserContentAssetOp } from '../userContentAssetFlush';

const listMock = vi.mocked(listPendingOperations);
const removeMock = vi.mocked(removePendingOperation);
const upsertMock = vi.mocked(upsertFreeSpaceObjectFromCreatePayload);
const processAssetMock = vi.mocked(processUserContentAssetOp);

const ns: CacheNamespace = {
  userId: 'user-1',
  workspaceId: '11111111-1111-1111-1111-111111111111',
};

function pdfUploadOp(): PendingOperation {
  return {
    seq: 1,
    id: 'op-pdf-upload',
    userId: ns.userId,
    workspaceId: ns.workspaceId,
    entityType: 'user_content_asset',
    entityId: `${ns.workspaceId}/ps-pdf-1/pdf/ps-pdf-1`,
    operationType: 'update',
    payload: {
      version: 1,
      assetOp: 'upload',
      userId: ns.userId,
      sectionId: ns.workspaceId,
      objectId: 'ps-pdf-1',
      assetType: 'pdf',
      assetId: 'ps-pdf-1',
      storagePath: `${ns.userId}/${ns.workspaceId}/ps-pdf-1/pdf/ps-pdf-1`,
      localRef: { store: 'pdf', key: 'ps-pdf-1' },
      contentType: 'application/pdf',
      updatedAt: 10,
      byteLength: 12,
    },
  };
}

function imageUploadOp(): PendingOperation {
  const op = pdfUploadOp();
  return {
    ...op,
    id: 'op-img-upload',
    entityId: `${ns.workspaceId}/ps-img-1/spatial-image/ps-img-1`,
    payload: {
      ...(op.payload as Record<string, unknown>),
      objectId: 'ps-img-1',
      assetType: 'spatial-image',
      assetId: 'ps-img-1',
      storagePath: `${ns.userId}/${ns.workspaceId}/ps-img-1/spatial-image/ps-img-1`,
      contentType: 'image/png',
    },
  };
}

function fsoCreateOp(): PendingOperation {
  return {
    seq: 2,
    id: 'op-fso',
    userId: ns.userId,
    workspaceId: ns.workspaceId,
    entityType: 'free_space_object',
    entityId: 'ps-pdf-1',
    operationType: 'create',
    payload: {
      boardId: 'main',
      object: {
        id: 'ps-pdf-1',
        type: 'pdf',
        title: 'PDF',
        content: { type: 'pdf' },
        createdAt: 1,
        updatedAt: 10,
      },
    },
  };
}

beforeEach(() => {
  notifyPdf.mockReset();
  notifyFso.mockReset();
  listMock.mockReset();
  removeMock.mockReset();
  upsertMock.mockReset();
  processAssetMock.mockReset();
  upsertMock.mockResolvedValue({ ok: true });
  removeMock.mockResolvedValue({ ok: true, value: { removed: true } });
  processAssetMock.mockResolvedValue({ ok: true });
});

describe('M0.7B.3 flush → knowledge wiring', () => {
  it('successful PDF Storage upload notifies knowledge handoff', async () => {
    listMock.mockResolvedValue({ ok: true, value: [pdfUploadOp()] });
    const result = await flushPendingFreeSpaceCreates(ns);
    expect(result.stoppedReason).toBeUndefined();
    expect(result.failedCloud).toBe(0);
    // Dynamic import is async — wait briefly.
    await vi.waitFor(() => expect(notifyPdf).toHaveBeenCalledTimes(1));
    expect(notifyPdf).toHaveBeenCalledWith({
      userId: ns.userId,
      sectionId: ns.workspaceId,
      sourceObjectId: 'ps-pdf-1',
    });
  });

  it('non-PDF upload does not notify PDF knowledge handoff', async () => {
    listMock.mockResolvedValue({ ok: true, value: [imageUploadOp()] });
    await flushPendingFreeSpaceCreates(ns);
    await new Promise(r => setTimeout(r, 40));
    expect(notifyPdf).not.toHaveBeenCalled();
  });

  it('failed Storage upload does not notify knowledge handoff', async () => {
    processAssetMock.mockResolvedValue({ ok: false, reason: 'upload_failed' });
    listMock.mockResolvedValue({ ok: true, value: [pdfUploadOp()] });
    const result = await flushPendingFreeSpaceCreates(ns);
    expect(result.stoppedReason).toBe('cloud_write_failed');
    await new Promise(r => setTimeout(r, 40));
    expect(notifyPdf).not.toHaveBeenCalled();
  });

  it('successful FSO upsert notifies FSO knowledge drain hook', async () => {
    listMock.mockResolvedValue({ ok: true, value: [fsoCreateOp()] });
    await flushPendingFreeSpaceCreates(ns);
    await vi.waitFor(() => expect(notifyFso).toHaveBeenCalledTimes(1));
    expect(notifyFso).toHaveBeenCalledWith({
      userId: ns.userId,
      sectionId: ns.workspaceId,
      objectId: 'ps-pdf-1',
    });
  });

  it('knowledge notify throw cannot turn successful PDF upload into cloud_write_failed', async () => {
    notifyPdf.mockImplementation(() => {
      throw new Error('handoff boom');
    });
    listMock.mockResolvedValue({ ok: true, value: [pdfUploadOp()] });
    const result = await flushPendingFreeSpaceCreates(ns);
    expect(result.stoppedReason).toBeUndefined();
    expect(result.failedCloud).toBe(0);
    expect(result.removed).toBe(1);
    await new Promise(r => setTimeout(r, 40));
  });
});
