import { useRef, useEffect, type CSSProperties, type ReactNode } from 'react';
import {
  clamp01,
  clampRatioForWidth,
  formatFlexBasis,
  DEFAULT_MIN_SURFACE_PX,
} from '../../lib/studySession/twoSurfaceGeometry';

export interface TwoSurfaceLayoutProps {
  /** Desired split ratio for surface A (0.0 to 1.0, e.g. 0.5 for balanced). */
  ratio?: number;
  /** Callback fired during drag with transient preview ratio. */
  onRatioChange?: (ratio: number) => void;
  /** Callback fired on pointer release with committed ratio. */
  onRatioCommit?: (ratio: number) => void;
  /** Minimum pixel width for surface A. Defaults to 320px. */
  minSurfaceAPx?: number;
  /** Minimum pixel width for surface B. Defaults to 320px. */
  minSurfaceBPx?: number;
  /** When true, layout switches to single column or stacked layout without divider dragging. */
  isNarrow?: boolean;
  /** When isNarrow is true, specifies which single pane is visually active ('a' or 'b'). Defaults to undefined (legacy behavior). */
  activePane?: 'a' | 'b';
  /** Direction override (defaults to column when isNarrow, row otherwise). */
  direction?: 'row' | 'column';
  /** Primary / Left surface content. */
  surfaceA: ReactNode;
  /** Secondary / Right surface content. */
  surfaceB: ReactNode;
  /** Border color for panel divider and boundaries. */
  dividerBorderColor?: string;
  /** Width in pixels of divider hit target. Defaults to 8px. */
  dividerWidthPx?: number;
  /** Transition style for pane adjustments. Defaults to 'flex 0.2s ease'. */
  paneTransition?: string;
  /** Optional container style overrides. */
  style?: CSSProperties;
  /** Optional surface A wrapper style overrides. */
  surfaceAStyle?: CSSProperties;
  /** Optional surface B wrapper style overrides. */
  surfaceBStyle?: CSSProperties;
}

/**
 * GenericTwoSurfaceLayout — pure presentation layout primitive for two side-by-side surfaces
 * separated by a draggable pointer-captured divider.
 *
 * Extracted from StudySessionShell mechanics:
 * - Owns NO persistence.
 * - Owns NO domain or academic object state.
 * - Handles pointer capture and ratio clamping.
 * - Never remounts surfaceA or surfaceB during ratio changes or activePane switching.
 */
