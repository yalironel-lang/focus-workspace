import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Minus, Plus } from 'lucide-react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import {
  computeStudySessionChrome,
  type StudyPaneFocus,
} from '../../lib/studySession/computeSessionChrome';
import type { StudyExamPdfControls } from '../../lib/studySession/examPdfControls';
import { Z_STUDY_SESSION_BACKDROP } from '../../lib/ui/zIndexLayers';
import { acquireBodyScrollLock, pushEscapeHandler } from '../../lib/ui/overlayStack';
import type { ExamQuestionSection } from '../../lib/studySession/parseExamQuestions';

const NARROW_BREAKPOINT_PX = 900;

interface Props {
  tokens: AtmosphereTokens;
  examTitle: string;
  statusLine: string;
  shellTopInset?: number;
  paneFocus: StudyPaneFocus;
  onPaneFocusChange: (focus: StudyPaneFocus) => void;
  splitRatio?: number;
  onSplitRatioChange?: (ratio: number) => void;
  onSplitRatioCommit?: (ratio: number) => void;
  onDoneStudying: () => void;
  questions?: ExamQuestionSection[];
  activeQuestionNumber?: number | null;
  onSelectQuestion?: (questionNumber: number) => void;
  examPdfControls?: StudyExamPdfControls | null;
  sourcePanel: ReactNode;
  workPanel: ReactNode;
}

const MIN_SOURCE_PX = 320;
const MIN_WORK_PX = 320;

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0.5;
  return Math.max(0, Math.min(1, v));
}

function defaultRatioForFocus(paneFocus: StudyPaneFocus): number {
  if (paneFocus === 'exam') return 0.75;
  if (paneFocus === 'work') return 0.28;
  return 0.5;
}

function clampRatioForWidth(ratio: number, widthPx: number): number {
  if (!Number.isFinite(widthPx) || widthPx <= 0) return clamp01(ratio);
  const min = Math.max(MIN_SOURCE_PX / widthPx, 0.12);
  const max = Math.min(1 - MIN_WORK_PX / widthPx, 0.88);
  if (min > max) return 0.5;
  return Math.max(min, Math.min(max, ratio));
}

function focusButtonStyle(
  tokens: AtmosphereTokens,
  active: boolean,
): CSSProperties {
  return {
    fontSize: 11,
    fontWeight: 600,
    padding: '5px 10px',
    borderRadius: 8,
    border: `1px solid ${active ? `${tokens.accent}66` : tokens.cardBorder}`,
    background: active ? `${tokens.accent}22` : tokens.wellBg,
    color: active ? tokens.accent : tokens.textSecondary,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  };
}

function iconBtnStyle(tokens: AtmosphereTokens, disabled = false): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
    borderRadius: 6,
    border: 'none',
    background: 'transparent',
    color: disabled ? tokens.textGhost : tokens.textMuted,
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.45 : 1,
  };
}

