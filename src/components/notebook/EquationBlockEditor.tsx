import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Trash2 } from 'lucide-react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import type { CSSProperties } from 'react';
import { KatexPreview } from './KatexPreview';
import { latexToSimple, looksLikeLatex, plainMathToLatex } from '../../lib/mathInputAssistant';

interface EditableLineProps {
  id: string;
  text: string;
  tokens: AtmosphereTokens;
  placeholder: string;
  style: CSSProperties;
  onUpdate: (id: string, text: string) => void;
  onFocusIndex: (id: string) => void;
  onAfterInput?: (el: HTMLDivElement) => void;
}

type EditMode = 'simple' | 'latex';

interface Props {
  blockId: string;
  text: string;
  tokens: AtmosphereTokens;
  notebookInk: { headline: string; ghost: string };
  typeScale: { l5: number; s5: number };
  marginStyle: CSSProperties;
  surfaceChrome: CSSProperties;
  isFocused: boolean;
  isMathNotebook: boolean;
  /** When true, forces simple mode and hides the Simple/LaTeX toggle — math-workspace only */
  isMathWorkspace?: boolean;
  EditableLine: React.ComponentType<EditableLineProps>;
  onUpdate: (id: string, text: string) => void;
  onFocusIndex: (id: string) => void;
  onAfterInput?: (el: HTMLDivElement) => void;
  onDelete: () => void;
  morphPulse?: boolean;
}

function initialEditMode(text: string, isMathNotebook: boolean): EditMode {
  if (!isMathNotebook) return 'latex';
  return looksLikeLatex(text) && text.trim() ? 'latex' : 'simple';
}

