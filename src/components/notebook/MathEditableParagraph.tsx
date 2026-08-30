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
  isLikelyMathLine,
  isWholeLineMath,
  normalizeToLinearMath,
  plainMathToLatex,
  textLikelyHasPlainMath,
} from '../../lib/mathInputAssistant';
import { textHasMathDelimiters } from '../../lib/notebookMath';
import { KatexPreview } from './KatexPreview';
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
  /**
   * When true (default), undelimited plain/LaTeX math is rendered as KaTeX
   * (same policy as MathZone / math notebooks via isLikelyMathLine).
   * When false, only `$...$` / `$$...$$` delimiters are rendered (mixed prose).
   */
  autoPlainMath?: boolean;
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
  autoPlainMath = true,
  EditableLine,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  // Match MathZone: isLikelyMathLine → whole-line KaTeX; do not require $ / $$.
  const hasMath =
    text.trim().length > 0 &&
    (autoPlainMath
      ? textLikelyHasPlainMath(text) || isLikelyMathLine(text)
      : textHasMathDelimiters(text));
  // Match MathZone LineEquation for undelimited math-like lines.
  // If $ / $$ are present, keep MathRichText so parseMathSegments strips delimiters
  // (avoids leftover `$` / `$$` when isLikelyMathLine is also true).
  const wholeLine =
    autoPlainMath &&
    hasMath &&
    !textHasMathDelimiters(text) &&
    (isWholeLineMath(text) || isLikelyMathLine(text));
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
        const canonical = autoPlainMath ? normalizeToLinearMath(text) : text;
        if (canonical !== text) onUpdate(id, canonical);
        setEditing(false);
      }
    },
    [hasMath, deskFormattingKeepEditable, autoPlainMath, id, onUpdate, text],
  );

  if (!editing && hasMath && !deskFormattingKeepEditable) {
    // Match MathZone LineEquation: isLikelyMathLine → whole-line display KaTeX
    // (MathRichText only treats isWholeLineMath as display; that is too narrow).
    if (wholeLine) {
      const latex = plainMathToLatex(text.trim());
      return (
        <div
          role="button"
          tabIndex={0}
          className="math-nb-hero math-nb-interactive"
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
            display: 'block',
            textAlign: 'center',
          }}
        >
          <KatexPreview
            latex={latex}
            displayMode
            hero
            textColor={textColor}
            mutedColor={mutedColor}
          />
        </div>
      );
    }

    return (
      <div
        role="button"
        tabIndex={0}
        className="math-nb-interactive math-nb-mixed"
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
          autoPlainMath={autoPlainMath}
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
