/**
 * Math Desk — problem-bound derivation shell around ProjectNotebookBlock.
 */

import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import type { ProjectObjectContent, ProjectSpaceObject } from '../../hooks/useSectionFreeSpaceObjects';
import { extractGraphableFromLine } from '../../lib/mathDesk/graphFromLine';
import type { DeskZoneId } from '../../lib/mathDesk/types';
import { isDeskZoneCollapsed } from '../../lib/mathDesk/types';
import { ProjectNotebookBlock } from './ProjectNotebookBlock';
import { DeskCollapseHandle } from './desk/DeskCollapseHandle';
import { DeskComputeBar } from './desk/DeskComputeBar';
import { DeskFormulaMemory } from './desk/DeskFormulaMemory';
import { DeskMiniGraph, type DeskPlotPaperStatus } from './desk/DeskMiniGraph';
import { MathDeskStudyLayoutMenu } from './MathDeskStudyLayoutMenu';
import { sanitizeStudyLayout, type StudyLayoutMode } from '../../lib/mathDesk/studyLayout';
import './desk/deskPolish.css';

type NotebookContent = Extract<ProjectObjectContent, { type: 'notebook' }>;

const REFS_PANEL = 180;
const TOOL_PANEL = 208;
const SCRATCH_H = 48;
const EDGE_INSET = 36;
const HANDLE_GUTTER = 52;

interface Props {
  content: NotebookContent;
  tokens: AtmosphereTokens;
  object: ProjectSpaceObject;
  allObjects?: ProjectSpaceObject[];
  freeSpaceSectionId?: string;
  freeSpaceBoardId?: string;
  onChange: (content: ProjectObjectContent) => void;
  onNotebookEditingChange?: (id: string, editing: boolean) => void;
  onRequestSelectObject?: (id: string) => void;
  onCreateNotebookRecall?: (sourceId: string, prompt: string) => void;
  onShowClassic?: () => void;
  studyLayout?: StudyLayoutMode;
  onStudyLayoutChange?: (mode: StudyLayoutMode) => void;
  sessionRestoreBlockId?: string | null;
  onStudySessionWorkFocus?: (blockId: string | null) => void;
  studySessionActive?: boolean;
  studyFocusQuestionNumber?: number | null;
  studyFocusQuestionToken?: number;
  onStudySessionActiveQuestionNumber?: (questionNumber: number | null) => void;
  /** Focus exam: hide desk header, tool handles, scratch; reduce side inset. */
  studyDeskQuiet?: boolean;
}

