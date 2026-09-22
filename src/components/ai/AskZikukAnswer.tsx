/**
 * Ask ZIKUK answer renderer.
 * Reuses Explain math segmentation; never interprets model HTML.
 * Citation markers [n] are interactive only when sources[] authorizes index n.
 *
 * M0.9B.1: citations stay inline with prose (not block-level / full-width).
 */

import { Fragment, memo, useMemo } from 'react';
import { KatexPreview } from '../notebook/KatexPreview';
import { parseAiExplanationSegments } from '../../lib/ai/explainSelection/parseAiExplanationSegments';
import type { AskCourseSourceRef } from '../../lib/ai/gatewayClient';

type TextPart =
  | { type: 'text'; value: string }
  | { type: 'citation'; index: number };

type RenderPart =
  | { type: 'text'; value: string }
  | { type: 'citation'; index: number }
  | { type: 'inline'; latex: string }
  | { type: 'display'; latex: string };

const CITATION_RE = /\[(\d+)\]/g;

/** Collapse newlines immediately before a citation so markers stay inline with prose. */
function trimTrailingBreaksForInlineCitation(value: string): string {
  if (!value) return value;
  const withoutBreaks = value.replace(/[\t ]*[\r\n]+[\t ]*$/g, ' ');
  return withoutBreaks.replace(/[ \t]{2,}$/g, ' ');
}

function splitTextWithCitations(value: string): TextPart[] {
  if (!value) return [];
  const parts: TextPart[] = [];
  let last = 0;
  CITATION_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CITATION_RE.exec(value)) !== null) {
    if (m.index > last) {
      parts.push({
        type: 'text',
        value: trimTrailingBreaksForInlineCitation(value.slice(last, m.index)),
      });
    }
    parts.push({ type: 'citation', index: Number(m[1]) });
    last = m.index + m[0].length;
  }
  if (last < value.length) {
    parts.push({ type: 'text', value: value.slice(last) });
  }
  return parts.length > 0 ? parts : [{ type: 'text', value }];
}

function buildRenderParts(text: string): RenderPart[] {
  const segments = parseAiExplanationSegments(text);
  const out: RenderPart[] = [];
  for (const seg of segments) {
    if (seg.type === 'text') {
      out.push(...splitTextWithCitations(seg.value));
    } else if (seg.type === 'inline') {
      out.push({ type: 'inline', latex: seg.latex });
    } else {
      out.push({ type: 'display', latex: seg.latex });
    }
  }
  return out;
}

type Props = {
  text: string;
  sources: AskCourseSourceRef[];
  textColor?: string;
  mutedColor?: string;
  accentColor?: string;
  onCitationActivate?: (source: AskCourseSourceRef) => void;
  className?: string;
};

export const AskZikukAnswer = memo(function AskZikukAnswer({
  text,
  sources,
  textColor = 'inherit',
  mutedColor = '#94a3b8',
  accentColor = '#94a3b8',
  onCitationActivate,
  className,
}: Props) {
  const parts = useMemo(() => buildRenderParts(text), [text]);
  const byIndex = useMemo(() => {
    const map = new Map<number, AskCourseSourceRef>();
    for (const s of sources) map.set(s.index, s);
    return map;
  }, [sources]);

  return (
    <div
      className={className}
      data-ask-zikuk-answer="1"
      style={{
        wordBreak: 'break-word',
        fontSize: 15,
        lineHeight: 1.65,
        color: textColor,
      }}
    >
      {parts.map((part, i) => {
        if (part.type === 'text') {
          return (
            <span key={i} style={{ whiteSpace: 'pre-wrap' }}>
              {part.value}
            </span>
          );
        }
        if (part.type === 'citation') {
          const source = byIndex.get(part.index);
          if (!source) {
            return (
              <span key={i} style={{ color: mutedColor, whiteSpace: 'nowrap' }}>
                [{part.index}]
              </span>
            );
          }
          return (
            <button
              key={i}
              type="button"
              data-ask-zikuk-citation={part.index}
              aria-label={`Open source ${part.index}`}
              onClick={() => onCitationActivate?.(source)}
              style={{
                // Keep marker in the prose flow (avoid block / full-width button defaults).
                display: 'inline',
                width: 'auto',
                height: 'auto',
                maxWidth: 'none',
                padding: '0 3px',
                margin: '0 1px',
                border: 'none',
                borderRadius: 4,
                background: `${accentColor}22`,
                color: accentColor,
                fontSize: '0.92em',
                fontWeight: 700,
                lineHeight: 'inherit',
                fontFamily: 'inherit',
                cursor: onCitationActivate ? 'pointer' : 'default',
                verticalAlign: 'baseline',
                whiteSpace: 'nowrap',
                boxSizing: 'content-box',
              }}
            >
              [{part.index}]
            </button>
          );
        }
        if (part.type === 'inline') {
          return (
            <span
              key={i}
              dir="ltr"
              data-nb-math-isolate="1"
              style={{
                display: 'inline-block',
                verticalAlign: 'middle',
                margin: '0 1px',
                direction: 'ltr',
                unicodeBidi: 'isolate',
              }}
            >
              <KatexPreview
                latex={part.latex}
                displayMode={false}
                textColor={textColor}
                mutedColor={mutedColor}
              />
            </span>
          );
        }
        return (
          <Fragment key={i}>
            <span
              dir="ltr"
              data-nb-math-isolate="1"
              style={{
                display: 'block',
                margin: '10px 0',
                textAlign: 'center',
                direction: 'ltr',
                unicodeBidi: 'isolate',
                overflowX: 'auto',
              }}
            >
              <KatexPreview
                latex={part.latex}
                displayMode
                textColor={textColor}
                mutedColor={mutedColor}
              />
            </span>
          </Fragment>
        );
      })}
    </div>
  );
});
