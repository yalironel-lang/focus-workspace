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
      maxWidth: 420,
      margin: '4px auto 0',
      border: 'none',
      outline: 'none',
      background: 'transparent',
      color: mutedColor,
      fontSize: 11,
      fontWeight: 400,
      lineHeight: 1.4,
      letterSpacing: '0.02em',
      fontFamily: "'JetBrains Mono', ui-monospace, monospace",
      padding: '2px 4px',
      opacity: 0.38,
      caretColor: 'currentColor',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
      textAlign: 'center',
    };
  }
  return {
    ...base,
    margin: 0,
    marginTop: 10,
    paddingTop: 8,
    borderTop: '1px solid rgba(255,255,255,0.05)',
    opacity: 0.52,
    fontSize:
      typeof base.fontSize === 'number'
        ? Math.max(12, base.fontSize * 0.86)
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
  const [previewText, setPreviewText] = useState(text);
  const [morphReady, setMorphReady] = useState(true);

  const blockMargin = style.margin;

  useEffect(() => {
    if (!hasMath) setEditing(true);
  }, [hasMath]);

  useEffect(() => {
    if (!editing || !hasMath) {
      setPreviewText(text);
      return;
    }
    const t = window.setTimeout(() => setPreviewText(text), 90);
    return () => window.clearTimeout(t);
  }, [text, editing, hasMath]);

  useEffect(() => {
    setMorphReady(false);
    const r = requestAnimationFrame(() => setMorphReady(true));
    return () => cancelAnimationFrame(r);
  }, [editing, hasMath]);

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
      if (next?.closest('[data-nb-slash-menu]')) return;
      if (next && wrapRef.current?.contains(next)) return;
      if (hasMath) setEditing(false);
    },
    [hasMath],
  );

  const morphClass = morphReady ? 'math-nb-morph-ready' : 'math-nb-morph-enter';

  if (!editing && hasMath) {
    return (
      <div
        role="button"
        tabIndex={0}
        className={`${wholeLine ? 'math-nb-hero math-nb-interactive' : 'math-nb-interactive math-nb-mixed'} ${morphClass}`}
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
      >
        <MathRichText text={text} autoPlainMath textColor={textColor} mutedColor={mutedColor} />
      </div>
    );
  }

  return (
    <div ref={wrapRef} className={morphClass} style={{ margin: blockMargin }} onBlurCapture={handleBlur}>
      {hasMath ? (
        <div className={wholeLine ? 'math-nb-hero math-nb-stage' : 'math-nb-mixed-preview math-nb-stage'}>
          <MathRichText
            text={editing ? previewText : text}
            autoPlainMath
            textColor={textColor}
            mutedColor={mutedColor}
          />
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
