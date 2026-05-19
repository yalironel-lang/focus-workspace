import { Fragment, memo, useMemo } from 'react';
import { isWholeLineMath, plainMathToLatex, splitPlainMathSpans } from '../../lib/mathInputAssistant';
import { parseMathSegments, type MathSegment } from '../../lib/notebookMath';
import { KatexPreview } from './KatexPreview';

interface Props {
  text: string;
  textColor?: string;
  mutedColor?: string;
  style?: React.CSSProperties;
  className?: string;
  /** In math notebook preview: render undelimited plain math (y=x^2, alpha, etc.). */
  autoPlainMath?: boolean;
}

function expandPlainMathInText(value: string): MathSegment[] {
  const spans = splitPlainMathSpans(value);
  const out: MathSegment[] = [];
  for (const span of spans) {
    if (span.type === 'text') {
      if (span.value) out.push({ type: 'text', value: span.value });
    } else {
      out.push({ type: 'inline', latex: plainMathToLatex(span.value) });
    }
  }
  return out;
}

function mergeSegments(text: string, autoPlainMath: boolean): MathSegment[] {
  const delimited = parseMathSegments(text);
  if (!autoPlainMath) return delimited;

  return delimited.flatMap(seg => {
    if (seg.type !== 'text') return [seg];
    return expandPlainMathInText(seg.value);
  });
}

export const MathRichText = memo(function MathRichText({
  text,
  textColor = 'inherit',
  mutedColor = '#94a3b8',
  style,
  className,
  autoPlainMath = false,
}: Props) {
  const wholeLine = autoPlainMath && isWholeLineMath(text);
  const displayLatex = useMemo(
    () => (wholeLine ? plainMathToLatex(text.trim()) : ''),
    [wholeLine, text],
  );

  const segments = useMemo(
    () => (wholeLine ? [] : mergeSegments(text, autoPlainMath)),
    [text, autoPlainMath, wholeLine],
  );

  if (wholeLine && displayLatex) {
    return (
      <span
        className={className ? `${className} math-nb-hero-inner` : 'math-nb-hero-inner'}
        style={{ ...style, display: 'block', textAlign: 'center' }}
      >
        <KatexPreview
          latex={displayLatex}
          displayMode
          hero
          textColor={textColor}
          mutedColor={mutedColor}
        />
      </span>
    );
  }

  return (
    <span
      className={className}
      style={{ ...style, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
    >
      {segments.map((seg, i) => {
        if (seg.type === 'text') {
          return <Fragment key={i}>{seg.value}</Fragment>;
        }
        if (seg.type === 'inline') {
          return (
            <span key={i} style={{ display: 'inline-block', verticalAlign: 'middle', margin: '0 2px' }}>
              <KatexPreview latex={seg.latex} displayMode={false} textColor={textColor} mutedColor={mutedColor} />
            </span>
          );
        }
        return (
          <div key={i} style={{ margin: '10px 0', textAlign: 'center' }}>
            <KatexPreview latex={seg.latex} displayMode textColor={textColor} mutedColor={mutedColor} />
          </div>
        );
      })}
    </span>
  );
});
