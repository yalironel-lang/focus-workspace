import { memo } from 'react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';

export interface MathSnippet {
  id: string;
  label: string;
  insert: string;
  title?: string;
}

export const MATH_SNIPPETS: MathSnippet[] = [
  { id: 'frac', label: '⅟', insert: '\\frac{a}{b}', title: 'Fraction' },
  { id: 'pow', label: 'xⁿ', insert: 'x^{n}', title: 'Exponent' },
  { id: 'sqrt', label: '√', insert: '\\sqrt{x}', title: 'Square root' },
  { id: 'int', label: '∫', insert: '\\int_{a}^{b}', title: 'Integral' },
  { id: 'sum', label: 'Σ', insert: '\\sum_{i=1}^{n}', title: 'Summation' },
  { id: 'lim', label: 'lim', insert: '\\lim_{x \\to 0}', title: 'Limit' },
  { id: 'alpha', label: 'α', insert: '\\alpha', title: 'Alpha' },
  { id: 'beta', label: 'β', insert: '\\beta', title: 'Beta' },
  { id: 'theta', label: 'θ', insert: '\\theta', title: 'Theta' },
  { id: 'pi', label: 'π', insert: '\\pi', title: 'Pi' },
  { id: 'infty', label: '∞', insert: '\\infty', title: 'Infinity' },
  { id: 'arrow', label: '→', insert: '\\rightarrow', title: 'Arrow' },
  { id: 'matrix', label: '[·]', insert: '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}', title: 'Matrix' },
  { id: 'parens', label: '( )', insert: '\\left( \\right)', title: 'Brackets' },
];

interface Props {
  tokens: AtmosphereTokens;
  onInsert: (snippet: string) => void;
}

export const MathSymbolBar = memo(function MathSymbolBar({ tokens, onInsert }: Props) {
  return (
    <div
      role="toolbar"
      aria-label="Math symbols"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 4,
        padding: '6px 8px',
        marginBottom: 10,
        borderRadius: 10,
        border: `1px solid ${tokens.cardBorder}`,
        background: 'rgba(0,0,0,0.14)',
      }}
    >
      <span
        style={{
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: tokens.textMuted,
          alignSelf: 'center',
          paddingRight: 4,
          flexShrink: 0,
        }}
      >
        Math
      </span>
      {MATH_SNIPPETS.map(s => (
        <button
          key={s.id}
          type="button"
          title={s.title ?? s.label}
          onMouseDown={e => {
            e.preventDefault();
            onInsert(s.insert);
          }}
          style={{
            border: `1px solid ${tokens.cardBorder}`,
            background: tokens.wellBg,
            color: tokens.textPrimary,
            borderRadius: 7,
            minWidth: 28,
            height: 26,
            padding: '0 6px',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            lineHeight: 1,
          }}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
});
