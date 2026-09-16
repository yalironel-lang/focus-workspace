/**
 * React NodeViews for TipTap Notebook shadow viewer (read-only).
 * RTL Phase A: block-level dir + logical CSS; math LTR-isolated.
 */

import { useState, useRef, useEffect, type CSSProperties } from 'react';
import type { NodeViewProps } from '@tiptap/react';
import { NodeViewContent, NodeViewWrapper } from '@tiptap/react';
import { KatexPreview } from '../../components/notebook/KatexPreview';
import { MathRichText } from '../../components/notebook/MathRichText';
import { plainMathToLatex } from '../mathInputAssistant';
import { textHasMathDelimiters, renderKatexHtml } from '../notebookMath';
import type { InlineMark } from '../notebookInlineMarks';
import { tiptapInlineToRichLine } from './inlineBridge';
import type { CalloutTone, TextAlignment } from '../notebookDialect';
import {
  BULLET_GLYPHS,
  NB_FONT_STACK,
  NB_INK,
  NB_TYPE_SCALE,
  calloutLabel,
  calloutToneTokens,
} from './visualTokens';
import { NotebookHandwritingReadonlyView, NotebookImageReadonlyView } from './readonlyMedia';
import {
  mathLtrIsolateProps,
  notebookChromeAwareDirWrapperProps,
  notebookDirWrapperProps,
  type NotebookTextDir,
} from './direction';

function richFromNode(node: NodeViewProps['node']) {
  try {
    return tiptapInlineToRichLine(node.toJSON().content);
  } catch {
    return { plain: node.textContent ?? '', marks: [] };
  }
}

function shouldUseMathRich(plain: string, marks?: InlineMark[]): boolean {
  return textHasMathDelimiters(plain) || Boolean(marks && marks.some(m => m.t === 'm'));
}

function dirProps(node: NodeViewProps['node']) {
  return notebookDirWrapperProps(
    node.attrs.dir as NotebookTextDir,
    node.textContent ?? '',
    node.attrs.align as TextAlignment | undefined,
  );
}

function wrapDir(
  node: NodeViewProps['node'],
  HTMLAttributes: Record<string, unknown> | undefined,
  extra?: Record<string, unknown>,
) {
  const d = dirProps(node);
  return {
    ...HTMLAttributes,
    dir: d.dir,
    'data-nb-dir': d['data-nb-dir'],
    'data-nb-effective-dir': d['data-nb-effective-dir'],
    ...extra,
  };
}

const baseText: CSSProperties = {
  fontFamily: NB_FONT_STACK,
  color: NB_INK.primary,
  lineHeight: 1.92,
  fontSize: NB_TYPE_SCALE.l3,
  margin: 0,
};

export function NbParagraphView({ node, HTMLAttributes }: NodeViewProps) {
  const variant = node.attrs.variant as string | null;
  const { plain, marks } = richFromNode(node);
  const d = dirProps(node);
  const style: CSSProperties = {
    ...baseText,
    ...d.style,
    fontSize: variant === 'fine' ? NB_TYPE_SCALE.l5 : variant === 'muted' ? NB_TYPE_SCALE.l4 : NB_TYPE_SCALE.l3,
    color: variant === 'fine' || variant === 'muted' ? NB_INK.muted : NB_INK.primary,
    minHeight: plain ? undefined : NB_TYPE_SCALE.l3 * 1.92,
  };
  const wrap = wrapDir(node, HTMLAttributes as Record<string, unknown>);
  if (shouldUseMathRich(plain, marks)) {
    return (
      <NodeViewWrapper as="div" {...wrap} style={style}>
        <MathRichText text={plain} marks={marks} textColor={NB_INK.primary} mutedColor={NB_INK.muted} />
      </NodeViewWrapper>
    );
  }
  return (
    <NodeViewWrapper as="div" {...wrap} style={style}>
      <NodeViewContent as="div" />
    </NodeViewWrapper>
  );
}

export function NbTitleView({ node }: NodeViewProps) {
  const { plain, marks } = richFromNode(node);
  const d = dirProps(node);
  const style: CSSProperties = {
    ...baseText,
    ...d.style,
    fontSize: NB_TYPE_SCALE.l1,
    fontWeight: 700,
    letterSpacing: '-0.03em',
    color: NB_INK.headline,
    lineHeight: 1.25,
  };
  if (shouldUseMathRich(plain, marks)) {
    return (
      <NodeViewWrapper as="h1" data-nb="nbTitle" dir={d.dir} data-nb-dir={d['data-nb-dir']} data-nb-effective-dir={d['data-nb-effective-dir']} style={style}>
        <MathRichText text={plain} marks={marks} textColor={NB_INK.headline} mutedColor={NB_INK.muted} />
      </NodeViewWrapper>
    );
  }
  return (
    <NodeViewWrapper as="h1" data-nb="nbTitle" dir={d.dir} data-nb-dir={d['data-nb-dir']} data-nb-effective-dir={d['data-nb-effective-dir']} style={style}>
      <NodeViewContent as="div" />
    </NodeViewWrapper>
  );
}

