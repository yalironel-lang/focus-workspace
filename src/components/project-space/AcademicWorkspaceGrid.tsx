import { useRef, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import { clampRatioForWidth } from '../../lib/studySession/twoSurfaceGeometry';
import {
  resizeAdjacent,
  WORKSPACE_DIVIDER_PX,
  WORKSPACE_PANE_MIN_PX,
  type WorkspacePaneId,
} from '../../lib/studySession/academicWorkspaceLayout';
import type { DerivedQuestionSection } from '../../lib/academicComposition/questionSections';
import { AcademicNotebookQuestionNav } from './AcademicNotebookQuestionNav';
import type { TutorDockCollapseCue, TutorDockResizeApi } from './ContextualTutorCard';

type ColumnWidths = Record<WorkspacePaneId, number>;

type Props = {
  tokens: AtmosphereTokens;
  frame: string;
  dockResizeRef?: RefObject<TutorDockResizeApi | null>;
  columnMode: boolean;
  floating: boolean;
  narrow: boolean;
  narrowPdfActive: boolean;
  order: readonly WorkspacePaneId[];
  widths: ColumnWidths | null;
  containerWidth: number;
  splitRatio: number;
  onSplitRatioChange?: (ratio: number) => void;
  onSplitRatioCommit?: (ratio: number) => void;
  onPreviewWidths?: (widths: ColumnWidths) => void;
  onCommitWidths: (widths: ColumnWidths) => void;
  onResizeBy: (separatorIndex: number, deltaPx: number) => void;
  onMove: (pane: WorkspacePaneId, direction: -1 | 1) => void;
  pdfSurface: ReactNode;
  notebookSurface: ReactNode;
  tutor: ReactNode;
  questions: DerivedQuestionSection[];
  activeQuestionNumber: number | null;
  onSelectQuestion?: (questionNumber: number) => void;
  showQuestionNav: boolean;
  paneLabel: { pdf: string; notebook: string; tutor: string };
  collapseCue?: TutorDockCollapseCue | null;
};

const PANE_LABEL: Record<WorkspacePaneId, string> = {
  pdf: 'PDF',
  notebook: 'Notebook',
  tutor: 'Tutor',
};

function ResizeGrip({ orientation }: { orientation: 'horizontal' | 'vertical' }) {
  return (
    <span
      aria-hidden
      data-resize-grip={orientation}
      style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
        width: orientation === 'horizontal' ? 36 : 3,
        height: orientation === 'horizontal' ? 3 : 28,
        borderRadius: 99,
        background: 'rgba(255,255,255,0.62)',
        boxShadow: '0 0 0 1px rgba(0,0,0,0.35)',
        pointerEvents: 'none',
      }}
    />
  );
}

