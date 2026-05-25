import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Trash2 } from 'lucide-react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import type { CSSProperties } from 'react';
import { KatexPreview } from './KatexPreview';
import { latexToSimple, looksLikeLatex, plainMathToLatex } from '../../lib/mathInputAssistant';
import { tryMathTabExpansion } from '../../lib/mathStemShortcuts';

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

/** Greek word → unicode symbol conversions triggered by a trailing space in simple mode. */
const GREEK_DISPLAY: Array<[string, string]> = [
  ['alpha', 'α'], ['beta', 'β'], ['gamma', 'γ'], ['delta', 'δ'],
  ['epsilon', 'ε'], ['theta', 'θ'], ['lambda', 'λ'], ['mu', 'μ'],
  ['pi', 'π'], ['sigma', 'σ'], ['omega', 'ω'], ['phi', 'φ'],
  ['tau', 'τ'], ['rho', 'ρ'], ['infty', '∞'], ['inf', '∞'],
];

/** Symbols available in the inline strip when an equation block is focused (simple mode). */
const EQUATION_SYMBOLS: Array<{ label: string; insert: string }> = [
  { label: 'α', insert: 'alpha' },
  { label: 'β', insert: 'beta' },
  { label: 'γ', insert: 'gamma' },
  { label: 'θ', insert: 'theta' },
  { label: 'π', insert: 'pi' },
  { label: '∞', insert: 'infinity' },
  { label: '∂', insert: '\\partial' },
  { label: '→', insert: '->' },
  { label: '±', insert: '\\pm' },
  { label: '≤', insert: '<=' },
  { label: '≥', insert: '>=' },
  { label: '≠', insert: '!=' },
  { label: '×', insert: '\\times' },
];

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
  const [isHovered, setIsHovered] = useState(false);
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
      let processed = value;
      // Space-triggered Greek word → unicode symbol (e.g. "alpha " → "α ")
      if (value.endsWith(' ')) {
        const withoutSpace = value.slice(0, -1);
        for (const [word, sym] of GREEK_DISPLAY) {
          if (withoutSpace.endsWith(word)) {
            const charBefore = withoutSpace[withoutSpace.length - word.length - 1];
            if (!charBefore || !/[a-zA-Z]/.test(charBefore)) {
              processed = withoutSpace.slice(0, withoutSpace.length - word.length) + sym + ' ';
              break;
            }
          }
        }
      }
      setEditingDraft(processed);
      schedulePersist(plainMathToLatex(processed));
    },
    [schedulePersist],
  );

  const handleSymbolInsert = useCallback(
    (symbolInsert: string) => {
      const input = document.querySelector<HTMLInputElement>(`[data-equation-simple="${blockId}"]`);
      if (!input) {
        // No input visible — just append to draft
        const next = editingDraft + symbolInsert;
        handleSimpleChange(next);
        return;
      }
      const start = input.selectionStart ?? input.value.length;
      const end = input.selectionEnd ?? start;
      const before = input.value.slice(0, start);
      const after = input.value.slice(end);
      const next = before + symbolInsert + after;
      handleSimpleChange(next);
      requestAnimationFrame(() => {
        input.focus();
        const pos = start + symbolInsert.length;
        input.setSelectionRange(pos, pos);
      });
    },
    [blockId, editingDraft, handleSimpleChange],
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

  // In math-workspace, the block reveals its chrome only on hover/focus.
  // Resting state: pure equation display — no border, no background, no chrome.
  const wsChrome = isFocused || isHovered;

  return (
    <div
      data-nb-surface-block
      data-block-id={blockId}
      data-nb-pulse={morphPulse ? '1' : undefined}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        ...surfaceChrome,
        ...marginStyle,
        padding: isMathWorkspace
          ? (wsChrome ? '14px 16px 12px' : '6px 0')
          : (isMathNotebook ? '14px 16px 12px' : '15px 18px'),
        borderRadius: isMathWorkspace ? '10px' : '16px',
        border: isMathWorkspace
          ? (isFocused
              ? `1px solid ${tokens.accent}44`
              : isHovered
                ? `1px solid ${tokens.accent}22`
                : 'none')
          : `1px solid ${isFocused ? `${tokens.accent}44` : tokens.cardBorder}`,
        background: isMathWorkspace
          ? (wsChrome ? `linear-gradient(180deg, ${tokens.wellBg}55 0%, ${tokens.cardBg}33 100%)` : 'transparent')
          : `linear-gradient(180deg, ${tokens.wellBg}ee 0%, ${tokens.cardBg}c8 100%)`,
        boxShadow: isMathWorkspace
          ? (isFocused ? `0 0 0 1px ${tokens.accent}28` : 'none')
          : (isFocused
              ? `inset 0 1px 0 rgba(255,255,255,0.05), 0 0 0 1px ${tokens.accent}22`
              : 'inset 0 1px 0 rgba(255,255,255,0.04)'),
      }}
    >
      {/* Header chrome: always visible outside math-workspace; on hover/focus only inside it */}
      {(!isMathWorkspace || wsChrome) && <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          marginBottom: `${typeScale.s5}px`,
          opacity: isMathWorkspace && !isFocused ? 0.65 : 1,
          transition: 'opacity 0.15s ease',
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
      </div>}

      <div
        className={isMathNotebook && (!isMathWorkspace || wsChrome) ? 'math-nb-hero' : undefined}
        style={{
          marginBottom: showEditor ? 6 : 0,
          padding: isMathWorkspace && !wsChrome
            ? '4px 0'
            : (isMathNotebook ? '14px 10px 10px' : '4px 0'),
          minHeight: isMathNotebook ? 48 : undefined,
          textAlign: isMathWorkspace && !wsChrome ? 'center' : undefined,
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

      {/* Inline symbol strip — appears between preview and input when focused in simple mode.
          Keeps math tools spatially collocated with where the student is typing.
          data-math-input-toolbar prevents the input from blurring on symbol click. */}
      {showEditor && useSimple && isFocused && (
        <div
          data-math-input-toolbar="1"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: 2,
            padding: '5px 4px 3px',
          }}
        >
          {EQUATION_SYMBOLS.map(sym => (
            <button
              key={sym.insert}
              type="button"
              title={sym.label}
              onMouseDown={e => e.preventDefault()}
              onClick={() => handleSymbolInsert(sym.insert)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: `1px solid ${tokens.cardBorder}`,
                background: 'transparent',
                color: tokens.textMuted,
                borderRadius: 5,
                width: 22,
                height: 20,
                fontSize: 12,
                cursor: 'pointer',
                lineHeight: 1,
                opacity: 0.72,
              }}
            >
              {sym.label}
            </button>
          ))}
        </div>
      )}

      {showEditor ? (
        useSimple ? (
            <input
              data-equation-simple={blockId}
              type="text"
              value={editingDraft}
              onChange={e => handleSimpleChange(e.target.value)}
              onFocus={() => onFocusIndex(blockId)}
              onKeyDown={e => {
                if (e.key === 'Tab') {
                  const pos = e.currentTarget.selectionStart ?? editingDraft.length;
                  const expanded = tryMathTabExpansion(editingDraft, pos);
                  if (expanded) {
                    e.preventDefault();
                    handleSimpleChange(expanded.text);
                    requestAnimationFrame(() => {
                      const inp = document.querySelector<HTMLInputElement>(
                        `[data-equation-simple="${blockId}"]`,
                      );
                      if (inp) inp.setSelectionRange(expanded.caret, expanded.caret);
                    });
                  }
                }
              }}
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
                document.querySelector<HTMLInputElement>(`[data-equation-simple="${blockId}"]`)?.focus();
              } else {
                document.querySelector<HTMLElement>(`[data-editable-id="${blockId}"]`)?.focus();
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
