import { memo, useCallback, useState } from 'react';
import { Copy, Trash2 } from 'lucide-react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import type { CSSProperties } from 'react';
import { KatexPreview } from './KatexPreview';

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
  EditableLine: React.ComponentType<EditableLineProps>;
  onUpdate: (id: string, text: string) => void;
  onFocusIndex: (id: string) => void;
  onAfterInput?: (el: HTMLDivElement) => void;
  onDelete: () => void;
  morphPulse?: boolean;
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
  EditableLine,
  onUpdate,
  onFocusIndex,
  onAfterInput,
  onDelete,
  morphPulse,
}: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    const payload = text.trim() || '';
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      /* ignore */
    }
  }, [text]);

  const showSource = isFocused || !text.trim();

  return (
    <div
      data-nb-surface-block
      data-block-id={blockId}
      data-nb-pulse={morphPulse ? '1' : undefined}
      style={{
        ...surfaceChrome,
        ...marginStyle,
        padding: isMathNotebook ? '14px 16px 12px' : '15px 18px',
        borderRadius: '16px',
        border: `1px solid ${isFocused ? `${tokens.accent}44` : tokens.cardBorder}`,
        background: `linear-gradient(180deg, ${tokens.wellBg}ee 0%, ${tokens.cardBg}c8 100%)`,
        boxShadow: isFocused
          ? `inset 0 1px 0 rgba(255,255,255,0.05), 0 0 0 1px ${tokens.accent}22`
          : 'inset 0 1px 0 rgba(255,255,255,0.04)',
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
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            type="button"
            onMouseDown={e => e.preventDefault()}
            onClick={() => void handleCopy()}
            title="Copy LaTeX"
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
            {copied ? 'Copied' : 'LaTeX'}
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
        style={{
          marginBottom: showSource ? 10 : 0,
          padding: isMathNotebook ? '8px 4px 4px' : '4px 0',
        }}
      >
        <KatexPreview
          latex={text}
          displayMode
          textColor={notebookInk.headline}
          mutedColor={tokens.textMuted}
        />
      </div>

      {showSource ? (
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
      ) : (
        <button
          type="button"
          onClick={() => {
            onFocusIndex(blockId);
            requestAnimationFrame(() => {
              document.querySelector<HTMLElement>(`[data-editable-id="${blockId}"]`)?.focus();
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
          Edit LaTeX
        </button>
      )}
    </div>
  );
});
