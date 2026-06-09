import { Fragment, memo, useMemo } from 'react';
import { isWholeLineMath, plainMathToLatex, splitPlainMathSpans } from '../../lib/mathInputAssistant';
import type { InlineMark } from '../../lib/notebookInlineMarks';
import { renderPlainWithMarks } from '../../lib/mathZoneInlineFormat';
import { parseMathSegments, type MathSegment } from '../../lib/notebookMath';
import { KatexPreview } from './KatexPreview';

interface Props {
  text: string;
  marks?: InlineMark[];
  textColor?: string;
  mutedColor?: string;
  style?: React.CSSProperties;
  className?: string;
  /** In math notebook preview: render undelimited plain math (y=x^2, alpha, etc.). */
  autoPlainMath?: boolean;
}

function sliceMarksForRange(marks: InlineMark[], start: number, end: number): InlineMark[] {
  return marks
    .filter(m => m.e > start && m.s < end)
    .map(m => ({
      ...m,
      s: Math.max(0, m.s - start),
      e: Math.min(end - start, m.e - start),
    }));
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

/** Advance plain-text offset past a rendered math segment in the source string. */
function advancePastMathSegment(text: string, offset: number, seg: MathSegment): number {
  if (seg.type === 'text') return offset + seg.value.length;
  if (seg.type === 'display' && text.startsWith('$$', offset)) {
    const close = text.indexOf('$$', offset + 2);
    return close === -1 ? text.length : close + 2;
  }
  if (text[offset] === '$') {
    const close = text.indexOf('$', offset + 1);
    return close === -1 ? text.length : close + 1;
  }
  const rest = text.slice(offset);
  const spans = splitPlainMathSpans(rest);
  const first = spans[0];
  return first ? offset + first.value.length : offset;
}

export const MathRichText = memo(function MathRichText({
  text,
  marks,
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

  let plainOffset = 0;

  return (
    <span
      className={className}
      style={{ ...style, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
    >
      {segments.map((seg, i) => {
        if (seg.type === 'text') {
          const sliceStart = plainOffset;
          const sliceEnd = plainOffset + seg.value.length;
          plainOffset = sliceEnd;
          const localMarks = marks?.length ? sliceMarksForRange(marks, sliceStart, sliceEnd) : [];
          return (
            <Fragment key={i}>
              {localMarks.length
                ? renderPlainWithMarks(seg.value, localMarks)
                : seg.value}
            </Fragment>
          );
        }
        if (seg.type === 'inline') {
          plainOffset = advancePastMathSegment(text, plainOffset, seg);
          return (
            <span key={i} style={{ display: 'inline-block', verticalAlign: 'middle', margin: '0 1px' }}>
              <KatexPreview latex={seg.latex} displayMode={false} textColor={textColor} mutedColor={mutedColor} />
            </span>
          );
        }
        // Use span (not div) so MathRichText is safe inside <p> or inline <span> ancestors.
        // display:block gives identical layout; avoids the "div inside p/span" HTML violation.
        plainOffset = advancePastMathSegment(text, plainOffset, seg);
        return (
          <span key={i} style={{ display: 'block', margin: '10px 0', textAlign: 'center' }}>
            <KatexPreview latex={seg.latex} displayMode textColor={textColor} mutedColor={mutedColor} />
          </span>
        );
      })}
    </span>
  );
});
