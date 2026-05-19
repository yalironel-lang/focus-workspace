import { Fragment, memo, useMemo } from 'react';
import { parseMathSegments } from '../../lib/notebookMath';
import { KatexPreview } from './KatexPreview';

interface Props {
  text: string;
  textColor?: string;
  mutedColor?: string;
  style?: React.CSSProperties;
}

export const MathRichText = memo(function MathRichText({
  text,
  textColor = 'inherit',
  mutedColor = '#94a3b8',
  style,
}: Props) {
  const segments = useMemo(() => parseMathSegments(text), [text]);

  return (
    <span style={{ ...style, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
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
