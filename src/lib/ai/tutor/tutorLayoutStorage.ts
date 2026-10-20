/**
 * Tutor layout preferences, scoped by authenticated user and course section.
 *
 * Key: focus.tutor_layout_v1:{userId}:{sectionId}
 *
 * This record is not the conversation. It must never be written into
 * focus.tutor_conversation_v1, and reset must never clear turns, draft, mode,
 * or capture.
 *
 * Rollback:
 * - Older builds ignore this key. They still position the floating card from
 *   conversation `presentation` (width, height, position, scroll).
 * - This build prefers the layout record once one exists, and only reads
 *   conversation presentation when no layout record has been stored yet.
 * - M0 sessions with `intent: null` remain on the conversation key. An older
 *   build that requires a capture deletes those sessions on read. That does
 *   not delete this layout key, and this module does not write `intent`.
 * - Placement values such as `top-dock` are not written onto the conversation.
 * - M3 draws a side dock only when the composition is wide enough to keep the
 *   PDF and Notebook usable. Below that width the stored side placement stays
 *   stored and the top dock is shown. The fallback does not rewrite placement.
 *
 * Placement origin:
 * - M1 had no placement picker. The only rendered surface was floating, and the
 *   first saved record used `placement: "floating"` automatically. Those
 *   records have no `placementOrigin`.
 * - On read, a version-1 record with no origin is migrated once:
 *   - `floating`, or `minimized` whose restore placement is `floating`, becomes
 *     the compact top dock (minimized stays minimized, but restores to top-dock).
 *     Saved floating geometry is kept so a later Float action can reopen it.
 *   - `top-dock`, `side-left`, and `side-right` keep their placement and are
 *     marked `explicit`, because M1's UI never wrote those values.
 * - `placementOrigin: "explicit"` is never rewritten by this migration.
 * - Limitation: someone who only dragged the M1 floating window cannot be
 *   distinguished from the automatic seed. They land on the compact dock;
 *   their window rectangle is preserved. Choosing Float, Dock, or Reset
 *   afterwards is stored as an explicit choice.
 */

export const TUTOR_LAYOUT_STORAGE_VERSION = 1 as const;

export const TUTOR_LAYOUT_PLACEMENTS = [
  'top-dock',
  'side-left',
  'side-right',
  'floating',
  'minimized',
] as const;

export type TutorPlacement = (typeof TUTOR_LAYOUT_PLACEMENTS)[number];
export type TutorDockPlacement = Exclude<TutorPlacement, 'minimized'>;
/** `implicit` is the automatic compact dock. `explicit` is a user or API choice. */
export type TutorPlacementOrigin = 'implicit' | 'explicit';
export type TutorSurfaceVisual =
  | 'compact'
  | 'expanded'
  | 'floating'
  | 'minimized'
  | 'side-left'
  | 'side-right';

export const TUTOR_FLOAT_MIN_WIDTH = 360;
export const TUTOR_FLOAT_MIN_HEIGHT = 320;
export const TUTOR_FLOAT_MAX_WIDTH = 800;
export const TUTOR_FLOAT_MAX_HEIGHT = 800;
export const TUTOR_TOP_DOCK_HEIGHT_MIN = 48;
export const TUTOR_TOP_DOCK_HEIGHT_MAX = 480;
/** Fixed compact bar. This is not stored in `topDockHeight`. */
export const TUTOR_TOP_DOCK_COMPACT_HEIGHT = 52;
export const TUTOR_TOP_DOCK_COMPACT_HEIGHT_NARROW = 56;
/** Expanded conversation height. Values below this in storage are treated as unset. */
export const TUTOR_TOP_DOCK_EXPANDED_MIN = 160;
/**
 * Extra upward travel, past the expanded minimum, required before a drag
 * can fully collapse the dock. The dock stays at the minimum until release.
 */
export const TUTOR_TOP_DOCK_COLLAPSE_PAST_PX = 48;
export const TUTOR_TOP_DOCK_EXPANDED_DEFAULT = 280;
export const TUTOR_SIDE_DOCK_WIDTH_MIN = 280;
export const TUTOR_SIDE_DOCK_WIDTH_MAX = 480;
/**
 * Widths for drawing a side dock. Storage still accepts 280–480.
 * The rendered dock is never narrower than 320, and it is not drawn at all
 * unless the PDF and Notebook keep the reserve below.
 *
 * The split's hard floor is still 320px per pane. That floor is only the
 * point where the divider stops. Two 320px panes plus a dock (about 968px)
 * is a technical fit, not a comfortable study layout, so it is not the
 * threshold used here.
 *
 * Reserve while a side dock is open:
 * - 560px PDF column, enough for the page and its toolbar
 * - 440px notebook column
 * - 8px split divider
 * A dock of at least 320px therefore needs 1328px of composition width.
 * At 1280px a 360px dock would leave about 460px per pane, under the PDF
 * reserve, so the top dock is used instead. The default 360px dock fits
 * without clamping from 1440px upward (1440 - 360 = 1080 for the pair).
 */
