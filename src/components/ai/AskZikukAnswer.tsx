/**
 * Ask ZIKUK academic answer renderer (M0.9C3).
 *
 * - Safe Markdown subset via react-markdown (no raw HTML / rehype-raw)
 * - Math via existing parseAiExplanationSegments + KatexPreview (trust:false)
 * - Citations [n] interactive only when sources[] authorizes index n
 * - Model links never become navigable ZIKUK sources
 */

import {
  Children,
  Fragment,
  memo,
  useMemo,
  type CSSProperties,
  type ReactNode,
} from 'react';
import ReactMarkdown from 'react-markdown';
import { KatexPreview } from '../notebook/KatexPreview';
import type { AskCourseSourceRef } from '../../lib/ai/gatewayClient';
import {
  prepareAskAcademicMarkdown,
  splitAskInlinePieces,
  type AskProtectedSlot,
} from '../../lib/ai/askCourse/prepareAskAcademicMarkdown';

type Props = {
  text: string;
  sources: AskCourseSourceRef[];
  textColor?: string;
  mutedColor?: string;
  accentColor?: string;
  onCitationActivate?: (source: AskCourseSourceRef) => void;
  className?: string;
};

function CitationButton(props: {
  index: number;
  source: AskCourseSourceRef | undefined;
  mutedColor: string;
  accentColor: string;
  onCitationActivate?: (source: AskCourseSourceRef) => void;
}) {
  const { index, source, mutedColor, accentColor, onCitationActivate } = props;
  if (!source) {
    return <span style={{ color: mutedColor, whiteSpace: 'nowrap' }}>[{index}]</span>;
  }
  return (
    <button
      type="button"
      data-ask-zikuk-citation={index}
      aria-label={`Open source ${index}`}
      onClick={() => onCitationActivate?.(source)}
      style={{
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
      [{index}]
    </button>
  );
}

function SlotView(props: {
  slot: AskProtectedSlot | undefined;
  textColor: string;
  mutedColor: string;
}) {
  const { slot, textColor, mutedColor } = props;
  if (!slot) return null;
  if (slot.kind === 'inline_math') {
    return (
      <span
        dir="ltr"
        data-nb-math-isolate="1"
        data-ask-zikuk-math="inline"
        style={{
          display: 'inline-block',
          verticalAlign: 'middle',
          margin: '0 1px',
          direction: 'ltr',
          unicodeBidi: 'isolate',
        }}
      >
        <KatexPreview
          latex={slot.latex}
          displayMode={false}
          textColor={textColor}
          mutedColor={mutedColor}
        />
      </span>
    );
  }
  if (slot.kind === 'display_math') {
    return (
      <span
        dir="ltr"
        data-nb-math-isolate="1"
        data-ask-zikuk-math="display"
        style={{
          display: 'block',
          margin: '14px 0',
          textAlign: 'center',
          direction: 'ltr',
          unicodeBidi: 'isolate',
          overflowX: 'auto',
        }}
      >
        <KatexPreview
          latex={slot.latex}
          displayMode
          textColor={textColor}
          mutedColor={mutedColor}
        />
      </span>
    );
  }
  return (
    <pre
      data-ask-zikuk-code-block="1"
      data-language={slot.language || undefined}
      style={{
        margin: '12px 0',
        padding: '12px 14px',
        borderRadius: 10,
        background: 'rgba(15, 23, 42, 0.55)',
        border: '1px solid rgba(148, 163, 184, 0.22)',
        overflowX: 'auto',
        fontSize: 13,
        lineHeight: 1.55,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        color: textColor,
        whiteSpace: 'pre',
      }}
    >
      <code>{slot.code}</code>
    </pre>
  );
}

function soleSlotIndex(children: ReactNode): number | null {
  const arr = Children.toArray(children).filter(c => !(typeof c === 'string' && !c.trim()));
  if (arr.length !== 1) return null;
  const only = arr[0];
  if (typeof only !== 'string' && typeof only !== 'number') return null;
  const pieces = splitAskInlinePieces(String(only).trim());
  if (pieces.length !== 1 || pieces[0]!.type !== 'slot') return null;
  return pieces[0]!.index;
}

function expandString(
  value: string,
  ctx: {
    slots: AskProtectedSlot[];
    byIndex: Map<number, AskCourseSourceRef>;
    mutedColor: string;
    accentColor: string;
    textColor: string;
    onCitationActivate?: (source: AskCourseSourceRef) => void;
  },
): ReactNode[] {
  return splitAskInlinePieces(value).map((piece, i) => {
    if (piece.type === 'text') {
      return <Fragment key={`t${i}`}>{piece.value}</Fragment>;
    }
    if (piece.type === 'slot') {
      return (
        <SlotView
          key={`s${i}`}
          slot={ctx.slots[piece.index]}
          textColor={ctx.textColor}
          mutedColor={ctx.mutedColor}
        />
      );
    }
    return (
      <CitationButton
        key={`c${i}`}
        index={piece.index}
        source={ctx.byIndex.get(piece.index)}
        mutedColor={ctx.mutedColor}
        accentColor={ctx.accentColor}
        onCitationActivate={ctx.onCitationActivate}
      />
    );
  });
}

function expandChildren(
  children: ReactNode,
  ctx: {
    slots: AskProtectedSlot[];
    byIndex: Map<number, AskCourseSourceRef>;
    mutedColor: string;
    accentColor: string;
    textColor: string;
    onCitationActivate?: (source: AskCourseSourceRef) => void;
  },
): ReactNode {
  return Children.map(children, (child, i) => {
    if (typeof child === 'string' || typeof child === 'number') {
      return <Fragment key={i}>{expandString(String(child), ctx)}</Fragment>;
    }
    return child;
  });
}

const headingBase: CSSProperties = {
  margin: '1.1em 0 0.45em',
  fontWeight: 700,
  letterSpacing: '-0.01em',
  lineHeight: 1.35,
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
  const prepared = useMemo(() => prepareAskAcademicMarkdown(text), [text]);
  const byIndex = useMemo(() => {
    const map = new Map<number, AskCourseSourceRef>();
    for (const s of sources) map.set(s.index, s);
    return map;
  }, [sources]);

  const ctx = useMemo(
    () => ({
      slots: prepared.slots,
      byIndex,
      mutedColor,
      accentColor,
      textColor,
      onCitationActivate,
    }),
    [prepared.slots, byIndex, mutedColor, accentColor, textColor, onCitationActivate],
  );

  const wrapInline = (node: ReactNode) => expandChildren(node, ctx);

  return (
    <div
      className={className}
      data-ask-zikuk-answer="1"
      data-ask-zikuk-academic="1"
      style={{
        wordBreak: 'break-word',
        fontSize: 15,
        lineHeight: 1.7,
        color: textColor,
      }}
    >
      <ReactMarkdown
        // Default: no raw HTML. Do not add rehype-raw.
        skipHtml
        urlTransform={() => ''}
        components={{
          p: ({ children }) => {
            const slotOnly = soleSlotIndex(children);
            if (slotOnly != null) {
              return (
                <SlotView
                  slot={ctx.slots[slotOnly]}
                  textColor={textColor}
                  mutedColor={mutedColor}
                />
              );
            }
            return (
              <p style={{ margin: '0 0 0.85em' }} data-ask-zikuk-md="p">
                {wrapInline(children)}
              </p>
            );
          },
          h1: ({ children }) => (
            <h1 style={{ ...headingBase, fontSize: '1.28em' }} data-ask-zikuk-md="h1">
              {wrapInline(children)}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 style={{ ...headingBase, fontSize: '1.16em' }} data-ask-zikuk-md="h2">
              {wrapInline(children)}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 style={{ ...headingBase, fontSize: '1.08em' }} data-ask-zikuk-md="h3">
              {wrapInline(children)}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 style={{ ...headingBase, fontSize: '1.02em' }} data-ask-zikuk-md="h4">
              {wrapInline(children)}
            </h4>
          ),
          h5: ({ children }) => (
            <h5 style={{ ...headingBase, fontSize: '1em' }} data-ask-zikuk-md="h5">
              {wrapInline(children)}
            </h5>
          ),
          h6: ({ children }) => (
            <h6 style={{ ...headingBase, fontSize: '0.95em' }} data-ask-zikuk-md="h6">
              {wrapInline(children)}
            </h6>
          ),
          strong: ({ children }) => (
            <strong style={{ fontWeight: 700 }} data-ask-zikuk-md="strong">
              {wrapInline(children)}
            </strong>
          ),
          em: ({ children }) => (
            <em style={{ fontStyle: 'italic' }} data-ask-zikuk-md="em">
              {wrapInline(children)}
            </em>
          ),
          ul: ({ children }) => (
            <ul
              data-ask-zikuk-md="ul"
              style={{
                margin: '0.35em 0 0.9em',
                paddingInlineStart: '1.35em',
                listStyleType: 'disc',
              }}
            >
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol
              data-ask-zikuk-md="ol"
              style={{
                margin: '0.35em 0 0.9em',
                paddingInlineStart: '1.35em',
                listStyleType: 'decimal',
              }}
            >
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li data-ask-zikuk-md="li" style={{ margin: '0.28em 0', paddingInlineStart: 2 }}>
              {wrapInline(children)}
            </li>
          ),
          code: ({ children, className }) => {
            // Fenced blocks come through our slots; leftover code fences from MD:
            const isBlock = typeof className === 'string' && className.includes('language-');
            if (isBlock) {
              return (
                <code data-ask-zikuk-md="code-block" style={{ fontFamily: 'inherit' }}>
                  {children}
                </code>
              );
            }
            return (
              <code
                data-ask-zikuk-md="code"
                style={{
                  fontFamily:
                    "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                  fontSize: '0.9em',
                  padding: '0.12em 0.35em',
                  borderRadius: 5,
                  background: 'rgba(148, 163, 184, 0.16)',
                }}
              >
                {wrapInline(children)}
              </code>
            );
          },
          pre: ({ children }) => {
            // If children already include our SlotView pre, avoid double wrap.
            return (
              <div data-ask-zikuk-md="pre" style={{ margin: 0 }}>
                {children}
              </div>
            );
          },
          a: ({ children }) => (
            // Never follow model hrefs — show label text only.
            <span data-ask-zikuk-md="link-plain" style={{ textDecoration: 'underline dotted' }}>
              {wrapInline(children)}
            </span>
          ),
          blockquote: ({ children }) => (
            <blockquote
              data-ask-zikuk-md="blockquote"
              style={{
                margin: '0.6em 0 0.95em',
                padding: '0.15em 0 0.15em 0.9em',
                borderInlineStart: `3px solid ${accentColor}66`,
                color: mutedColor,
              }}
            >
              {children}
            </blockquote>
          ),
          br: () => ' ',
          hr: () => (
            <hr
              data-ask-zikuk-md="hr"
              style={{
                border: 'none',
                borderTop: `1px solid ${mutedColor}44`,
                margin: '1.1em 0',
              }}
            />
          ),
          // Disallow media / tables from becoming interactive surfaces.
          img: () => null,
          table: ({ children }) => (
            <div data-ask-zikuk-md="table-wrap" style={{ overflowX: 'auto', margin: '0.8em 0' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.95em' }}>
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th
              style={{
                textAlign: 'start',
                padding: '6px 8px',
                borderBottom: `1px solid ${mutedColor}55`,
                fontWeight: 700,
              }}
            >
              {wrapInline(children)}
            </th>
          ),
          td: ({ children }) => (
            <td
              style={{
                textAlign: 'start',
                padding: '6px 8px',
                borderBottom: `1px solid ${mutedColor}33`,
                verticalAlign: 'top',
              }}
            >
              {wrapInline(children)}
            </td>
          ),
        }}
      >
        {prepared.markdown}
      </ReactMarkdown>
    </div>
  );
});
