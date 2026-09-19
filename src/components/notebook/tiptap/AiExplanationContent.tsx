/**
 * Read-only renderer for explain_selection result text.
 * Plain text as React text nodes; math via existing KatexPreview (KaTeX trust:false).
 * Does not interpret model HTML/Markdown.
 */

import { Fragment, memo, useMemo } from 'react';
import { KatexPreview } from '../KatexPreview';
import { parseAiExplanationSegments } from '../../../lib/ai/explainSelection/parseAiExplanationSegments';

type Props = {
  text: string;
  textColor?: string;
  mutedColor?: string;
  className?: string;
};

export const AiExplanationContent = memo(function AiExplanationContent({
  text,
  textColor = 'inherit',
  mutedColor = '#94a3b8',
  className,
}: Props) {
  const segments = useMemo(() => parseAiExplanationSegments(text), [text]);

  return (
    <div
      className={className}
      data-ai-explanation-content="1"
      style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
    >
      {segments.map((seg, i) => {
        if (seg.type === 'text') {
          return <Fragment key={i}>{seg.value}</Fragment>;
        }
        if (seg.type === 'inline') {
          return (
            <span
              key={i}
              dir="ltr"
              data-nb-math-isolate="1"
              data-ai-explanation-math="inline"
              style={{
                display: 'inline-block',
                verticalAlign: 'middle',
                margin: '0 1px',
                direction: 'ltr',
                unicodeBidi: 'isolate',
              }}
            >
              <KatexPreview
                latex={seg.latex}
                displayMode={false}
                textColor={textColor}
                mutedColor={mutedColor}
              />
            </span>
          );
        }
        return (
          <span
            key={i}
            dir="ltr"
            data-nb-math-isolate="1"
            data-ai-explanation-math="display"
            style={{
              display: 'block',
              margin: '8px 0',
              textAlign: 'center',
              direction: 'ltr',
              unicodeBidi: 'isolate',
              overflowX: 'auto',
            }}
          >
            <KatexPreview
              latex={seg.latex}
              displayMode
              textColor={textColor}
              mutedColor={mutedColor}
            />
          </span>
        );
      })}
    </div>
  );
});