export const TUTOR_SIDE_PDF_COMFORT_PX = 560;
export const TUTOR_SIDE_NOTEBOOK_COMFORT_PX = 440;
export const TUTOR_SIDE_SPLIT_DIVIDER_PX = 8;
export const TUTOR_SIDE_STUDY_RESERVE_PX =
  TUTOR_SIDE_PDF_COMFORT_PX + TUTOR_SIDE_NOTEBOOK_COMFORT_PX + TUTOR_SIDE_SPLIT_DIVIDER_PX;
export const TUTOR_SIDE_DOCK_RENDER_MIN = 320;
export const TUTOR_SIDE_DOCK_DEFAULT = 360;
export const TUTOR_SIDE_DOCK_MIN_COMPOSITION_PX =
  TUTOR_SIDE_STUDY_RESERVE_PX + TUTOR_SIDE_DOCK_RENDER_MIN;

export interface TutorViewport {
  width: number;
  height: number;
}

export interface TutorFloatingGeometry {
  width: number;
  height: number;
  positionX: number;
  positionY: number;
}

/** Geometry fields already stored on legacy Tutor conversation sessions. */
export interface TutorLegacyFloatingSource {
  width?: number;
  height?: number;
  positionX?: number;
  positionY?: number;
}

export interface TutorLayoutPreferences {
  version: typeof TUTOR_LAYOUT_STORAGE_VERSION;
  userId: string;
  sectionId: string;
  placement: TutorPlacement;
  /** Placement to return to from minimized. Never `minimized`. */
  restorePlacement: TutorDockPlacement;
  /**
   * Missing on M1 records. `implicit` means the compact dock was chosen
   * automatically. `explicit` means a person or caller selected a placement.
   */
  placementOrigin: TutorPlacementOrigin;
  /** Expanded conversation height. The compact bar does not use this value. */
  topDockHeight?: number;
  /** True when the top dock should open expanded. Compact is the default. */
  topDockExpanded: boolean;
  /**
   * Temporary release of an expanded top dock. Distinct from compact
   * (`topDockExpanded: false`) and from `placement: 'minimized'`.
   * `topDockHeight` stays the height to restore.
   */
  expandedDockCollapsed?: boolean;
  /** Reserved for the left or right dock. Not rendered in M2. */
  sideDockWidth?: number;
  floating?: TutorFloatingGeometry;
  updatedAt: number;
}

export type TutorLayoutPatch = {
  placement?: TutorPlacement;
  restorePlacement?: TutorDockPlacement;
  placementOrigin?: TutorPlacementOrigin;
  floating?: Partial<TutorFloatingGeometry>;
  topDockHeight?: number | null;
  topDockExpanded?: boolean;
  expandedDockCollapsed?: boolean;
  sideDockWidth?: number | null;
};

const DOCK_PLACEMENTS: readonly TutorDockPlacement[] = [
  'top-dock',
  'side-left',
  'side-right',
  'floating',
];

function isNonEmptyId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isTutorPlacement(value: unknown): value is TutorPlacement {
  return typeof value === 'string' && (TUTOR_LAYOUT_PLACEMENTS as readonly string[]).includes(value);
}

export function isTutorDockPlacement(value: unknown): value is TutorDockPlacement {
  return typeof value === 'string' && (DOCK_PLACEMENTS as readonly string[]).includes(value);
}

export function tutorLayoutStorageKey(userId: string, sectionId: string): string {
  return `focus.tutor_layout_v1:${encodeURIComponent(userId.trim())}:${encodeURIComponent(sectionId.trim())}`;
}

