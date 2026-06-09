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
import type { InlineMark } from '../../lib/notebookInlineMarks';
import {
  isWholeLineMath,
  normalizeToLinearMath,
  textLikelyHasPlainMath,
} from '../../lib/mathInputAssistant';
import { MathRichText } from './MathRichText';

interface EditableLineProps {
  id: string;
  text: string;
  marks?: InlineMark[];
  tokens: AtmosphereTokens;
  placeholder: string;
  style: CSSProperties;
  onUpdate: (id: string, raw: string, marks?: InlineMark[]) => void;
  onFocusIndex: (id: string) => void;
  onAfterInput?: (el: HTMLDivElement) => void;
  onSelectionChange?: (id: string, el: HTMLDivElement) => void;
}

interface Props {
  id: string;
  text: string;
  marks?: InlineMark[];
  tokens: AtmosphereTokens;
  placeholder: string;
  style: CSSProperties;
  textColor: string;
  mutedColor: string;
  onUpdate: (id: string, raw: string, marks?: InlineMark[]) => void;
  onFocusIndex: (id: string) => void;
  onAfterInput?: (el: HTMLDivElement) => void;
  onSelectionChange?: (id: string, el: HTMLDivElement) => void;
  /** Desk Formatting V1: keep RichEditableLine surface (no math preview read mode). */
  deskFormattingKeepEditable?: boolean;
  EditableLine: React.ComponentType<EditableLineProps>;
}

export const MathEditableParagraph = memo(function MathEditableParagraph({
  id,
  text,
  marks,
  tokens,
  placeholder,
  style,
  textColor,
  mutedColor,
  onUpdate,
  onFocusIndex,
  onAfterInput,
  onSelectionChange,
  deskFormattingKeepEditable = false,
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
      if (next?.closest('.desk-math-palette')) return;
      if (next?.closest('[data-nb-slash-menu]')) return;
      if (next?.closest('[data-nb-format-toolbar]')) return;
      if (next && wrapRef.current?.contains(next)) return;
      if (hasMath && !deskFormattingKeepEditable) {
        const canonical = normalizeToLinearMath(text);
        if (canonical !== text) onUpdate(id, canonical);
        setEditing(false);
      }
    },
    [hasMath, deskFormattingKeepEditable, id, onUpdate, text],
  );

  if (!editing && hasMath && !deskFormattingKeepEditable) {
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
          transition: 'opacity 0.1s ease',
        }}
      >
        <MathRichText
          text={text}
          marks={marks}
          autoPlainMath
          textColor={textColor}
          mutedColor={mutedColor}
        />
      </div>
    );
  }

  return (
    <div ref={wrapRef} style={{ margin: blockMargin }} onBlurCapture={handleBlur}>
      <EditableLine
        id={id}
        text={text}
        marks={marks}
        tokens={tokens}
        placeholder={hasMath ? (wholeLine ? 'y=x^2' : placeholder) : placeholder}
        onUpdate={onUpdate}
        onFocusIndex={bid => {
          setEditing(true);
          onFocusIndex(bid);
        }}
        onAfterInput={onAfterInput}
        onSelectionChange={onSelectionChange}
        style={{ ...style, margin: 0 }}
      />
    </div>
  );
});
