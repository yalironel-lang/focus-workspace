import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
} from 'react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import { isWholeLineMath, textLikelyHasPlainMath } from '../../lib/mathInputAssistant';
import { MathRichText } from './MathRichText';

interface EditableLineProps {
  id: string;
  text: string;
  tokens: AtmosphereTokens;
  placeholder: string;
  style: CSSProperties;
  onUpdate: (id: string, raw: string) => void;
  onFocusIndex: (id: string) => void;
  onAfterInput?: (el: HTMLDivElement) => void;
}

interface Props {
  id: string;
  text: string;
  tokens: AtmosphereTokens;
  placeholder: string;
  style: CSSProperties;
  textColor: string;
  mutedColor: string;
  onUpdate: (id: string, raw: string) => void;
  onFocusIndex: (id: string) => void;
  onAfterInput?: (el: HTMLDivElement) => void;
  EditableLine: React.ComponentType<EditableLineProps>;
}

function sourceFieldStyle(
  wholeLine: boolean,
  base: CSSProperties,
  mutedColor: string,
): CSSProperties {
  if (wholeLine) {
    return {
      width: '100%',
      border: 'none',
      outline: 'none',
      background: 'transparent',
      color: mutedColor,
      fontSize: 11,
      fontWeight: 400,
      lineHeight: 1.4,
      letterSpacing: '0.02em',
      fontFamily: "'JetBrains Mono', ui-monospace, monospace",
      margin: '2px 0 0',
      padding: '2px 4px',
      opacity: 0.42,
      caretColor: 'currentColor',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
      textAlign: 'center',
    };
  }
  return {
    ...base,
    margin: 0,
    marginTop: 8,
    paddingTop: 6,
    borderTop: '1px solid rgba(255,255,255,0.06)',
    opacity: 0.58,
    fontSize:
      typeof base.fontSize === 'number'
        ? Math.max(12, base.fontSize * 0.88)
        : base.fontSize,
    color: mutedColor,
  };
}

export const MathEditableParagraph = memo(function MathEditableParagraph({
  id,
  text,
  tokens,
  placeholder,
  style,
  textColor,
  mutedColor,
  onUpdate,
  onFocusIndex,
  onAfterInput,
  EditableLine,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const hasMath = text.trim().length > 0 && textLikelyHasPlainMath(text);
  const wholeLine = hasMath && isWholeLineMath(text);
  const [editing, setEditing] = useState(() => !hasMath);

  const blockMargin = style.margin;

  useEffect(() => {
    if (!hasMath) setEditing(true);
  }, [hasMath]);

  const beginEdit = useCallback(() => {
    setEditing(true);
    onFocusIndex(id);
    requestAnimationFrame(() => {
      wrapRef.current?.querySelector<HTMLElement>(`[data-editable-id="${id}"]`)?.focus();
    });
  }, [id, onFocusIndex]);

  const handleBlur = useCallback(
    (e: FocusEvent<HTMLDivElement>) => {
      const next = e.relatedTarget as HTMLElement | null;
      if (next?.closest('[data-math-input-toolbar]')) return;
      if (next && wrapRef.current?.contains(next)) return;
      if (hasMath) setEditing(false);
    },
    [hasMath],
  );

  if (!editing && hasMath) {
    return (
      <div
        role="button"
        tabIndex={0}
        className={wholeLine ? 'math-nb-hero math-nb-interactive' : 'math-nb-interactive math-nb-mixed'}
        onClick={beginEdit}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            beginEdit();
          }
        }}
        style={{
          margin: blockMargin,
          cursor: 'text',
          outline: 'none',
        }}
        title="Click to edit"
      >
        <MathRichText text={text} autoPlainMath textColor={textColor} mutedColor={mutedColor} />
      </div>
    );
  }

  return (
    <div ref={wrapRef} style={{ margin: blockMargin }} onBlurCapture={handleBlur}>
      {hasMath ? (
        <div className={wholeLine ? 'math-nb-hero' : 'math-nb-mixed-preview'}>
          <MathRichText text={text} autoPlainMath textColor={textColor} mutedColor={mutedColor} />
        </div>
      ) : null}
      <EditableLine
        id={id}
        text={text}
        tokens={tokens}
        placeholder={hasMath ? (wholeLine ? 'y=x^2' : placeholder) : placeholder}
        onUpdate={onUpdate}
        onFocusIndex={bid => {
          setEditing(true);
          onFocusIndex(bid);
        }}
        onAfterInput={onAfterInput}
        style={hasMath ? sourceFieldStyle(wholeLine, style, mutedColor) : { ...style, margin: 0 }}
      />
    </div>
  );
});
