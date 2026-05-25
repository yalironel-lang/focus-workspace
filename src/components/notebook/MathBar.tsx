/**
 * MathBar — the unified intent surface for mathematical writing.
 *
 * Replaces the old static toolbar (MathInputToolbar) and command-reference strip.
 * Positioned at the bottom of the content flow, after all blocks.
 * Intent-based: buttons express *what the user wants to create*, not syntax.
 *
 * Pass 1: block-intent row + symbol strip. No modals, no forms.
 */
import { memo, useRef, useState } from 'react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';

export type MathBarBlockIntent = 'step' | 'math' | 'theorem' | 'definition' | 'note';

interface Props {
  tokens: AtmosphereTokens;
  onAddBlock: (kind: MathBarBlockIntent) => void;
  onInsertSymbol: (symbol: string) => void;
}

const BLOCK_INTENTS: Array<{ kind: MathBarBlockIntent; glyph: string; label: string; hint: string }> = [
  { kind: 'step',       glyph: '→',  label: 'Step',       hint: 'Derivation step' },
  { kind: 'math',       glyph: '∫',  label: 'Equation',   hint: 'Display equation' },
  { kind: 'theorem',    glyph: '≡',  label: 'Theorem',    hint: 'Theorem or result' },
  { kind: 'definition', glyph: '∘',  label: 'Definition', hint: 'Definition' },
  { kind: 'note',       glyph: '·',  label: 'Note',       hint: 'Annotation or aside' },
];

const SYMBOLS: Array<{ label: string; insert: string; hint: string }> = [
  { label: 'α', insert: 'alpha',    hint: 'Alpha' },
  { label: 'β', insert: 'beta',     hint: 'Beta' },
  { label: 'γ', insert: 'gamma',    hint: 'Gamma' },
  { label: 'θ', insert: 'theta',    hint: 'Theta' },
  { label: 'π', insert: 'pi',       hint: 'Pi' },
  { label: '∞', insert: 'infinity', hint: 'Infinity' },
  { label: '∂', insert: '\\partial', hint: 'Partial' },
  { label: '→', insert: '->',       hint: 'Arrow (→)' },
  { label: '±', insert: '\\pm',     hint: 'Plus-minus' },
  { label: '≤', insert: '<=',       hint: 'Less or equal' },
  { label: '≥', insert: '>=',       hint: 'Greater or equal' },
];

export const MathBar = memo(function MathBar({ tokens, onAddBlock, onInsertSymbol }: Props) {
  const [hovered, setHovered] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={containerRef}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        marginTop: 28,
        paddingBottom: 12,
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 2,
        opacity: hovered ? 0.82 : 0.13,
        transition: 'opacity 0.24s ease',
        userSelect: 'none',
      }}
    >
      {/* Block intent buttons */}
      {BLOCK_INTENTS.map(intent => (
        <button
          key={intent.kind}
          type="button"
          title={intent.hint}
          onMouseDown={e => e.preventDefault()}
          onClick={() => onAddBlock(intent.kind)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            border: `1px solid rgba(255,255,255,0.09)`,
            background: 'transparent',
            color: tokens.textMuted,
            borderRadius: 7,
            padding: '3px 8px 3px 6px',
            fontSize: 11,
            fontWeight: 500,
            cursor: 'pointer',
            lineHeight: 1,
            letterSpacing: '0.01em',
          }}
        >
          <span style={{ fontSize: 12, opacity: 0.7, fontWeight: 400 }}>{intent.glyph}</span>
          {intent.label}
        </button>
      ))}

      {/* Separator */}
      <span
        aria-hidden
        style={{
          display: 'inline-block',
          width: 1,
          height: 16,
          background: 'rgba(255,255,255,0.12)',
          margin: '0 5px',
          alignSelf: 'center',
        }}
      />

      {/* Symbol insert buttons */}
      {SYMBOLS.map(sym => (
        <button
          key={sym.insert}
          type="button"
          title={sym.hint}
          onMouseDown={e => e.preventDefault()}
          onClick={() => onInsertSymbol(sym.insert)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: `1px solid rgba(255,255,255,0.07)`,
            background: 'transparent',
            color: tokens.textMuted,
            borderRadius: 5,
            width: 24,
            height: 24,
            fontSize: 12,
            cursor: 'pointer',
            lineHeight: 1,
          }}
        >
          {sym.label}
        </button>
      ))}
    </div>
  );
});
