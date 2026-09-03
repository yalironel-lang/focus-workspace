/**
 * Mission Control V2 Phase 1 — canonical resource index contracts.
 *
 * Pure data only: no React callbacks, no searchableText field.
 * Upcoming (deadlines / exam_date) is intentionally NOT part of MissionControlItem;
 * a future MissionControlUpcomingItem projection will cover planning data separately.
 */

import type { ProjectObjectType } from '../../hooks/useSectionFreeSpaceObjects';
import type { CourseLinkType } from '../../types';

export type MissionControlSource = 'freespace' | 'shelf-item' | 'course-link';

export type MissionControlCategory =
  | 'pdf'
  | 'notebook'
  | 'sheet'
  | 'image'
  | 'link'
  | 'other';

/** Shelf resource types only — tasks are excluded before projection. */
export type ShelfItemResourceType = 'file' | 'link' | 'note';

export type MissionControlSourceKind =
  | { source: 'freespace'; type: ProjectObjectType }
  | { source: 'shelf-item'; type: ShelfItemResourceType }
  | { source: 'course-link'; type: CourseLinkType };

export type MissionControlCapabilities = {
  open: boolean;
  showInWorkspace: boolean;
  rename: boolean;
  delete: boolean;
  duplicate: boolean;
  /** Always false in Phase 1 — no move API is exposed. */
  move: boolean;
};

/**
 * Index-row vs openable-payload honesty.
 * Blob-backed Free Space content is typically `unknown` in Phase 1 (no sync IDB probe).
 */
export type MissionControlAvailability = {
  metadata: 'available' | 'unavailable';
  content: 'available' | 'unknown' | 'unavailable';
};

export type MissionControlPreview =
  | { kind: 'none' }
  | { kind: 'icon'; icon: string }
  | {
      kind: 'thumbnail';
      source: 'freespace-pdf-thumb' | 'freespace-image';
      objectId: string;
      sectionId: string;
      dataUrl?: string;
    }
  | { kind: 'favicon'; url: string };

export type MissionControlOpenAction =
  | { type: 'freespace-focus'; objectId: string; boardId: string }
  | { type: 'external-url'; url: string }
  | { type: 'shelf-file'; itemId: string; filePath: string }
  | { type: 'unavailable' };

export type MissionControlShowInWorkspaceAction =
  | { type: 'freespace-focus'; objectId: string; boardId: string }
  | { type: 'unavailable' };

export type MissionControlRelatedRef = {
  kind: string;
  id: string;
};

/**
 * Section-wide Free Space index completeness.
 *
 * - loading: cloud section fetch in progress (local items may already be present)
 * - partial: local items shown; cloud not yet successfully applied
 * - complete: `fetchFreeSpaceObjectsForSection` succeeded and was merged
 * - local-only: offline or cloud fetch failed — NEVER implies full Section completeness
 */
export type MissionControlIndexCompleteness =
  | 'loading'
  | 'partial'
  | 'complete'
  | 'local-only';

export interface MissionControlItem {
  id: string;
  source: MissionControlSource;
  sourceId: string;
  sectionId: string;
  sourceKind: MissionControlSourceKind;
  category: MissionControlCategory;
  title: string;
  subtitle: string | null;
  createdAt: number | null;
  updatedAt: number | null;
  /** Real open signal only — never copied from updatedAt. */
  lastOpenedAt: number | null;
  preview: MissionControlPreview;
  capabilities: MissionControlCapabilities;
  openAction: MissionControlOpenAction;
  showInWorkspaceAction: MissionControlShowInWorkspaceAction;
  availability: MissionControlAvailability;
  relatedRefs?: MissionControlRelatedRef[];
  boardId?: string;
}

export type MissionControlIndexResult = {
  items: MissionControlItem[];
  completeness: MissionControlIndexCompleteness;
  status: 'loading' | 'ready' | 'error';
};