export function currentTutorViewport(): TutorViewport {
  if (typeof window === 'undefined') return { width: 1200, height: 800 };
  const width = Number.isFinite(window.innerWidth) && window.innerWidth > 0 ? window.innerWidth : 1200;
  const height = Number.isFinite(window.innerHeight) && window.innerHeight > 0 ? window.innerHeight : 800;
  return { width, height };
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(max, Math.max(min, value));
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function clampTutorFloatingGeometry(
  geometry: TutorFloatingGeometry,
  viewport: TutorViewport,
): TutorFloatingGeometry {
  const width = Math.max(1, viewport.width);
  const height = Math.max(1, viewport.height);
  const narrow = width < 480;
  const minWidth = narrow ? Math.min(TUTOR_FLOAT_MIN_WIDTH, Math.max(160, width - 16)) : TUTOR_FLOAT_MIN_WIDTH;
  const maxWidth = Math.min(TUTOR_FLOAT_MAX_WIDTH, Math.max(minWidth, width - 16));
  const maxHeight = Math.min(TUTOR_FLOAT_MAX_HEIGHT, Math.max(TUTOR_FLOAT_MIN_HEIGHT, height - 60));
  const nextWidth = clamp(geometry.width, minWidth, maxWidth);
  const nextHeight = clamp(geometry.height, TUTOR_FLOAT_MIN_HEIGHT, maxHeight);
  const maxX = Math.max(8, width - 100);
  const maxY = Math.max(40, height - 80);
  return {
    width: Math.round(nextWidth),
    height: Math.round(nextHeight),
    positionX: Math.round(clamp(geometry.positionX, 8, maxX)),
    positionY: Math.round(clamp(geometry.positionY, 40, maxY)),
  };
}

export function defaultTutorFloatingGeometry(viewport: TutorViewport = currentTutorViewport()): TutorFloatingGeometry {
  const narrow = viewport.width < 480;
  return clampTutorFloatingGeometry(
    {
      width: narrow ? Math.min(450, Math.max(160, viewport.width - 16)) : 450,
      height: 500,
      positionX: narrow ? 8 : Math.max(20, viewport.width - 490),
      positionY: narrow ? 50 : 90,
    },
    viewport,
  );
}

export function legacyFloatingFromPresentation(
  presentation: TutorLegacyFloatingSource | null | undefined,
): Partial<TutorFloatingGeometry> | undefined {
  if (!presentation) return undefined;
  const floating: Partial<TutorFloatingGeometry> = {};
  const width = finiteNumber(presentation.width);
  const height = finiteNumber(presentation.height);
  const positionX = finiteNumber(presentation.positionX);
  const positionY = finiteNumber(presentation.positionY);
  if (width !== undefined && width > 0) floating.width = Math.round(width);
  if (height !== undefined && height > 0) floating.height = Math.round(height);
  if (positionX !== undefined) floating.positionX = Math.round(positionX);
  if (positionY !== undefined) floating.positionY = Math.round(positionY);
  return Object.keys(floating).length > 0 ? floating : undefined;
}

function sanitizeStoredFloating(value: unknown): TutorFloatingGeometry | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  const width = finiteNumber(raw.width);
  const height = finiteNumber(raw.height);
  const positionX = finiteNumber(raw.positionX);
  const positionY = finiteNumber(raw.positionY);
  if (width === undefined || height === undefined || positionX === undefined || positionY === undefined) {
    return undefined;
  }
  if (Math.abs(positionX) > 50_000 || Math.abs(positionY) > 50_000) return undefined;
  return {
    width: clamp(Math.round(width), 160, TUTOR_FLOAT_MAX_WIDTH),
    height: clamp(Math.round(height), TUTOR_FLOAT_MIN_HEIGHT, TUTOR_FLOAT_MAX_HEIGHT),
    positionX: Math.round(positionX),
    positionY: Math.round(positionY),
  };
}

function sanitizeDockLength(value: unknown, min: number, max: number): number | undefined {
  const parsed = finiteNumber(value);
  if (parsed === undefined || parsed <= 0) return undefined;
  return clamp(Math.round(parsed), min, max);
}

function defaultPreferences(userId: string, sectionId: string): TutorLayoutPreferences {
  return {
    version: TUTOR_LAYOUT_STORAGE_VERSION,
    userId: userId.trim(),
    sectionId: sectionId.trim(),
    placement: 'top-dock',
    restorePlacement: 'top-dock',
    placementOrigin: 'implicit',
    topDockExpanded: false,
    updatedAt: Date.now(),
  };
}

function isPlacementOrigin(value: unknown): value is TutorPlacementOrigin {
  return value === 'implicit' || value === 'explicit';
}

