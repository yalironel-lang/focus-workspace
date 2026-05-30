import type { BlockPos } from '../../hooks/useBlockPositions';
import type { ProjectSpaceObject } from '../../hooks/useSectionFreeSpaceObjects';

/** Serializable notebook block snapshot (mirrors ProjectNotebookBlock block shapes). */
export type NotebookBlockSnapshot = Record<string, unknown> & { id: string; kind: string };

export type TombstoneKind = 'free_space_object' | 'notebook_block';

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

export type KnowledgeTombstone = FreeSpaceObjectTombstone | NotebookBlockTombstone;

export interface NotebookSnapshot {
  id: string;
  sectionId: string;
  boardId: string;
  objectId: string;
  objectTitle: string;
  body: string;
  createdAt: number;
  /** Approximate edit generation when snapshot was taken */
  editGeneration: number;
}

export const TOMBSTONE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const SNAPSHOT_MAX_PER_NOTEBOOK = 30;
export const SNAPSHOT_EDIT_THRESHOLD = 40;
export const SNAPSHOT_DEBOUNCE_MS = 120_000;