export function NbSectionView({ node }: NodeViewProps) {
  const { plain, marks } = richFromNode(node);
  const d = dirProps(node);
  const style: CSSProperties = {
    ...baseText,
    ...d.style,
    fontSize: NB_TYPE_SCALE.l2,
    fontWeight: 600,
    letterSpacing: '-0.02em',
    color: NB_INK.section,
    lineHeight: 1.35,
  };
  if (shouldUseMathRich(plain, marks)) {
    return (
      <NodeViewWrapper as="h2" data-nb="nbSection" dir={d.dir} data-nb-dir={d['data-nb-dir']} data-nb-effective-dir={d['data-nb-effective-dir']} style={style}>
        <MathRichText text={plain} marks={marks} textColor={NB_INK.section} mutedColor={NB_INK.muted} />
      </NodeViewWrapper>
    );
  }
  return (
    <NodeViewWrapper as="h2" data-nb="nbSection" dir={d.dir} data-nb-dir={d['data-nb-dir']} data-nb-effective-dir={d['data-nb-effective-dir']} style={style}>
      <NodeViewContent as="div" />
    </NodeViewWrapper>
  );
}

export function NbQuoteView({ node }: NodeViewProps) {
  const { plain, marks } = richFromNode(node);
  const d = dirProps(node);
  const style: CSSProperties = {
    ...baseText,
    ...d.style,
    borderInlineStart: '3px solid rgba(148,163,184,0.45)',
    paddingInlineStart: 14,
    color: NB_INK.secondary,
    fontStyle: 'italic',
  };
  if (shouldUseMathRich(plain, marks)) {
    return (
      <NodeViewWrapper as="blockquote" data-nb="nbQuote" dir={d.dir} data-nb-dir={d['data-nb-dir']} data-nb-effective-dir={d['data-nb-effective-dir']} style={style}>
        <MathRichText text={plain} marks={marks} textColor={NB_INK.secondary} mutedColor={NB_INK.muted} />
      </NodeViewWrapper>
    );
  }
  return (
    <NodeViewWrapper as="blockquote" data-nb="nbQuote" dir={d.dir} data-nb-dir={d['data-nb-dir']} data-nb-effective-dir={d['data-nb-effective-dir']} style={style}>
      <NodeViewContent as="div" />
    </NodeViewWrapper>
  );
}

export function NbStepView({ node }: NodeViewProps) {
  const { plain, marks } = richFromNode(node);
  const d = dirProps(node);
  const style: CSSProperties = {
    ...baseText,
    ...d.style,
    display: 'flex',
    gap: 10,
    alignItems: 'flex-start',
  };
  return (
    <NodeViewWrapper as="div" data-nb="nbStep" dir={d.dir} data-nb-dir={d['data-nb-dir']} data-nb-effective-dir={d['data-nb-effective-dir']} style={style}>
      <span style={{ color: '#34d399', fontWeight: 700, flexShrink: 0 }}>⇒</span>
      <div style={{ flex: 1 }}>
        {shouldUseMathRich(plain, marks) ? (
          <MathRichText text={plain} marks={marks} textColor={NB_INK.primary} mutedColor={NB_INK.muted} />
        ) : (
          <NodeViewContent as="div" />
        )}
      </div>
    </NodeViewWrapper>
  );
}

export function NbMathView({ node }: NodeViewProps) {
  const { plain } = richFromNode(node);
  const isolate = mathLtrIsolateProps();
  return (
    <NodeViewWrapper
      as="div"
      data-nb="nbMath"
      dir={isolate.dir}
      data-nb-math-isolate={isolate['data-nb-math-isolate']}
      style={{ margin: '10px 0', ...isolate.style }}
    >
      <KatexPreview
        latex={plainMathToLatex(plain.trim())}
        displayMode
        hero
        textColor={NB_INK.primary}
        mutedColor={NB_INK.muted}
      />
    </NodeViewWrapper>
  );
}