/**
 * M1 floating records had no origin. Move those to the compact dock once.
 * Side and top-dock records without an origin were not produced by the M1 UI,
 * so they are kept and marked explicit.
 */
function migrateMissingOrigin(prefs: TutorLayoutPreferences): TutorLayoutPreferences {
  const automaticFloating =
    prefs.placement === 'floating' ||
    (prefs.placement === 'minimized' && prefs.restorePlacement === 'floating');
  if (!automaticFloating) {
    return { ...prefs, placementOrigin: 'explicit' };
  }
  return {
    ...prefs,
    placement: prefs.placement === 'minimized' ? 'minimized' : 'top-dock',
    restorePlacement: 'top-dock',
    placementOrigin: 'implicit',
    topDockExpanded: false,
  };
}

/**
 * Width to draw for a stored side dock, or null when the composition should
 * keep the top dock. Does not write storage. A stored width above the room
 * available is clamped for drawing only.
 */
export function sideDockRenderWidth(
  stored: number | undefined,
  compositionWidth: number,
): number | null {
  if (!Number.isFinite(compositionWidth)) return null;
  const max = Math.min(
    TUTOR_SIDE_DOCK_WIDTH_MAX,
    Math.floor(compositionWidth - TUTOR_SIDE_STUDY_RESERVE_PX),
  );
  if (max < TUTOR_SIDE_DOCK_RENDER_MIN) return null;
  const preferred = stored === undefined ? TUTOR_SIDE_DOCK_DEFAULT : stored;
  return Math.max(TUTOR_SIDE_DOCK_RENDER_MIN, Math.min(max, preferred));
}

export function sideDockFits(compositionWidth: number): boolean {
  return sideDockRenderWidth(TUTOR_SIDE_DOCK_RENDER_MIN, compositionWidth) !== null;
}

/** Visual for a layout record. A side placement falls back to the top dock when it does not fit. */
export function tutorDockVisual(
  layout: TutorLayoutPreferences | null,
  compositionWidth?: number,
): TutorSurfaceVisual {
  const placement = layout?.placement ?? 'top-dock';
  if (placement === 'minimized') return 'minimized';
  if (placement === 'floating') return 'floating';
  if (
    (placement === 'side-left' || placement === 'side-right') &&
    compositionWidth !== undefined &&
    sideDockRenderWidth(layout?.sideDockWidth, compositionWidth) !== null
  ) {
    return placement;
  }
  if (layout?.expandedDockCollapsed) return 'compact';
  return layout?.topDockExpanded ? 'expanded' : 'compact';
}

export function resolveTutorSurface(
  layout: TutorLayoutPreferences | null,
  compositionWidth: number,
): { visual: TutorSurfaceVisual; sideWidth: number | null } {
  const visual = tutorDockVisual(layout, compositionWidth);
  const sideWidth =
    visual === 'side-left' || visual === 'side-right'
      ? sideDockRenderWidth(layout?.sideDockWidth, compositionWidth)
      : null;
  return { visual, sideWidth };
}

export function resolveTopDockExpandedHeight(
  stored: number | undefined,
  viewportHeight: number,
  narrow: boolean,
): number {
  const viewport = Math.max(1, viewportHeight);
  const cap = narrow
    ? Math.min(240, Math.max(TUTOR_TOP_DOCK_EXPANDED_MIN, Math.round(viewport * 0.4)))
    : Math.min(TUTOR_TOP_DOCK_HEIGHT_MAX, Math.max(TUTOR_TOP_DOCK_EXPANDED_MIN, Math.round(viewport * 0.45)));
  const min = Math.min(TUTOR_TOP_DOCK_EXPANDED_MIN, cap);
  const preferred =
    stored !== undefined && stored >= TUTOR_TOP_DOCK_EXPANDED_MIN ? stored : TUTOR_TOP_DOCK_EXPANDED_DEFAULT;
  return clamp(preferred, min, Math.max(min, cap));
}

