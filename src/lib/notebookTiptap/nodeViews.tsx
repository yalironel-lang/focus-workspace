/**
 * React NodeViews for TipTap Notebook shadow viewer (read-only).
 * RTL Phase A: block-level dir + logical CSS; math LTR-isolated.
 */

import type { CSSProperties } from 'react';
import type { NodeViewProps } from '@tiptap/react';
import { NodeViewContent, NodeViewWrapper } from '@tiptap/react';
import { KatexPreview } from '../../components/notebook/KatexPreview';
import { MathRichText } from '../../components/notebook/MathRichText';
import { plainMathToLatex } from '../mathInputAssistant';
import { textHasMathDelimiters } from '../notebookMath';
import { tiptapInlineToRichLine } from './inlineBridge';
import type { CalloutTone } from '../notebookDialect';
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

function shouldUseMathRich(plain: string): boolean {
  return textHasMathDelimiters(plain);
}

function dirProps(node: NodeViewProps['node']) {
  return notebookDirWrapperProps(node.attrs.dir as NotebookTextDir, node.textContent ?? '');
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
  if (shouldUseMathRich(plain)) {
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
  if (shouldUseMathRich(plain)) {
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
  if (shouldUseMathRich(plain)) {
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
  if (shouldUseMathRich(plain)) {
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
        {shouldUseMathRich(plain) ? (
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
        {shouldUseMathRich(plain) ? (
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
        {shouldUseMathRich(plain) ? (
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
        {shouldUseMathRich(plain) ? (
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
  const d = dirProps(node);
  return (
    <NodeViewWrapper
      as="div"
      data-nb="nbCallout"
      dir={d.dir}
      data-nb-dir={d['data-nb-dir']}
      data-nb-effective-dir={d['data-nb-effective-dir']}
      style={{
        ...d.style,
        borderInlineStart: `3px solid ${ct.bar}`,
        backgroundColor: ct.bg,
        borderStartStartRadius: 0,
        borderEndStartRadius: 0,
        borderStartEndRadius: 12,
        borderEndEndRadius: 12,
        paddingBlock: 10,
        paddingInline: 14,
        margin: '8px 0',
        fontFamily: NB_FONT_STACK,
      }}
    >
      <div
        style={{
          fontSize: NB_TYPE_SCALE.l5,
          fontWeight: 700,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: ct.label,
          marginBottom: 6,
        }}
      >
        <span style={{ marginInlineEnd: 6 }}>{ct.glyph}</span>
        {calloutLabel(tone)}
      </div>
      <div style={{ ...baseText, color: NB_INK.primary }}>
        {shouldUseMathRich(plain) ? (
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
