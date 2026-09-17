import type { BlockPos } from '../../hooks/useBlockPositions';
import type { ProjectSpaceObject } from '../../hooks/useSectionFreeSpaceObjects';
import type { NotebookPage } from '../notebookPages/types';

/** Serializable notebook block snapshot (mirrors ProjectNotebookBlock block shapes). */
export type NotebookBlockSnapshot = Record<string, unknown> & { id: string; kind: string };

export type TombstoneKind = 'free_space_object' | 'notebook_block' | 'notebook_page';

export interface TombstoneBase {
  id: string;
  kind: TombstoneKind;
  sectionId: string;
  boardId: string;
  deletedAt: number;
  expiresAt: number;
  /** Human-readable label for recovery UI */
  label: string;
}

export interface FreeSpaceObjectTombstone extends TombstoneBase {
  kind: 'free_space_object';
  objectId: string;
  objectType: string;
  payload: ProjectSpaceObject;
  position?: BlockPos;
}

export interface NotebookBlockTombstone extends TombstoneBase {
  kind: 'notebook_block';
  objectId: string;
  objectTitle: string;
  blockIndex: number;
  block: NotebookBlockSnapshot;
}

/**
 * M7.5C2 — Soft-deleted Notebook page (local knowledge journal).
 * Payload is a lossless NotebookPage snapshot; no documentBody re-encode.
 */
export interface NotebookPageTombstone extends TombstoneBase {
  kind: 'notebook_page';
  objectId: string;
  objectTitle: string;
  /** Exact page record at soft-delete time. */
  page: NotebookPage;
  /** section.pageIds index before removal. */
  indexInSection: number;
  /** page.sectionId at delete time (may differ from Free Space workspace sectionId). */
  sectionIdOfPage: string;
}

export type KnowledgeTombstone =
  | FreeSpaceObjectTombstone
  | NotebookBlockTombstone
  | NotebookPageTombstone;

export interface NotebookSnapshot {
  id: string;
  sectionId: string;
  boardId: string;
  objectId: string;
  objectTitle: string;
  body: string;
  bodyCodecVersion?: number;
  createdAt: number;
  /** Approximate edit generation when snapshot was taken */
  editGeneration: number;
}

export const TOMBSTONE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const SNAPSHOT_MAX_PER_NOTEBOOK = 30;
export const SNAPSHOT_EDIT_THRESHOLD = 40;
export const SNAPSHOT_DEBOUNCE_MS = 120_000;