function parseTutorLayout(
  raw: unknown,
  expectedUserId: string,
  expectedSectionId: string,
): (TutorLayoutPreferences & { originMissing?: boolean }) | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  if (record.version !== TUTOR_LAYOUT_STORAGE_VERSION) return null;
  if (record.userId !== expectedUserId || record.sectionId !== expectedSectionId) return null;
  if (!isTutorPlacement(record.placement)) return null;

  let restorePlacement: TutorDockPlacement;
  if (isTutorDockPlacement(record.restorePlacement)) {
    restorePlacement = record.restorePlacement;
  } else if (record.placement !== 'minimized' && isTutorDockPlacement(record.placement)) {
    restorePlacement = record.placement;
  } else if (record.placement === 'minimized') {
    restorePlacement = 'top-dock';
  } else {
    return null;
  }

  const updatedAt = finiteNumber(record.updatedAt);
  const originMissing = !isPlacementOrigin(record.placementOrigin);
  return {
    version: TUTOR_LAYOUT_STORAGE_VERSION,
    userId: expectedUserId,
    sectionId: expectedSectionId,
    placement: record.placement,
    restorePlacement,
    placementOrigin: originMissing ? 'implicit' : record.placementOrigin,
    floating: sanitizeStoredFloating(record.floating),
    topDockHeight: sanitizeDockLength(record.topDockHeight, TUTOR_TOP_DOCK_HEIGHT_MIN, TUTOR_TOP_DOCK_HEIGHT_MAX),
    topDockExpanded: record.topDockExpanded === true,
    ...(record.expandedDockCollapsed === true ? { expandedDockCollapsed: true as const } : {}),
    sideDockWidth: sanitizeDockLength(record.sideDockWidth, TUTOR_SIDE_DOCK_WIDTH_MIN, TUTOR_SIDE_DOCK_WIDTH_MAX),
    updatedAt: updatedAt ?? Date.now(),
    ...(originMissing ? { originMissing: true as const } : {}),
  } as TutorLayoutPreferences & { originMissing?: boolean };
}

function removeLayoutKey(userId: string, sectionId: string): void {
  try {
    localStorage.removeItem(tutorLayoutStorageKey(userId, sectionId));
  } catch {
    /* ignore */
  }
}

export function readTutorLayout(
  userId: string | null | undefined,
  sectionId: string | null | undefined,
): TutorLayoutPreferences | null {
  if (typeof localStorage === 'undefined') return null;
  if (!isNonEmptyId(userId) || !isNonEmptyId(sectionId)) return null;
  const user = userId.trim();
  const section = sectionId.trim();
  try {
    const key = tutorLayoutStorageKey(user, section);
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = parseTutorLayout(JSON.parse(raw), user, section);
    if (!parsed) {
      removeLayoutKey(user, section);
      return null;
    }
    const { originMissing, ...withoutFlag } = parsed;
    if (!originMissing) return withoutFlag;
    const migrated = migrateMissingOrigin(withoutFlag);
    try {
      localStorage.setItem(key, JSON.stringify(migrated));
    } catch {
      /* The in-memory preference is still the migrated dock. */
    }
    return migrated;
  } catch {
    removeLayoutKey(user, section);
    return null;
  }
}

export function resolveTutorFloatingGeometry(
  layout: TutorLayoutPreferences | null,
  legacy: TutorLegacyFloatingSource | null | undefined,
  viewport: TutorViewport = currentTutorViewport(),
): TutorFloatingGeometry {
  const defaults = defaultTutorFloatingGeometry(viewport);
  const source = layout ? layout.floating : legacyFloatingFromPresentation(legacy);
  if (!source) return defaults;
  return clampTutorFloatingGeometry(
    {
      width: source.width ?? defaults.width,
      height: source.height ?? defaults.height,
      positionX: source.positionX ?? defaults.positionX,
      positionY: source.positionY ?? defaults.positionY,
    },
    viewport,
  );
}

function mergeFloating(
  existing: TutorFloatingGeometry | undefined,
  patch: Partial<TutorFloatingGeometry> | undefined,
): TutorFloatingGeometry | undefined {
  if (!patch) return existing;
  const defaults = defaultTutorFloatingGeometry();
  return sanitizeStoredFloating({
    width: patch.width ?? existing?.width ?? defaults.width,
    height: patch.height ?? existing?.height ?? defaults.height,
    positionX: patch.positionX ?? existing?.positionX ?? defaults.positionX,
    positionY: patch.positionY ?? existing?.positionY ?? defaults.positionY,
  });
}