export function StudySessionShell({
  tokens,
  examTitle,
  statusLine,
  shellTopInset = 56,
  paneFocus,
  onPaneFocusChange,
  splitRatio,
  onSplitRatioChange,
  onSplitRatioCommit,
  onDoneStudying,
  questions = [],
  activeQuestionNumber = null,
  onSelectQuestion,
  examPdfControls = null,
  sourcePanel,
  workPanel,
}: Props) {
  const [isNarrow, setIsNarrow] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < NARROW_BREAKPOINT_PX : false,
  );
  const [pdfMenuOpen, setPdfMenuOpen] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const pdfMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${NARROW_BREAKPOINT_PX - 1}px)`);
    const sync = () => setIsNarrow(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (!pdfMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!pdfMenuRef.current?.contains(e.target as Node)) setPdfMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [pdfMenuOpen]);

  const chrome = computeStudySessionChrome(shellTopInset, paneFocus, isNarrow);

  useEffect(() => {
    return acquireBodyScrollLock();
  }, []);

  useEffect(() => {
    return pushEscapeHandler(onDoneStudying);
  }, [onDoneStudying]);

  if (typeof document === 'undefined') return null;

  const paneTransition = 'flex 0.2s ease';
  const readerMode = paneFocus === 'exam';
  const showQuestionRail =
    !readerMode && questions.length > 0 && onSelectQuestion != null;
  const effectiveRatio = clamp01(splitRatio ?? defaultRatioForFocus(paneFocus));
  const sourceFlex = isNarrow ? chrome.sourcePanel.flex : `0 0 ${Math.round(effectiveRatio * 1000) / 10}%`;
  const workFlex = isNarrow ? chrome.workPanel.flex : `1 1 ${Math.round((1 - effectiveRatio) * 1000) / 10}%`;

  const pdf = examPdfControls;

  const setRatio = (next: number, commit = false) => {
    const width = bodyRef.current?.getBoundingClientRect().width ?? window.innerWidth;
    const clamped = clampRatioForWidth(next, width);
    onSplitRatioChange?.(clamped);
    if (commit) onSplitRatioCommit?.(clamped);
  };

  const startDividerDrag = (ev: { pointerId: number; clientX: number }) => {
    if (isNarrow) return;
    const bodyEl = bodyRef.current;
    if (!bodyEl) return;
    const pointerId = ev.pointerId;
    const rect = bodyEl.getBoundingClientRect();
    const onMove = (e: PointerEvent) => {
      const next = (e.clientX - rect.left) / rect.width;
      setRatio(next, false);
    };
    const onUp = (e: PointerEvent) => {
      const next = (e.clientX - rect.left) / rect.width;
      setRatio(next, true);
      bodyEl.removeEventListener('pointermove', onMove);
      bodyEl.removeEventListener('pointerup', onUp);
      bodyEl.removeEventListener('pointercancel', onUp);
      bodyEl.releasePointerCapture(pointerId);
    };
    bodyEl.setPointerCapture(pointerId);
    bodyEl.addEventListener('pointermove', onMove);
    bodyEl.addEventListener('pointerup', onUp);
    bodyEl.addEventListener('pointercancel', onUp);
  };

  return createPortal(
    <>
      <div
        aria-hidden
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: Z_STUDY_SESSION_BACKDROP,
          background: 'rgba(8, 10, 14, 0.38)',
          pointerEvents: 'none',
        }}
      />
      <div
        role="region"
        aria-label="Study session"
        style={{
          position: 'fixed',
          top: chrome.top,
          left: chrome.left,
          width: chrome.width,
          height: chrome.height,
          zIndex: chrome.zIndex,
          display: 'flex',
          flexDirection: 'column',
          boxSizing: 'border-box',
          background: tokens.pageBg,
          borderTop: `1px solid ${tokens.cardBorder}`,
          boxShadow: '0 -4px 40px rgba(0,0,0,0.2)',
        }}
      >
        <header
          style={{
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            gap: readerMode ? 6 : 10,
            padding: readerMode ? '5px 10px' : '8px 12px',
            borderBottom: `1px solid ${tokens.cardBorder}`,
            background: tokens.cardBg,
            flexWrap: 'nowrap',
          }}
        >
          {readerMode ? (
            <>
              {pdf ? (
                <>
                  <button
                    type="button"
                    title="Previous page"
                    style={iconBtnStyle(tokens, pdf.page <= 1 || !pdf.ready)}
                    disabled={pdf.page <= 1 || !pdf.ready}
                    onClick={() => pdf.onPageDelta(-1)}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span
                    className="tabular-nums"
                    style={{ fontSize: 10, color: tokens.textMuted, whiteSpace: 'nowrap' }}
                  >
                    {pdf.pageCount
                      ? `Page ${pdf.page} / ${pdf.pageCount}`
                      : `Page ${pdf.page}`}
                  </span>
                  <button
                    type="button"
                    title="Next page"
                    style={iconBtnStyle(tokens, !pdf.ready)}
                    disabled={!pdf.ready}
                    onClick={() => pdf.onPageDelta(1)}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </>
              ) : null}
              <div style={{ flex: 1, minWidth: 8 }} />
              <button
                type="button"
                style={focusButtonStyle(tokens, false)}
                onClick={() => {
                  onPaneFocusChange('balanced');
                  setRatio(defaultRatioForFocus('balanced'), true);
                }}
              >
                Split
              </button>
              <button
                type="button"
                title="Expand PDF"
                style={focusButtonStyle(tokens, false)}
                onClick={() => setRatio(0.88, true)}
              >
                Expand PDF
              </button>
              <button
                type="button"
                title="Expand notebook"
                style={focusButtonStyle(tokens, false)}
                onClick={() => setRatio(0.12, true)}
              >
                Expand Notebook
              </button>
              {pdf ? (
                <div ref={pdfMenuRef} style={{ position: 'relative', flexShrink: 0 }}>
                  <button
                    type="button"
                    aria-expanded={pdfMenuOpen}
                    aria-haspopup="menu"
                    style={focusButtonStyle(tokens, false)}
                    onClick={() => setPdfMenuOpen(o => !o)}
                  >
                    ⋯
                  </button>
                  {pdfMenuOpen ? (
                    <div
                      role="menu"
                      style={{
                        position: 'absolute',
                        right: 0,
                        top: 'calc(100% + 4px)',
                        zIndex: 8,
                        padding: 6,
                        borderRadius: 8,
                        border: `1px solid ${tokens.cardBorder}`,
                        background: tokens.cardBg,
                        boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <button
                        type="button"
                        title="Zoom out"
                        style={iconBtnStyle(tokens)}
                        onClick={() => pdf.onZoomDelta(-0.1)}
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span
                        className="tabular-nums"
                        style={{ fontSize: 10, color: tokens.textMuted, padding: '0 4px' }}
                      >
                        {Math.round(pdf.zoom * 100)}%
                      </span>
                      <button
                        type="button"
                        title="Zoom in"
                        style={iconBtnStyle(tokens)}
                        onClick={() => pdf.onZoomDelta(0.1)}
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        style={{
                          ...focusButtonStyle(tokens, false),
                          marginLeft: 4,
                        }}
                        onClick={() => {
                          pdf.onFitWidth();
                          setPdfMenuOpen(false);
                        }}
                      >
                        Fit width
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : (
            <>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  flexWrap: 'wrap',
                }}
              >
                <button
                  type="button"
                  aria-pressed={false}
                  style={focusButtonStyle(tokens, false)}
                  onClick={() => {
                    onPaneFocusChange('exam');
                    setRatio(defaultRatioForFocus('exam'), true);
                  }}
                >
                  Focus exam
                </button>
                <button
                  type="button"
                  aria-pressed={paneFocus === 'work'}
                  style={focusButtonStyle(tokens, paneFocus === 'work')}
                  onClick={() => {
                    onPaneFocusChange('work');
                    setRatio(defaultRatioForFocus('work'), true);
                  }}
                >
                  Focus work
                </button>
                <button
                  type="button"
                  aria-pressed={paneFocus === 'balanced'}
                  style={focusButtonStyle(tokens, paneFocus === 'balanced')}
                  onClick={() => {
                    onPaneFocusChange('balanced');
                    setRatio(defaultRatioForFocus('balanced'), true);
                  }}
                >
                  Balanced
                </button>
                <button
                  type="button"
                  style={focusButtonStyle(tokens, false)}
                  title="Expand PDF"
                  onClick={() => setRatio(0.88, true)}
                >
                  Expand PDF
                </button>
                <button
                  type="button"
                  style={focusButtonStyle(tokens, false)}
                  title="Expand notebook"
                  onClick={() => setRatio(0.12, true)}
                >
                  Expand Notebook
                </button>
              </div>
              <div style={{ flex: 1, minWidth: 140 }}>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: tokens.textPrimary,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {examTitle || 'Exam'}
                </div>
                {statusLine ? (
                  <div style={{ fontSize: 10, color: tokens.textMuted, marginTop: 2 }}>{statusLine}</div>
                ) : null}
              </div>
            </>
          )}
          <button
            type="button"
            onClick={onDoneStudying}
            style={{
              fontSize: 12,
              fontWeight: 600,
              padding: '6px 12px',
              borderRadius: 8,
              border: `1px solid ${tokens.cardBorder}`,
              background: tokens.wellBg,
              color: tokens.textPrimary,
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            Done studying
          </button>
        </header>
        {showQuestionRail ? (
          <div
            role="toolbar"
            aria-label="Exam questions"
            style={{
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              flexWrap: 'wrap',
              padding: '6px 12px',
              borderBottom: `1px solid ${tokens.cardBorder}`,
              background: tokens.wellBg,
            }}
          >
            {questions.map(q => (
              <button
                key={q.number}
                type="button"
                aria-pressed={activeQuestionNumber === q.number}
                style={focusButtonStyle(tokens, activeQuestionNumber === q.number)}
                onClick={() => onSelectQuestion(q.number)}
              >
                {q.label}
              </button>
            ))}
          </div>
        ) : null}
        <div
          ref={bodyRef}
          style={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: chrome.bodyDirection,
            transition: paneTransition,
          }}
        >
          <div
            style={{
              flex: sourceFlex,
              minWidth: chrome.sourcePanel.minWidth ?? 0,
              minHeight: chrome.sourcePanel.minHeight ?? 0,
              display: 'flex',
              flexDirection: 'column',
              borderRight: isNarrow ? undefined : `1px solid ${tokens.cardBorder}`,
              borderBottom: isNarrow ? `1px solid ${tokens.cardBorder}` : undefined,
              overflow: 'hidden',
              transition: paneTransition,
            }}
          >
            {sourcePanel}
          </div>
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize panels"
            onPointerDown={startDividerDrag}
            style={{
              width: isNarrow ? 0 : 8,
              flexShrink: 0,
              cursor: isNarrow ? 'default' : 'col-resize',
              background: isNarrow ? 'transparent' : 'transparent',
              borderLeft: isNarrow ? 'none' : `1px solid ${tokens.cardBorder}`,
              borderRight: isNarrow ? 'none' : `1px solid ${tokens.cardBorder}`,
            }}
          />
          <div
            style={{
              flex: workFlex,
              minWidth: chrome.workPanel.minWidth ?? 0,
              minHeight: chrome.workPanel.minHeight ?? 0,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              transition: paneTransition,
            }}
          >
            {workPanel}
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