export const EquationBlockEditor = memo(function EquationBlockEditor({
  blockId,
  text,
  tokens,
  notebookInk,
  typeScale,
  marginStyle,
  surfaceChrome,
  isFocused,
  isMathNotebook,
  isMathWorkspace = false,
  EditableLine,
  onUpdate,
  onFocusIndex,
  onAfterInput,
  onDelete,
  morphPulse,
}: Props) {
  const [copied, setCopied] = useState(false);
  // math-workspace always uses simple mode — the Simple↔LaTeX distinction is an impl detail
  const [editMode, setEditMode] = useState<EditMode>(() => isMathWorkspace ? 'simple' : initialEditMode(text, isMathNotebook));
  // editingDraft: updates immediately on every keystroke (drives the input's value)
  // previewDraft: debounced 100ms — KatexPreview only re-renders when this changes
  const [editingDraft, setEditingDraft] = useState(() => latexToSimple(text));
  const [previewDraft, setPreviewDraft] = useState(() => latexToSimple(text));
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (editMode === 'simple') {
      const v = latexToSimple(text);
      setEditingDraft(v);
      setPreviewDraft(v);
    }
  }, [text, editMode]);

  // Debounce KaTeX re-render by 100ms so the preview doesn't repaint on every keystroke
  useEffect(() => {
    const t = setTimeout(() => setPreviewDraft(editingDraft), 100);
    return () => clearTimeout(t);
  }, [editingDraft]);

  const previewLatex = useMemo(() => {
    if (editMode === 'simple') return plainMathToLatex(previewDraft);
    return text;
  }, [editMode, previewDraft, text]);

  const schedulePersist = useCallback(
    (latex: string) => {
      if (persistTimer.current) clearTimeout(persistTimer.current);
      persistTimer.current = setTimeout(() => {
        if (latex !== text) onUpdate(blockId, latex);
      }, 180);
    },
    [blockId, onUpdate, text],
  );

  useEffect(
    () => () => {
      if (persistTimer.current) clearTimeout(persistTimer.current);
    },
    [],
  );

  const handleSimpleChange = useCallback(
    (value: string) => {
      setEditingDraft(value);
      schedulePersist(plainMathToLatex(value));
    },
    [schedulePersist],
  );

  const handleCopy = useCallback(async () => {
    const payload = (editMode === 'simple' ? plainMathToLatex(editingDraft) : text).trim();
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      /* ignore */
    }
  }, [editMode, editingDraft, text]);

  const switchMode = useCallback(
    (mode: EditMode) => {
      if (mode === editMode) return;
      if (mode === 'simple') {
        const v = latexToSimple(text);
        setEditingDraft(v);
        setPreviewDraft(v);
      } else {
        const latex = plainMathToLatex(editingDraft);
        onUpdate(blockId, latex);
      }
      setEditMode(mode);
    },
    [blockId, editMode, onUpdate, editingDraft, text],
  );

  const showEditor = isFocused || !text.trim();
  const useSimple = isMathNotebook && editMode === 'simple';

  return (
    <div
      data-nb-surface-block
      data-block-id={blockId}
      data-nb-pulse={morphPulse ? '1' : undefined}
      style={{
        ...surfaceChrome,
        ...marginStyle,
        padding: isMathNotebook ? '14px 16px 12px' : '15px 18px',
        borderRadius: isMathWorkspace ? '10px' : '16px',
        border: isMathWorkspace
          ? `1px solid ${isFocused ? `${tokens.accent}44` : `${tokens.accent}1a`}`
          : `1px solid ${isFocused ? `${tokens.accent}44` : tokens.cardBorder}`,
        background: isMathWorkspace
          ? `linear-gradient(180deg, ${tokens.wellBg}55 0%, ${tokens.cardBg}33 100%)`
          : `linear-gradient(180deg, ${tokens.wellBg}ee 0%, ${tokens.cardBg}c8 100%)`,
        boxShadow: isMathWorkspace
          ? (isFocused ? `0 0 0 1px ${tokens.accent}28` : 'none')
          : (isFocused
              ? `inset 0 1px 0 rgba(255,255,255,0.05), 0 0 0 1px ${tokens.accent}22`
              : 'inset 0 1px 0 rgba(255,255,255,0.04)'),
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          marginBottom: `${typeScale.s5}px`,
        }}
      >
        {!isMathNotebook ? (
          <span
            style={{
              fontSize: `${typeScale.l5}px`,
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: notebookInk.ghost,
            }}
          >
            Equation
          </span>
        ) : (
          <span style={{ flex: 1 }} />
        )}
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {/* Simple/LaTeX toggle: shown in math mode, hidden in math-workspace (simple mode is implicit) */}
          {isMathNotebook && !isMathWorkspace ? (
            <div style={{ display: 'flex', gap: 2, marginRight: 4 }}>
              {(['simple', 'latex'] as const).map(mode => (
                <button
                  key={mode}
                  type="button"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => switchMode(mode)}
                  style={{
                    border: `1px solid ${editMode === mode ? `${tokens.accent}55` : tokens.cardBorder}`,
                    background: editMode === mode ? `${tokens.accent}18` : 'transparent',
                    color: editMode === mode ? tokens.accent : tokens.textMuted,
                    borderRadius: 6,
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    padding: '3px 7px',
                    cursor: 'pointer',
                  }}
                >
                  {mode === 'simple' ? 'Simple' : 'LaTeX'}
                </button>
              ))}
            </div>
          ) : null}
          <button
            type="button"
            onMouseDown={e => e.preventDefault()}
            onClick={() => void handleCopy()}
            title="Copy equation"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              border: `1px solid ${tokens.cardBorder}`,
              background: 'transparent',
              color: copied ? tokens.accent : tokens.textMuted,
              borderRadius: 7,
              fontSize: 10,
              fontWeight: 600,
              padding: '4px 8px',
              cursor: 'pointer',
            }}
          >
            <Copy className="w-3 h-3" />
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button
            type="button"
            onMouseDown={e => e.preventDefault()}
            onClick={onDelete}
            title="Delete equation"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              border: `1px solid ${tokens.cardBorder}`,
              background: 'transparent',
              color: tokens.textMuted,
              borderRadius: 7,
              padding: '4px 7px',
              cursor: 'pointer',
            }}
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      <div
        className={isMathNotebook ? 'math-nb-hero' : undefined}
        style={{
          marginBottom: showEditor ? 6 : 0,
          padding: isMathNotebook ? '14px 10px 10px' : '4px 0',
          minHeight: isMathNotebook ? 48 : undefined,
        }}
      >
        <KatexPreview
          latex={previewLatex}
          displayMode
          hero={isMathNotebook}
          textColor={notebookInk.headline}
          mutedColor={tokens.textMuted}
          emptyHint={useSimple ? 'y=x^2' : undefined}
        />
      </div>

      {showEditor ? (
        useSimple ? (
            <input
              data-equation-simple={blockId}
              type="text"
              value={editingDraft}
              onChange={e => handleSimpleChange(e.target.value)}
              onFocus={() => onFocusIndex(blockId)}
              onBlur={e => {
                const next = e.relatedTarget as HTMLElement | null;
                if (next?.closest('[data-math-input-toolbar]')) return;
                if (persistTimer.current) {
                  clearTimeout(persistTimer.current);
                  persistTimer.current = null;
                }
                const latex = plainMathToLatex(editingDraft);
                if (latex !== text) onUpdate(blockId, latex);
              }}
              placeholder="y=x^2"
              aria-label="Edit expression"
              style={{
                width: '100%',
                boxSizing: 'border-box',
                border: 'none',
                outline: 'none',
                background: 'transparent',
                borderRadius: 4,
                padding: '2px 4px',
                color: tokens.textMuted,
                fontSize: 11,
                fontWeight: 400,
                lineHeight: 1.4,
                margin: 0,
                opacity: 0.4,
                textAlign: 'center',
                fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                caretColor: tokens.accent,
              }}
            />
        ) : (
          <EditableLine
            id={blockId}
            text={text}
            tokens={tokens}
            placeholder="f(x) = x^2  or  \\int_0^1 x^2 \\, dx"
            onUpdate={onUpdate}
            onFocusIndex={onFocusIndex}
            onAfterInput={onAfterInput}
            style={{
              width: '100%',
              border: 'none',
              outline: 'none',
              background: 'rgba(0,0,0,0.12)',
              borderRadius: 8,
              padding: '8px 10px',
              color: notebookInk.headline,
              fontSize: 13,
              fontWeight: 500,
              lineHeight: 1.65,
              letterSpacing: '0.02em',
              fontFamily: "'JetBrains Mono', 'SFMono-Regular', monospace",
              margin: 0,
              caretColor: tokens.accent,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          />
        )
      ) : (
        <button
          type="button"
          onClick={() => {
            onFocusIndex(blockId);
            requestAnimationFrame(() => {
              if (useSimple) {
                document.querySelector<HTMLInputElement>(`[data-equation-simple="${blockId}"]`)?.focus({ preventScroll: true });
              } else {
                document.querySelector<HTMLElement>(`[data-editable-id="${blockId}"]`)?.focus({ preventScroll: true });
              }
            });
          }}
          style={{
            marginTop: 4,
            border: 'none',
            background: 'transparent',
            color: tokens.textMuted,
            fontSize: 10,
            fontWeight: 600,
            cursor: 'pointer',
            padding: 0,
          }}
        >
          {isMathNotebook ? 'Edit' : 'Edit LaTeX'}
        </button>
      )}
    </div>
  );
});