export function NbBulletView({ node }: NodeViewProps) {
  const depth = Math.min(2, Math.max(0, Number(node.attrs.depth ?? 0)));
  const { plain, marks } = richFromNode(node);
  const d = dirProps(node);
  const style: CSSProperties = {
    ...baseText,
    ...d.style,
    display: 'flex',
    gap: 10,
    paddingInlineStart: depth * 20,
    alignItems: 'flex-start',
  };
  return (
    <NodeViewWrapper as="div" data-nb="nbBullet" dir={d.dir} data-nb-dir={d['data-nb-dir']} data-nb-effective-dir={d['data-nb-effective-dir']} style={style}>
      <span style={{ color: NB_INK.muted, width: 14, flexShrink: 0 }}>{BULLET_GLYPHS[depth]}</span>
      <div style={{ flex: 1 }}>
        {shouldUseMathRich(plain, marks) ? (
          <MathRichText text={plain} marks={marks} textColor={NB_INK.primary} mutedColor={NB_INK.muted} />
        ) : (
          <NodeViewContent as="div" />
        )}
      </div>
    </NodeViewWrapper>
  );
}

export function NbOrderedView({ node }: NodeViewProps) {
  const number = Number(node.attrs.number ?? 1);
  const { plain, marks } = richFromNode(node);
  const d = dirProps(node);
  const style: CSSProperties = {
    ...baseText,
    ...d.style,
    display: 'flex',
    gap: 10,
    alignItems: 'flex-start',
  };
  return (
    <NodeViewWrapper as="div" data-nb="nbOrdered" dir={d.dir} data-nb-dir={d['data-nb-dir']} data-nb-effective-dir={d['data-nb-effective-dir']} style={style}>
      <span style={{ color: NB_INK.muted, minWidth: 22, flexShrink: 0 }}>{number}.</span>
      <div style={{ flex: 1 }}>
        {shouldUseMathRich(plain, marks) ? (
          <MathRichText text={plain} marks={marks} textColor={NB_INK.primary} mutedColor={NB_INK.muted} />
        ) : (
          <NodeViewContent as="div" />
        )}
      </div>
    </NodeViewWrapper>
  );
}

export function NbTaskView({ node }: NodeViewProps) {
  const checked = Boolean(node.attrs.checked);
  const { plain, marks } = richFromNode(node);
  const d = dirProps(node);
  const style: CSSProperties = {
    ...baseText,
    ...d.style,
    display: 'flex',
    gap: 10,
    alignItems: 'flex-start',
    textDecoration: checked ? 'line-through' : undefined,
    color: checked ? NB_INK.muted : NB_INK.primary,
  };
  return (
    <NodeViewWrapper as="div" data-nb="nbTask" dir={d.dir} data-nb-dir={d['data-nb-dir']} data-nb-effective-dir={d['data-nb-effective-dir']} style={style}>
      <span aria-hidden style={{ flexShrink: 0 }}>
        {checked ? '☑' : '☐'}
      </span>
      <div style={{ flex: 1 }}>
        {shouldUseMathRich(plain, marks) ? (
          <MathRichText text={plain} marks={marks} textColor={style.color as string} mutedColor={NB_INK.muted} />
        ) : (
          <NodeViewContent as="div" />
        )}
      </div>
    </NodeViewWrapper>
  );
}

export function NbCalloutView({ node }: NodeViewProps) {
  const tone = (node.attrs.tone ?? 'concept') as CalloutTone;
  const ct = calloutToneTokens(tone);
  const { plain, marks } = richFromNode(node);
  const d = notebookChromeAwareDirWrapperProps(
    node.attrs.dir as NotebookTextDir,
    node.textContent ?? '',
    node.attrs.align as TextAlignment | undefined,
  );
  return (
    <NodeViewWrapper
      as="div"
      data-nb="nbCallout"
      data-nb-academic-type={tone}
      data-nb-academic-label={calloutLabel(tone)}
      dir={d.dir}
      data-nb-dir={d['data-nb-dir']}
      data-nb-effective-dir={d['data-nb-effective-dir']}
      style={{
        ...d.style,
        /* Match product SandboxCalloutView: quiet family + logical-start accent. */
        borderInlineStart: `2px solid ${ct.bar}`,
        backgroundColor: ct.bg,
        borderRadius: 6,
        paddingBlock: 7,
        paddingInline: 12,
        marginBlock: 7,
        fontFamily: NB_FONT_STACK,
      }}
    >
      <div
        data-nb-academic-chrome="1"
        dir="ltr"
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.02em',
          color: ct.label,
          marginBottom: 3,
          lineHeight: 1.25,
          userSelect: 'none',
        }}
      >
        {calloutLabel(tone)}
      </div>
      <div style={{ ...baseText, color: NB_INK.primary }}>
        {shouldUseMathRich(plain, marks) ? (
          <MathRichText text={plain} marks={marks} textColor={NB_INK.primary} mutedColor={NB_INK.muted} />
        ) : (
          <NodeViewContent as="div" />
        )}
      </div>
    </NodeViewWrapper>
  );
}

