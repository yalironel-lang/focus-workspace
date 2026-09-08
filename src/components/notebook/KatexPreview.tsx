import { memo, useMemo, type CSSProperties } from 'react';
import { renderKatexHtml } from '../../lib/notebookMath';

/** Keep KaTeX visually LTR inside RTL/BiDi paragraphs (source latex unchanged). */
const MATH_ISOLATE: CSSProperties = {
  direction: 'ltr',
  unicodeBidi: 'isolate',
};

interface Props {
  latex: string;
  displayMode?: boolean;
  /** Larger display for whole-line equations in math notebook */
  hero?: boolean;
  /** Fallback text color for errors */
  mutedColor?: string;
  textColor?: string;
  className?: string;
  style?: CSSProperties;
  emptyHint?: string;
}

export const KatexPreview = memo(function KatexPreview({
  latex,
  displayMode = false,
  hero = false,
  mutedColor = '#94a3b8',
  textColor = 'inherit',
  className,
  style,
  emptyHint = 'Type an expression…',
}: Props) {
  const { html, error } = useMemo(
    () => renderKatexHtml(latex, displayMode),
    [latex, displayMode],
  );

  if (!latex.trim()) {
    return (
      <div
        className={className}
        dir="ltr"
        data-nb-math-isolate="1"
        style={{ ...MATH_ISOLATE, ...style, color: mutedColor, fontSize: 12, fontStyle: 'italic' }}
      >
        {emptyHint}
      </div>
    );
  }

  if (error) {
    return (
      <div className={className} dir="ltr" data-nb-math-isolate="1" style={{ ...MATH_ISOLATE, ...style }}>
        <div
          style={{
            fontSize: 11,
            color: '#f87171',
            marginBottom: 6,
            fontWeight: 600,
          }}
        >
          {error}
        </div>
        <pre
          style={{
            margin: 0,
            padding: '8px 10px',
            borderRadius: 8,
            background: 'rgba(248,113,113,0.08)',
            border: '1px solid rgba(248,113,113,0.25)',
            color: textColor,
            fontSize: 12,
            fontFamily: "'JetBrains Mono', monospace",
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            direction: 'ltr',
            unicodeBidi: 'isolate',
          }}
        >
          {latex}
        </pre>
      </div>
    );
  }

  const heroClass = hero && displayMode ? 'math-katex-hero' : '';

  return (
    <div
      className={[className, heroClass].filter(Boolean).join(' ') || undefined}
      dir="ltr"
      data-nb-math-isolate="1"
      style={{
        ...MATH_ISOLATE,
        ...style,
        color: textColor,
        overflowX: 'auto',
        overflowY: 'hidden',
        textAlign: displayMode ? 'center' : 'left',
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
});