export function TwoSurfaceLayout({
  ratio = 0.5,
  onRatioChange,
  onRatioCommit,
  minSurfaceAPx = DEFAULT_MIN_SURFACE_PX,
  minSurfaceBPx = DEFAULT_MIN_SURFACE_PX,
  isNarrow = false,
  activePane,
  direction,
  surfaceA,
  surfaceB,
  dividerBorderColor = 'rgba(255, 255, 255, 0.08)',
  dividerWidthPx = 8,
  paneTransition = 'flex 0.2s ease',
  style,
  surfaceAStyle,
  surfaceBStyle,
}: TwoSurfaceLayoutProps) {
  const bodyRef = useRef<HTMLDivElement>(null);

  // If activePane is explicitly set, we render in single-active mode
  const singlePaneMode = isNarrow && Boolean(activePane);

  const effectiveRatio = clamp01(ratio);
  const flexA = isNarrow ? '1 1 auto' : `0 0 ${formatFlexBasis(effectiveRatio)}`;
  const flexB = isNarrow ? '1 1 auto' : `1 1 ${formatFlexBasis(1 - effectiveRatio)}`;

  const setRatio = (next: number, commit = false) => {
    const width = bodyRef.current?.getBoundingClientRect().width ?? (typeof window !== 'undefined' ? window.innerWidth : 1000);
    const clamped = clampRatioForWidth(next, width, minSurfaceAPx, minSurfaceBPx);
    onRatioChange?.(clamped);
    if (commit) onRatioCommit?.(clamped);
  };

  const dragCleanupRef = useRef<(() => void) | null>(null);

  // Clean up any ongoing drag if isNarrow becomes true or on unmount
  useEffect(() => {
    if (isNarrow && dragCleanupRef.current) {
      dragCleanupRef.current();
    }
    return () => {
      if (dragCleanupRef.current) {
        dragCleanupRef.current();
      }
    };
  }, [isNarrow]);

  const startDividerDrag = (ev: { pointerId: number; clientX: number; pointerType?: string }) => {
    if (isNarrow) return;
    // Intentional policy: mouse and finger touch resize the divider.
    // Apple Pencil (pointerType === 'pen') is dedicated to academic handwriting
    // and content annotation; ignoring pen input on the 8px divider prevents
    // accidental workspace resizing while writing near the pane boundary.
    if (ev.pointerType === 'pen') return;

    const bodyEl = bodyRef.current;
    if (!bodyEl) return;
    const pointerId = ev.pointerId;
    const rect = bodyEl.getBoundingClientRect();

    const onMove = (e: PointerEvent) => {
      const next = (e.clientX - rect.left) / rect.width;
      setRatio(next, false);
    };

    const cleanup = () => {
      dragCleanupRef.current = null;
      bodyEl.removeEventListener('pointermove', onMove);
      bodyEl.removeEventListener('pointerup', onUp);
      bodyEl.removeEventListener('pointercancel', onCancel);
      bodyEl.removeEventListener('lostpointercapture', onCancel);
      try {
        if (bodyEl.hasPointerCapture?.(pointerId)) {
          bodyEl.releasePointerCapture(pointerId);
        }
      } catch {
        /* best-effort release */
      }
    };

    const onUp = (e: PointerEvent) => {
      const next = (e.clientX - rect.left) / rect.width;
      setRatio(next, true);
      cleanup();
    };

    const onCancel = () => {
      cleanup();
    };

    dragCleanupRef.current = cleanup;

    try {
      bodyEl.setPointerCapture(pointerId);
    } catch {
      /* best-effort */
    }
    bodyEl.addEventListener('pointermove', onMove);
    bodyEl.addEventListener('pointerup', onUp);
    bodyEl.addEventListener('pointercancel', onCancel);
    bodyEl.addEventListener('lostpointercapture', onCancel);
  };

  const bodyDirection = direction ?? (isNarrow ? 'column' : 'row');

  // Single-pane mode styles ensuring full body occupancy and zero-remount inert preservation
  const isAActive = !singlePaneMode || activePane === 'a';
  const isBActive = !singlePaneMode || activePane === 'b';

  return (
    <div
      ref={bodyRef}
      data-testid="two-surface-layout"
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: bodyDirection,
        position: singlePaneMode ? 'relative' : undefined,
        transition: paneTransition,
        ...style,
      }}
    >
      <div
        data-testid="two-surface-pane-a"
        {...(singlePaneMode && !isAActive ? { inert: true } : {})}
        aria-hidden={singlePaneMode && !isAActive ? true : undefined}
        style={{
          flex: singlePaneMode ? undefined : flexA,
          minWidth: isNarrow ? undefined : minSurfaceAPx,
          minHeight: isNarrow && !singlePaneMode ? minSurfaceAPx : 0,
          display: 'flex',
          flexDirection: 'column',
          borderRight: isNarrow ? undefined : `1px solid ${dividerBorderColor}`,
          borderBottom: isNarrow && !singlePaneMode ? `1px solid ${dividerBorderColor}` : undefined,
          overflow: 'hidden',
          overscrollBehavior: 'contain',
          transition: paneTransition,
          ...(singlePaneMode
            ? isAActive
              ? { position: 'relative', width: '100%', height: '100%', zIndex: 1 }
              : { position: 'absolute', inset: 0, visibility: 'hidden', pointerEvents: 'none', zIndex: 0 }
            : {}),
          ...surfaceAStyle,
        }}
      >
        {surfaceA}
      </div>
      {!singlePaneMode && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize panels"
          data-testid="two-surface-divider"
          onPointerDown={startDividerDrag}
          style={{
            width: isNarrow ? 0 : dividerWidthPx,
            flexShrink: 0,
            cursor: isNarrow ? 'default' : 'col-resize',
            background: 'transparent',
            borderLeft: isNarrow ? 'none' : `1px solid ${dividerBorderColor}`,
            borderRight: isNarrow ? 'none' : `1px solid ${dividerBorderColor}`,
            touchAction: 'none',
            userSelect: 'none',
            WebkitUserSelect: 'none',
          }}
        />
      )}
      <div
        data-testid="two-surface-pane-b"
        {...(singlePaneMode && !isBActive ? { inert: true } : {})}
        aria-hidden={singlePaneMode && !isBActive ? true : undefined}
        style={{
          flex: singlePaneMode ? undefined : flexB,
          minWidth: isNarrow ? undefined : minSurfaceBPx,
          minHeight: isNarrow && !singlePaneMode ? minSurfaceBPx : 0,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          overscrollBehavior: 'contain',
          transition: paneTransition,
          ...(singlePaneMode
            ? isBActive
              ? { position: 'relative', width: '100%', height: '100%', zIndex: 1 }
              : { position: 'absolute', inset: 0, visibility: 'hidden', pointerEvents: 'none', zIndex: 0 }
            : {}),
          ...surfaceBStyle,
        }}
      >
        {surfaceB}
      </div>
    </div>
  );
}