function isStudyWorkNotebookEmpty(body: string | undefined): boolean {
  const lines = (body ?? '')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return true;
  if (lines.length === 1 && /^#\s*(Work|Math)?\s*$/i.test(lines[0]!)) return true;
  return false;
}

function patchLayout(content: NotebookContent, collapsed: Partial<Record<DeskZoneId, boolean>>): NotebookContent {
  return {
    ...content,
    deskLayout: { ...content.deskLayout, collapsed: { ...content.deskLayout?.collapsed, ...collapsed } },
  };
}

function flyoutPanel(child: ReactNode, style: CSSProperties) {
  return (
    <div
      className="desk-tool-flyout"
      style={{
        position: 'absolute',
        zIndex: 4,
        boxSizing: 'border-box',
        backdropFilter: 'blur(8px)',
        ...style,
      }}
    >
      {child}
    </div>
  );
}

export function MathDeskPrototype({
  content,
  tokens,
  object,
  allObjects,
  freeSpaceSectionId,
  freeSpaceBoardId,
  onChange,
  onNotebookEditingChange,
  onRequestSelectObject,
  onCreateNotebookRecall,
  onShowClassic,
  studyLayout: studyLayoutProp,
  onStudyLayoutChange,
  sessionRestoreBlockId = null,
  onStudySessionWorkFocus,
  studySessionActive = false,
  studyFocusQuestionNumber = null,
  studyFocusQuestionToken = 0,
  onStudySessionActiveQuestionNumber,
  studyDeskQuiet = false,
}: Props) {
  const [devMenuOpen, setDevMenuOpen] = useState(false);
  const [studyHintDismissed, setStudyHintDismissed] = useState(false);
  const [deskFocusedLine, setDeskFocusedLine] = useState<{ blockId: string | null; text: string }>({
    blockId: null,
    text: '',
  });
  const [graphManual, setGraphManual] = useState(false);

  const formulas = content.deskFormulas ?? [];
  const formulaCollapsed = isDeskZoneCollapsed('formula', formulas, content.deskLayout);
  const computeCollapsed = isDeskZoneCollapsed('compute', formulas, content.deskLayout);
  const graphCollapsed = isDeskZoneCollapsed('graph', formulas, content.deskLayout);
  const scratchCollapsed = isDeskZoneCollapsed('scratch', formulas, content.deskLayout);

  const graphExpression = content.deskGraphExpression?.trim() ?? '';

  const toggleZone = useCallback(
    (zone: DeskZoneId) => {
      const collapsed = isDeskZoneCollapsed(zone, formulas, content.deskLayout);
      if (collapsed) {
        if (zone === 'formula') {
          onChange(patchLayout(content, { formula: false }));
        } else if (zone === 'graph') {
          onChange(patchLayout(content, { graph: false, compute: true }));
        } else if (zone === 'compute') {
          onChange(patchLayout(content, { compute: false, graph: true }));
        } else {
          onChange(patchLayout(content, { scratch: false }));
        }
      } else {
        onChange(patchLayout(content, { [zone]: true }));
      }
    },
    [content, formulas, onChange],
  );

  const onDeskFocusedLine = useCallback((payload: { blockId: string | null; text: string }) => {
    setDeskFocusedLine(payload);
    onStudySessionWorkFocus?.(payload.blockId);
    if (payload.text.trim()) setStudyHintDismissed(true);
  }, [onStudySessionWorkFocus]);

  useEffect(() => {
    if (!studySessionActive) return;
    if (!isStudyWorkNotebookEmpty(content.body)) setStudyHintDismissed(true);
  }, [studySessionActive, content.body]);

  const showStudyHint =
    studySessionActive &&
    !studyDeskQuiet &&
    !studyHintDismissed &&
    isStudyWorkNotebookEmpty(content.body);

  const edgeInset = studySessionActive ? (studyDeskQuiet ? 0 : 20) : EDGE_INSET;
  const showDeskChrome = !studyDeskQuiet;

  useEffect(() => {
    if (graphCollapsed) return;
    const extracted = extractGraphableFromLine(deskFocusedLine.text);
    if (extracted.ok) {
      setGraphManual(false);
      if (extracted.normalized !== graphExpression) {
        onChange({ ...content, deskGraphExpression: extracted.normalized });
      }
    }
  }, [deskFocusedLine.text, graphCollapsed, graphExpression, content, onChange]);

  const plotPaperStatus: DeskPlotPaperStatus = useMemo(() => {
    if (graphManual) return 'manual';
    const extracted = extractGraphableFromLine(deskFocusedLine.text);
    if (extracted.ok) return 'from_line';
    if (graphExpression) return 'last_valid';
    return 'awaiting';
  }, [graphManual, deskFocusedLine.text, graphExpression]);

  const plotExpression = graphExpression;

  const showDevMenu = Boolean(onShowClassic) && import.meta.env.DEV;
  const studyLayout = sanitizeStudyLayout(studyLayoutProp ?? content.studyLayout);

  const applyStudyLayout = useCallback(
    (mode: StudyLayoutMode) => {
      if (onStudyLayoutChange) {
        onStudyLayoutChange(mode);
        return;
      }
      if (mode === 'canvas') {
        const { studyLayout: _removed, ...rest } = content;
        onChange(rest);
      } else {
        onChange({ ...content, studyLayout: mode });
      }
    },
    [content, onChange, onStudyLayoutChange],
  );

  return (
    <div
      className="math-desk"
      style={{
        width: '100%',
        height: '100%',
        minHeight: 420,
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
        background: tokens.pageBg,
        borderRadius: studyDeskQuiet ? 0 : 12,
        overflow: 'hidden',
        border: studyDeskQuiet ? 'none' : `1px solid rgba(255,255,255,0.05)`,
      }}
    >
      {showDeskChrome ? (
        <div
          style={{
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '8px 10px 6px',
            borderBottom: `1px solid rgba(255,255,255,0.04)`,
          }}
        >
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: tokens.textGhost,
              flexShrink: 0,
            }}
          >
            Problem
          </span>
          <input
            type="text"
            value={content.subtitle ?? ''}
            onChange={e => onChange({ ...content, subtitle: e.target.value })}
            placeholder="What are you solving?"
            style={{
              flex: 1,
              minWidth: 0,
              border: 'none',
              outline: 'none',
              background: 'transparent',
              fontSize: 13,
              fontWeight: 600,
              color: tokens.textPrimary,
              letterSpacing: '-0.02em',
            }}
          />
          <span
            className="desk-header-check"
            title="Write a numeric step on the line, then press ⌘↵ — the line answers with numbers or balance"
          >
            <kbd>⌘↵</kbd>
            <span>Check line</span>
          </span>
          {onStudyLayoutChange ? (
            <MathDeskStudyLayoutMenu
              tokens={tokens}
              layout={studyLayout}
              onLayoutChange={applyStudyLayout}
            />
          ) : null}
          {showDevMenu ? (
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => setDevMenuOpen(o => !o)}
              aria-label="Developer menu"
              style={{
                width: 22,
                height: 22,
                borderRadius: 4,
                border: 'none',
                background: 'transparent',
                color: tokens.textGhost,
                cursor: 'pointer',
                fontSize: 14,
                lineHeight: 1,
              }}
            >
              ⋯
            </button>
            {devMenuOpen ? (
              <>
                <div
                  style={{ position: 'fixed', inset: 0, zIndex: 20 }}
                  onClick={() => setDevMenuOpen(false)}
                />
                <div
                  style={{
                    position: 'absolute',
                    right: 0,
                    top: '100%',
                    marginTop: 4,
                    zIndex: 21,
                    padding: 4,
                    borderRadius: 6,
                    background: tokens.cardBg,
                    border: `1px solid ${tokens.cardBorder}`,
                    boxShadow: '0 8px 20px rgba(0,0,0,0.4)',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setDevMenuOpen(false);
                      onShowClassic?.();
                    }}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      padding: '6px 10px',
                      border: 'none',
                      background: 'transparent',
                      color: tokens.textMuted,
                      fontSize: 10,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Classic notebook
                  </button>
                </div>
              </>
            ) : null}
          </div>
        ) : null}
        </div>
      ) : null}

      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div
          style={{
            flex: 1,
            minHeight: 0,
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {showStudyHint ? (
            <div
              role="note"
              style={{
                flexShrink: 0,
                margin: `6px ${edgeInset}px 0`,
                padding: '8px 10px',
                borderRadius: 8,
                border: `1px solid ${tokens.cardBorder}`,
                background: `${tokens.accent}12`,
                fontSize: 11,
                lineHeight: 1.45,
                color: tokens.textSecondary,
              }}
            >
              <div style={{ fontWeight: 600, color: tokens.textPrimary, marginBottom: 4 }}>
                Start solving the question from the exam here.
              </div>
              <div>Type naturally: x^2, sqrt(x), pi</div>
              <div>Press ⌘↵ to check a step</div>
            </div>
          ) : null}
          <div
            style={{
              flex: 1,
              minHeight: 0,
              margin: studyDeskQuiet ? '0' : `2px ${edgeInset}px 2px ${edgeInset}px`,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              borderRadius: studyDeskQuiet ? 0 : 4,
              boxShadow: studyDeskQuiet
                ? 'none'
                : 'inset 0 0 0 1px rgba(0,0,0,0.12), 0 2px 12px rgba(0,0,0,0.15)',
            }}
          >
            <ProjectNotebookBlock
              presentation="desk"
              content={content}
              tokens={tokens}
              onChange={onChange}
              context="free-space"
              objectId={object.id}
              objectTitle={object.title}
              objectUpdatedAt={object.updatedAt}
              allObjects={allObjects}
              freeSpaceSectionId={freeSpaceSectionId}
              freeSpaceBoardId={freeSpaceBoardId}
              onRequestSelectObject={onRequestSelectObject}
              onCreateRecallItem={
                onCreateNotebookRecall ? prompt => onCreateNotebookRecall(object.id, prompt) : undefined
              }
              onEditingChange={
                onNotebookEditingChange ? editing => onNotebookEditingChange(object.id, editing) : undefined
              }
              onDeskFocusedLine={onDeskFocusedLine}
              sessionRestoreBlockId={sessionRestoreBlockId}
              studyFocusQuestionNumber={studyFocusQuestionNumber}
              studyFocusQuestionToken={studyFocusQuestionToken}
              onActiveQuestionNumber={onStudySessionActiveQuestionNumber}
            />
          </div>

          {showDeskChrome && !formulaCollapsed
            ? flyoutPanel(
                <DeskFormulaMemory
                  tokens={tokens}
                  formulas={formulas}
                  onChange={next => onChange({ ...content, deskFormulas: next })}
                  compact={formulas.length === 0}
                />,
                {
                  top: 8,
                  left: HANDLE_GUTTER,
                  width: REFS_PANEL,
                  maxHeight: 'calc(100% - 16px)',
                  overflowY: 'auto',
                },
              )
            : null}

          {showDeskChrome && !graphCollapsed
            ? flyoutPanel(
                <DeskMiniGraph
                  tokens={tokens}
                  expression={plotExpression}
                  onExpressionChange={expr => onChange({ ...content, deskGraphExpression: expr })}
                  onManualEdit={() => setGraphManual(true)}
                  paperStatus={plotPaperStatus}
                  focusedLinePreview={deskFocusedLine.text}
                />,
                { top: 8, right: HANDLE_GUTTER, width: TOOL_PANEL },
              )
            : null}

          {showDeskChrome && !computeCollapsed
            ? flyoutPanel(
                <DeskComputeBar
                  tokens={tokens}
                  history={content.deskComputeHistory ?? []}
                  onHistoryChange={history => onChange({ ...content, deskComputeHistory: history })}
                />,
                { top: 8, right: HANDLE_GUTTER, width: TOOL_PANEL },
              )
            : null}

          {showDeskChrome ? (
            <>
              <div
                style={{
                  position: 'absolute',
                  left: 6,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  zIndex: 5,
                }}
              >
                <DeskCollapseHandle
                  tokens={tokens}
                  kind="formula"
                  collapsed={formulaCollapsed}
                  onToggle={() => toggleZone('formula')}
                  edge="left"
                  badge={formulas.length || undefined}
                  variant="peripheral"
                />
              </div>

              <div
                style={{
                  position: 'absolute',
                  right: 6,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  zIndex: 5,
                }}
              >
                <DeskCollapseHandle
                  tokens={tokens}
                  kind="graph"
                  collapsed={graphCollapsed}
                  onToggle={() => toggleZone('graph')}
                  edge="right"
                  variant="peripheral"
                />
                <DeskCollapseHandle
                  tokens={tokens}
                  kind="compute"
                  collapsed={computeCollapsed}
                  onToggle={() => toggleZone('compute')}
                  edge="right"
                  variant="peripheral"
                />
              </div>
            </>
          ) : null}
        </div>

        {showDeskChrome && !scratchCollapsed ? (
          <div
            style={{
              flexShrink: 0,
              margin: '0 4px 4px',
              padding: '6px 8px',
              height: SCRATCH_H,
              boxSizing: 'border-box',
              borderTop: `1px dashed rgba(255,255,255,0.08)`,
              background: 'rgba(0,0,0,0.12)',
            }}
          >
            <textarea
              value={content.deskScratch ?? ''}
              onChange={e => onChange({ ...content, deskScratch: e.target.value })}
              placeholder="Scratch — side tries"
              style={{
                width: '100%',
                height: '100%',
                resize: 'none',
                border: 'none',
                outline: 'none',
                background: 'transparent',
                fontSize: 11,
                lineHeight: 1.4,
                color: tokens.textMuted,
                fontFamily: 'ui-monospace, monospace',
              }}
            />
          </div>
        ) : null}

        {showDeskChrome ? (
          <div
            style={{
              flexShrink: 0,
              padding: scratchCollapsed ? '2px 8px 4px' : '0 8px 4px',
              display: 'flex',
              justifyContent: 'center',
            }}
          >
            <DeskCollapseHandle
              tokens={tokens}
              kind="scratch"
              collapsed={scratchCollapsed}
              onToggle={() => toggleZone('scratch')}
              edge="bottom"
              variant="peripheral"
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