function PaneMenu({
  pane,
  label,
  index,
  count,
  tokens,
  narrow,
  onMove,
}: {
  pane: WorkspacePaneId;
  label: string;
  index: number;
  count: number;
  tokens: AtmosphereTokens;
  narrow: boolean;
  onMove: (pane: WorkspacePaneId, direction: -1 | 1) => void;
}) {
  const target = narrow ? 44 : 32;
  const moveButton = (direction: -1 | 1) => {
    const atEnd = direction < 0 ? index === 0 : index === count - 1;
    const name = direction < 0 ? 'left' : 'right';
    const accessible = `Move ${label} ${name}`;
    return (
      <button
        type="button"
        data-testid={`workspace-move-${name}-${pane}`}
        aria-label={accessible}
        title={accessible}
        disabled={atEnd}
        onClick={() => onMove(pane, direction)}
        style={{
          minWidth: target,
          minHeight: target,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 8,
          border: `1px solid ${tokens.cardBorder}`,
          background: atEnd ? 'transparent' : tokens.wellBg,
          color: tokens.textPrimary,
          cursor: atEnd ? 'default' : 'pointer',
          opacity: atEnd ? 0.35 : 1,
          padding: 0,
        }}
      >
        {direction < 0 ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </button>
    );
  };
  return (
    <div
      data-testid={`workspace-pane-menu-${pane}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        padding: '4px 8px',
        minHeight: target + 8,
        flexShrink: 0,
      }}
    >
      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.04em' }}>{label}</span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        {moveButton(-1)}
        {moveButton(1)}
      </span>
    </div>
  );
}

export function AcademicWorkspaceGrid({
  tokens,
  frame,
  dockResizeRef,
  columnMode,
  floating,
  narrow,
  narrowPdfActive,
  order,
  widths,
  containerWidth,
  splitRatio,
  onSplitRatioChange,
  onSplitRatioCommit,
  onPreviewWidths,
  onCommitWidths,
  onResizeBy,
  onMove,
  pdfSurface,
  notebookSurface,
  tutor,
  questions,
  activeQuestionNumber,
  onSelectQuestion,
  showQuestionNav,
  paneLabel,
  collapseCue = null,
}: Props) {
  const studyRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const labels = { ...PANE_LABEL, ...paneLabel };

  const studyRatio = clampRatioForWidth(splitRatio, containerWidth, 320, 320);
  const pdfFlex = narrow || columnMode ? undefined : `0 0 ${Math.round(studyRatio * 1000) / 10}%`;
  const notebookFlex = narrow || columnMode ? undefined : '1 1 auto';

  const startStudyDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (columnMode || narrow || event.pointerType === 'pen') return;
    const body = studyRef.current;
    if (!body) return;
    const pointerId = event.pointerId;
    const rect = body.getBoundingClientRect();
    const apply = (clientX: number) =>
      clampRatioForWidth((clientX - rect.left) / rect.width, rect.width, 320, 320);
    const move = (e: PointerEvent) => {
      onSplitRatioChange?.(apply(e.clientX));
    };
    const end = (e: PointerEvent) => {
      onSplitRatioCommit?.(apply(e.clientX));
      cleanup();
    };
    const cleanup = () => {
      body.removeEventListener('pointermove', move);
      body.removeEventListener('pointerup', end);
      body.removeEventListener('pointercancel', cleanup);
      try {
        if (body.hasPointerCapture?.(pointerId)) body.releasePointerCapture(pointerId);
      } catch {
        /* best-effort */
      }
    };
    try {
      body.setPointerCapture(pointerId);
    } catch {
      /* best-effort */
    }
    body.addEventListener('pointermove', move);
    body.addEventListener('pointerup', end);
    body.addEventListener('pointercancel', cleanup);
  };

  const startColumnDrag = (separatorIndex: number, event: ReactPointerEvent<HTMLDivElement>) => {
    if (!columnMode || !widths || event.pointerType === 'pen') return;
    event.preventDefault();
    const startX = event.clientX;
    const start = { ...widths };
    let latest = start;
    const move = (e: PointerEvent) => {
      latest = resizeAdjacent(order, start, separatorIndex, e.clientX - startX);
      onPreviewWidths?.(latest);
    };
    const end = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      onCommitWidths(latest);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
  };

  const onSeparatorKey = (separatorIndex: number, event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!columnMode) return;
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const step = event.shiftKey ? 32 : 16;
    onResizeBy(separatorIndex, event.key === 'ArrowRight' ? step : -step);
  };

  const expandedDock = frame === 'expanded';
  const startBoundaryDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!expandedDock || event.pointerType === 'pen') return;
    event.preventDefault();
    dockResizeRef?.current?.begin(event.clientY);
    const move = (e: PointerEvent) => dockResizeRef?.current?.move(e.clientY);
    const end = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      dockResizeRef?.current?.end();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  };
  const onBoundaryKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    dockResizeRef?.current?.nudge(event.key === 'ArrowDown' ? 24 : -24);
  };

  const columnTemplate = columnMode && widths
    ? order.map(id => `${widths[id]}px`).join(` ${WORKSPACE_DIVIDER_PX}px `)
    : 'minmax(0, 1fr)';

  const paneStyle = (id: WorkspacePaneId, active: boolean): CSSProperties => {
    const index = order.indexOf(id);
    if (columnMode && widths) {
      return {
        gridColumn: index * 2 + 1,
        gridRow: 1,
        minWidth: 0,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      };
    }
    if (narrow) {
      return active
        ? { position: 'relative', width: '100%', height: '100%', zIndex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }
        : { position: 'absolute', inset: 0, visibility: 'hidden', pointerEvents: 'none', zIndex: 0, display: 'flex', flexDirection: 'column' };
    }
    return {
      flex: id === 'pdf' ? pdfFlex : notebookFlex,
      minWidth: 320,
      minHeight: 0,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    };
  };

  const surfaceStyle: CSSProperties = { flex: 1, minHeight: 0, minWidth: 0, display: 'flex', flexDirection: 'column' };

  return (
    <div
      ref={gridRef}
      data-testid="tutor-workspace-grid"
      data-tutor-frame={frame}
      data-pane-order={columnMode ? order.join(',') : undefined}
      style={{
        flex: 1,
        minHeight: 0,
        minWidth: 0,
        display: 'grid',
        gridTemplateColumns: columnTemplate,
        gridTemplateRows: columnMode || floating
          ? 'minmax(0, 1fr)'
          : expandedDock
            ? collapseCue?.atMinimum || collapseCue?.armed
              ? 'auto auto minmax(0, 1fr)'
              : 'auto 8px minmax(0, 1fr)'
            : 'auto minmax(0, 1fr)',
        overflow: 'hidden',
      }}
    >
      <div
        data-testid="workspace-pane-tutor"
        style={
          columnMode && widths
            ? paneStyle('tutor', true)
            : floating
              ? { gridColumn: 1, gridRow: 1, height: 0, overflow: 'visible', zIndex: 5 }
              : { gridColumn: 1, gridRow: 1, minWidth: 0 }
        }
      >
        {columnMode ? (
          <PaneMenu pane="tutor" label={labels.tutor} index={order.indexOf('tutor')} count={order.length} tokens={tokens} narrow={narrow} onMove={onMove} />
        ) : null}
        <div key="tutor-content" style={columnMode ? surfaceStyle : undefined}>{tutor}</div>
      </div>

      {columnMode && widths
        ? [0, 1].map(separatorIndex => {
            const left = order[separatorIndex];
            const right = order[separatorIndex + 1];
            return (
              <div
                key={separatorIndex}
                role="separator"
                aria-orientation="vertical"
                aria-label={`Resize ${labels[left]} and ${labels[right]}`}
                aria-valuemin={WORKSPACE_PANE_MIN_PX[right]}
                aria-valuenow={widths[right]}
                tabIndex={0}
                data-testid={`workspace-separator-${separatorIndex}`}
                data-left={left}
                data-right={right}
                data-left-width={widths[left]}
                data-right-width={widths[right]}
                onPointerDown={event => startColumnDrag(separatorIndex, event)}
                onKeyDown={event => onSeparatorKey(separatorIndex, event)}
                style={{
                  gridColumn: separatorIndex * 2 + 2,
                  gridRow: 1,
                  position: 'relative',
                  cursor: 'col-resize',
                  touchAction: 'none',
                  background: tokens.cardBorder,
                }}
              >
                <ResizeGrip orientation="vertical" />
              </div>
            );
          })
        : null}

      {expandedDock ? (
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize Tutor dock"
          tabIndex={0}
          data-testid="tutor-dock-boundary"
          data-collapse-armed={collapseCue?.armed ? '1' : '0'}
          onPointerDown={startBoundaryDrag}
          onKeyDown={onBoundaryKey}
          style={{
            gridColumn: 1,
            gridRow: 2,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            cursor: 'ns-resize',
            touchAction: 'none',
            position: 'relative',
            zIndex: 4,
            minHeight: 8,
            background: collapseCue?.armed ? tokens.accent : tokens.cardBorder,
          }}
        >
          <span aria-hidden style={{ position: 'relative', height: 8, width: '100%' }}>
            <ResizeGrip orientation="horizontal" />
          </span>
          {collapseCue?.armed ? (
            <span
              data-testid="tutor-dock-collapse-cue"
              style={{ fontSize: 12, fontWeight: 700, color: '#111', pointerEvents: 'none', paddingBottom: 4 }}
            >
              Release to collapse
            </span>
          ) : collapseCue?.atMinimum ? (
            <button
              type="button"
              data-testid="tutor-dock-collapse-full"
              aria-label="Collapse Tutor"
              title="Collapse Tutor"
              onPointerDown={event => event.stopPropagation()}
              onClick={() => dockResizeRef?.current?.collapse()}
              style={{
                minHeight: narrow ? 44 : 32,
                marginBottom: 4,
                padding: '4px 12px',
                borderRadius: 8,
                border: `1px solid ${tokens.cardBorder}`,
                background: tokens.cardBg,
                color: tokens.textPrimary,
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Collapse Tutor
            </button>
          ) : null}
        </div>
      ) : null}

      <div
        style={
          columnMode
            ? { display: 'contents' }
            : {
                gridColumn: 1,
                gridRow: floating ? 1 : expandedDock ? 3 : 2,
                display: 'flex',
                flexDirection: 'column',
                minWidth: 0,
                minHeight: 0,
                overflow: 'hidden',
              }
        }
      >
        <div
          ref={studyRef}
          data-testid="two-surface-layout"
          style={
            columnMode
              ? { display: 'contents' }
              : {
                  flex: 1,
                  minHeight: 0,
                  display: 'flex',
                  flexDirection: narrow ? 'column' : 'row',
                  position: narrow ? 'relative' : undefined,
                }
          }
        >
          <div
            key="pdf"
            data-testid="two-surface-pane-a"
            data-pane="pdf"
            {...(narrow && !narrowPdfActive ? { inert: true } : {})}
            aria-hidden={narrow && !narrowPdfActive ? true : undefined}
            style={paneStyle('pdf', narrowPdfActive)}
          >
            {columnMode ? (
              <PaneMenu pane="pdf" label={labels.pdf} index={order.indexOf('pdf')} count={order.length} tokens={tokens} narrow={narrow} onMove={onMove} />
            ) : null}
            <div key="pdf-surface" style={surfaceStyle}>{pdfSurface}</div>
          </div>
          <div
            key="study-divider"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize panels"
            data-testid="two-surface-divider"
            onPointerDown={startStudyDrag}
            style={{
              display: columnMode || narrow ? 'none' : undefined,
              width: columnMode || narrow ? 0 : WORKSPACE_DIVIDER_PX,
              flexShrink: 0,
              position: 'relative',
              cursor: 'col-resize',
              touchAction: 'none',
              background: tokens.cardBorder,
              borderLeft: `1px solid ${tokens.cardBorder}`,
              borderRight: `1px solid ${tokens.cardBorder}`,
            }}
          >
            <ResizeGrip orientation="vertical" />
          </div>
          <div
            key="notebook"
            data-testid="two-surface-pane-b"
            data-pane="notebook"
            {...(narrow && narrowPdfActive ? { inert: true } : {})}
            aria-hidden={narrow && narrowPdfActive ? true : undefined}
            style={paneStyle('notebook', !narrowPdfActive)}
          >
            {columnMode ? (
              <PaneMenu
                pane="notebook"
                label={labels.notebook}
                index={order.indexOf('notebook')}
                count={order.length}
                tokens={tokens}
                narrow={narrow}
                onMove={onMove}
              />
            ) : null}
            {showQuestionNav && onSelectQuestion ? (
              <AcademicNotebookQuestionNav
                tokens={tokens}
                questions={questions}
                activeQuestionNumber={activeQuestionNumber}
                onSelectQuestion={onSelectQuestion}
                isNarrow={narrow}
              />
            ) : null}
            <div key="notebook-surface" style={surfaceStyle}>{notebookSurface}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
