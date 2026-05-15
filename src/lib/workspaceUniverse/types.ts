/**
 * Workspace Universe — spatial home layer above project (section) workspaces.
 */

export const UNIVERSE_ROUTE = '/universe' as const;
export const LIBRARY_ROUTE = '/dashboard' as const;

export type WorkspaceHierarchyLevel = 'universe' | 'project' | 'subspace';

export interface WorkspaceNavigationState {
  /** Where project/subspace back navigation should return. */
  returnTo?: 'universe' | 'library';
  hierarchyLevel?: WorkspaceHierarchyLevel;
  /** Parent project (section) when inside a subspace. */
  parentSectionId?: string;
  /** Active subspace within a project (future UI). */
  subspaceId?: string;
}

export interface UniversePortalRecord {
  sectionId: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface UniverseCanvasSnapshot {
  zoom: number;
  panX: number;
  panY: number;
}

/** Future: multiple spatial regions inside one project. */
export interface ProjectSubspace {
  id: string;
  label: string;
  slug: string;
  isDefault: boolean;
  createdAt: string;
}

export const DEFAULT_SUBSPACE_ID = 'main';

export const SUBSPACE_PRESETS: { slug: string; label: string }[] = [
  { slug: 'main', label: 'Main' },
  { slug: 'exam-prep', label: 'Exam prep' },
  { slug: 'review', label: 'Review' },
  { slug: 'resources', label: 'Resources' },
  { slug: 'scratch', label: 'Ideas' },
];
