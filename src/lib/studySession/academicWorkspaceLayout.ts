/**
 * Academic workspace pane order and sizes.
 *
 * Key: focus.academic_workspace_v1:{userId}:{sectionId}
 *
 * This record is not the Tutor conversation and not the M3 Tutor layout.
 * Reading or writing it must not change focus.tutor_layout_v1 or
 * focus.tutor_conversation_v1.
 *
 * A missing record is derived from an existing side-left or side-right
 * placement. Top dock, floating, and minimized placements do not create one.
 */

export const ACADEMIC_WORKSPACE_VERSION = 1 as const;

export const WORKSPACE_PANE_IDS = ['pdf', 'notebook', 'tutor'] as const;
export type WorkspacePaneId = (typeof WORKSPACE_PANE_IDS)[number];

export const WORKSPACE_PANE_MIN_PX: Record<WorkspacePaneId, number> = {
  pdf: 360,
  notebook: 320,
  tutor: 320,
};

export const WORKSPACE_DEFAULT_SIZES: Record<WorkspacePaneId, number> = {
  pdf: 560,
  notebook: 440,
  tutor: 360,
};

export const WORKSPACE_DIVIDER_PX = 8;
export const WORKSPACE_THREE_PANE_MIN_PX = 1328;
export const WORKSPACE_DEFAULT_ORDER: readonly WorkspacePaneId[] = ['pdf', 'notebook', 'tutor'];

export interface AcademicWorkspacePreferences {
  version: typeof ACADEMIC_WORKSPACE_VERSION;
  order: WorkspacePaneId[];
  sizes: Record<WorkspacePaneId, number>;
  updatedAt: number;
}

export function academicWorkspaceStorageKey(userId: string, sectionId: string): string {
  return `focus.academic_workspace_v1:${encodeURIComponent(userId.trim())}:${encodeURIComponent(sectionId.trim())}`;
}

export function threePaneFits(compositionWidth: number): boolean {
  return compositionWidth >= WORKSPACE_THREE_PANE_MIN_PX;
}

export function isWorkspacePaneId(value: unknown): value is WorkspacePaneId {
  return value === 'pdf' || value === 'notebook' || value === 'tutor';
}

export function isWorkspaceOrder(value: unknown): value is WorkspacePaneId[] {
  if (!Array.isArray(value) || value.length !== 3) return false;
  const seen = new Set<WorkspacePaneId>();
  for (const entry of value) {
    if (!isWorkspacePaneId(entry) || seen.has(entry)) return false;
    seen.add(entry);
  }
  return seen.size === 3;
}

function positiveSize(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.round(value));
}