export function writeTutorLayout(
  userId: string | null | undefined,
  sectionId: string | null | undefined,
  patch: TutorLayoutPatch = {},
): boolean {
  if (typeof localStorage === 'undefined') return false;
  if (!isNonEmptyId(userId) || !isNonEmptyId(sectionId)) return false;
  if (patch.placement !== undefined && !isTutorPlacement(patch.placement)) return false;
  if (patch.restorePlacement !== undefined && !isTutorDockPlacement(patch.restorePlacement)) return false;

  const user = userId.trim();
  const section = sectionId.trim();
  const existing = readTutorLayout(user, section) ?? defaultPreferences(user, section);

  let placement = patch.placement ?? existing.placement;
  let restorePlacement = patch.restorePlacement ?? existing.restorePlacement;
  if (placement === 'minimized') {
    if (!patch.restorePlacement) {
      restorePlacement =
        existing.placement !== 'minimized' ? existing.placement : existing.restorePlacement;
    }
  } else if (patch.placement && !patch.restorePlacement) {
    restorePlacement = placement;
  }
  if (!isTutorDockPlacement(restorePlacement)) restorePlacement = 'top-dock';

  const placementOrigin: TutorPlacementOrigin =
    patch.placementOrigin ?? (patch.placement !== undefined ? 'explicit' : existing.placementOrigin);

  const floating = mergeFloating(existing.floating, patch.floating);
  let topDockHeight = existing.topDockHeight;
  let sideDockWidth = existing.sideDockWidth;
  let topDockExpanded = existing.topDockExpanded;
  let expandedDockCollapsed = existing.expandedDockCollapsed === true;
  if (patch.topDockHeight === null) topDockHeight = undefined;
  else if (patch.topDockHeight !== undefined) {
    topDockHeight = sanitizeDockLength(patch.topDockHeight, TUTOR_TOP_DOCK_HEIGHT_MIN, TUTOR_TOP_DOCK_HEIGHT_MAX);
  }
  if (patch.topDockExpanded !== undefined) topDockExpanded = patch.topDockExpanded;
  if (patch.expandedDockCollapsed !== undefined) expandedDockCollapsed = patch.expandedDockCollapsed;
  if (patch.sideDockWidth === null) sideDockWidth = undefined;
  else if (patch.sideDockWidth !== undefined) {
    sideDockWidth = sanitizeDockLength(patch.sideDockWidth, TUTOR_SIDE_DOCK_WIDTH_MIN, TUTOR_SIDE_DOCK_WIDTH_MAX);
  }

  const next: TutorLayoutPreferences = {
    version: TUTOR_LAYOUT_STORAGE_VERSION,
    userId: user,
    sectionId: section,
    placement,
    restorePlacement,
    placementOrigin,
    topDockExpanded,
    ...(expandedDockCollapsed ? { expandedDockCollapsed: true as const } : {}),
    ...(floating ? { floating } : {}),
    ...(topDockHeight !== undefined ? { topDockHeight } : {}),
    ...(sideDockWidth !== undefined ? { sideDockWidth } : {}),
    updatedAt: Date.now(),
  };

  try {
    localStorage.setItem(tutorLayoutStorageKey(user, section), JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}

export function minimizeTutorLayout(
  userId: string | null | undefined,
  sectionId: string | null | undefined,
): boolean {
  return writeTutorLayout(userId, sectionId, { placement: 'minimized' });
}

export function restoreTutorLayout(
  userId: string | null | undefined,
  sectionId: string | null | undefined,
): boolean {
  if (!isNonEmptyId(userId) || !isNonEmptyId(sectionId)) return false;
  const existing = readTutorLayout(userId, sectionId);
  const placement = existing?.restorePlacement ?? 'top-dock';
  return writeTutorLayout(userId, sectionId, { placement, restorePlacement: placement });
}

/**
 * Restores the compact top dock. Does not read or write the conversation key.
 * A default floating rectangle is kept so a later Float action has a window.
 */
export function resetTutorLayout(
  userId: string | null | undefined,
  sectionId: string | null | undefined,
  viewport: TutorViewport = currentTutorViewport(),
): boolean {
  if (typeof localStorage === 'undefined') return false;
  if (!isNonEmptyId(userId) || !isNonEmptyId(sectionId)) return false;
  const user = userId.trim();
  const section = sectionId.trim();
  const next: TutorLayoutPreferences = {
    version: TUTOR_LAYOUT_STORAGE_VERSION,
    userId: user,
    sectionId: section,
    placement: 'top-dock',
    restorePlacement: 'top-dock',
    placementOrigin: 'explicit',
    topDockExpanded: false,
    floating: defaultTutorFloatingGeometry(viewport),
    updatedAt: Date.now(),
  };
  try {
    localStorage.setItem(tutorLayoutStorageKey(user, section), JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}