export function NbDividerView() {
  return (
    <NodeViewWrapper as="div" data-nb="nbDivider" style={{ margin: '14px 0' }}>
      <hr style={{ border: 'none', borderTop: '1px solid rgba(148,163,184,0.28)', margin: 0 }} />
    </NodeViewWrapper>
  );
}

export function NbImageRefView({ node }: NodeViewProps) {
  return (
    <NodeViewWrapper as="div" data-nb="nbImageRef" style={{ margin: '10px 0' }}>
      <NotebookImageReadonlyView
        imageKey={String(node.attrs.key ?? '')}
        alt={String(node.attrs.alt ?? '')}
        width={typeof node.attrs.width === 'number' ? node.attrs.width : null}
      />
    </NodeViewWrapper>
  );
}

export function createNbHandwritingView(objectId?: string) {
  return function NbHandwritingView({ node }: NodeViewProps) {
    return (
      <NodeViewWrapper as="div" data-nb="nbHandwriting" style={{ margin: '10px 0' }}>
        <NotebookHandwritingReadonlyView objectId={objectId} blockKey={String(node.attrs.key ?? '')} />
      </NodeViewWrapper>
    );
  };
}

export function NbInlineMathView({
  node,
  selected,
  updateAttributes,
  editor,
}: NodeViewProps) {
  const text = (node.attrs.text as string) ?? '';
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(text);
  }, [text]);

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  const commit = () => {
    const next = draft.trim();
    if (next && next !== text) {
      updateAttributes({ text: next });
    } else {
      setDraft(text);
    }
    setIsEditing(false);
  };

  const cancel = () => {
    setDraft(text);
    setIsEditing(false);
  };

  const latex = plainMathToLatex(text);
  const { html, error } = renderKatexHtml(latex, false);

  if (isEditing && editor?.isEditable) {
    const stopPropagation = (e: React.SyntheticEvent) => e.stopPropagation();
    return (
      <NodeViewWrapper
        as="span"
        data-nb="nbInlineMath"
        data-nb-editing="true"
        className="nb-inline-math-editing"
        dir="ltr"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          backgroundColor: '#0f172a',
          color: '#f8fafc',
          border: '1.5px solid #38bdf8',
          borderRadius: 4,
          padding: '0 5px',
          margin: '0 2px',
          verticalAlign: 'middle',
          direction: 'ltr',
          unicodeBidi: 'isolate',
          boxShadow: '0 0 0 1px rgba(56, 189, 248, 0.25)',
        }}
      >
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={e => {
            e.stopPropagation();
            setDraft(e.target.value);
          }}
          onKeyDown={e => {
            e.stopPropagation();
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              cancel();
            }
          }}
          onMouseDown={stopPropagation}
          onMouseUp={stopPropagation}
          onClick={stopPropagation}
          onDoubleClick={stopPropagation}
          onBlur={commit}
          style={{
            border: 'none',
            outline: 'none',
            background: 'transparent',
            color: 'inherit',
            caretColor: '#38bdf8',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            fontSize: '0.9em',
            width: `${Math.max(3, draft.length + 1)}ch`,
            padding: 0,
            margin: 0,
          }}
        />
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper
      as="span"
      data-nb="nbInlineMath"
      data-nb-selected={selected ? 'true' : undefined}
      data-text={text}
      dir="ltr"
      onDoubleClick={() => {
        if (editor?.isEditable) {
          setIsEditing(true);
        }
      }}
      style={{
        display: 'inline-block',
        verticalAlign: 'middle',
        margin: '0 1px',
        padding: '0 2px',
        cursor: editor?.isEditable ? 'pointer' : 'default',
        direction: 'ltr',
        unicodeBidi: 'isolate',
        outline: selected ? '2px solid #38bdf8' : 'none',
        outlineOffset: '1px',
        borderRadius: 3,
        userSelect: 'none',
      }}
      title={editor?.isEditable ? 'Double-click to edit formula' : undefined}
    >
      {error ? (
        <span>{text}</span>
      ) : (
        <span dangerouslySetInnerHTML={{ __html: html }} />
      )}
    </NodeViewWrapper>
  );
}