export function readAcademicWorkspace(
  userId: string | null | undefined,
  sectionId: string | null | undefined,
): AcademicWorkspacePreferences | null {
  if (typeof localStorage === 'undefined') return null;
  if (!userId?.trim() || !sectionId?.trim()) return null;
  const raw = localStorage.getItem(academicWorkspaceStorageKey(userId, sectionId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<AcademicWorkspacePreferences> & { sizes?: Partial<Record<WorkspacePaneId, number>> };
    if (parsed.version !== ACADEMIC_WORKSPACE_VERSION || !isWorkspaceOrder(parsed.order)) return null;
    return {
      version: ACADEMIC_WORKSPACE_VERSION,
      order: [...parsed.order],
      sizes: {
        pdf: positiveSize(parsed.sizes?.pdf, WORKSPACE_DEFAULT_SIZES.pdf),
        notebook: positiveSize(parsed.sizes?.notebook, WORKSPACE_DEFAULT_SIZES.notebook),
        tutor: positiveSize(parsed.sizes?.tutor, WORKSPACE_DEFAULT_SIZES.tutor),
      },
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0,
    };
  } catch {
    return null;
  }
}

export function writeAcademicWorkspace(
  userId: string | null | undefined,
  sectionId: string | null | undefined,
  prefs: Pick<AcademicWorkspacePreferences, 'order' | 'sizes'>,
): boolean {
  if (typeof localStorage === 'undefined') return false;
  if (!userId?.trim() || !sectionId?.trim()) return false;
  if (!isWorkspaceOrder(prefs.order)) return false;
  const next: AcademicWorkspacePreferences = {
    version: ACADEMIC_WORKSPACE_VERSION,
    order: [...prefs.order],
    sizes: {
      pdf: positiveSize(prefs.sizes.pdf, WORKSPACE_DEFAULT_SIZES.pdf),
      notebook: positiveSize(prefs.sizes.notebook, WORKSPACE_DEFAULT_SIZES.notebook),
      tutor: positiveSize(prefs.sizes.tutor, WORKSPACE_DEFAULT_SIZES.tutor),
    },
    updatedAt: Date.now(),
  };
  try {
    localStorage.setItem(academicWorkspaceStorageKey(userId, sectionId), JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}

export function deriveWorkspaceFromTutorLayout(layout: {
  placement?: string;
  sideDockWidth?: number;
} | null): AcademicWorkspacePreferences | null {
  if (!layout) return null;
  const tutor = positiveSize(layout.sideDockWidth, WORKSPACE_DEFAULT_SIZES.tutor);
  const sizes = { ...WORKSPACE_DEFAULT_SIZES, tutor: Math.max(WORKSPACE_PANE_MIN_PX.tutor, tutor) };
  if (layout.placement === 'side-right') {
    return { version: ACADEMIC_WORKSPACE_VERSION, order: ['pdf', 'notebook', 'tutor'], sizes, updatedAt: 0 };
  }
  if (layout.placement === 'side-left') {
    return { version: ACADEMIC_WORKSPACE_VERSION, order: ['tutor', 'pdf', 'notebook'], sizes, updatedAt: 0 };
  }
  return null;
}

export function movePane(
  order: readonly WorkspacePaneId[],
  pane: WorkspacePaneId,
  direction: -1 | 1,
): WorkspacePaneId[] {
  const index = order.indexOf(pane);
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= order.length) return [...order];
  const next = [...order];
  const swapped = next[index];
  next[index] = next[nextIndex];
  next[nextIndex] = swapped;
  return next;
}

/**
 * Fit preferred pixel sizes into the composition width.
 * Extra space goes to PDF and Notebook, so a saved Tutor width stays put
 * until the student resizes it. Overflow shrinks every pane above its floor,
 * and the result never exceeds the available width.
 */
export function fitPaneWidths(
  order: readonly WorkspacePaneId[],
  preferred: Partial<Record<WorkspacePaneId, number>> | undefined,
  containerWidth: number,
): Record<WorkspacePaneId, number> {
  const available = Math.max(
    0,
    Math.floor(containerWidth) - WORKSPACE_DIVIDER_PX * Math.max(0, order.length - 1),
  );
  const widths = {} as Record<WorkspacePaneId, number>;
  for (const id of order) {
    widths[id] = Math.max(WORKSPACE_PANE_MIN_PX[id], positiveSize(preferred?.[id], WORKSPACE_DEFAULT_SIZES[id]));
  }
  let sum = order.reduce((total, id) => total + widths[id], 0);
  if (sum > available) {
    let overflow = sum - available;
    while (overflow > 0) {
      const flexible = order.filter(id => widths[id] > WORKSPACE_PANE_MIN_PX[id]);
      if (flexible.length === 0) break;
      const capacity = flexible.reduce((total, id) => total + (widths[id] - WORKSPACE_PANE_MIN_PX[id]), 0);
      if (overflow >= capacity) {
        for (const id of flexible) widths[id] = WORKSPACE_PANE_MIN_PX[id];
        break;
      }
      let removed = 0;
      for (const id of flexible) {
        const room = widths[id] - WORKSPACE_PANE_MIN_PX[id];
        const cut = Math.min(room, Math.floor((overflow * room) / capacity));
        widths[id] -= cut;
        removed += cut;
      }
      overflow -= removed;
      if (removed === 0) {
        const id = flexible.reduce((best, candidate) => (widths[candidate] > widths[best] ? candidate : best));
        if (widths[id] <= WORKSPACE_PANE_MIN_PX[id]) break;
        widths[id] -= 1;
        overflow -= 1;
      }
    }
  } else if (sum < available) {
    const extra = available - sum;
    const targets = order.filter(id => id !== 'tutor');
    const receivers = targets.length > 0 ? targets : [...order];
    const weightOf = (id: WorkspacePaneId) => positiveSize(preferred?.[id], WORKSPACE_DEFAULT_SIZES[id]);
    const weightSum = receivers.reduce((total, id) => total + weightOf(id), 0);
    let given = 0;
    receivers.forEach((id, index) => {
      const share = index === receivers.length - 1
        ? extra - given
        : Math.round((extra * weightOf(id)) / weightSum);
      widths[id] += share;
      given += share;
    });
  }
  return widths;
}

/** Positive delta grows the pane on the left of the separator and shrinks the pane on the right. */
export function resizeAdjacent(
  order: readonly WorkspacePaneId[],
  widths: Record<WorkspacePaneId, number>,
  separatorIndex: number,
  deltaPx: number,
): Record<WorkspacePaneId, number> {
  const left = order[separatorIndex];
  const right = order[separatorIndex + 1];
  if (!left || !right) return { ...widths };
  const next = { ...widths };
  const applied = Math.max(
    -(next[left] - WORKSPACE_PANE_MIN_PX[left]),
    Math.min(next[right] - WORKSPACE_PANE_MIN_PX[right], Math.round(deltaPx)),
  );
  next[left] += applied;
  next[right] -= applied;
  return next;
}
