/**
 * Editable sandbox NodeViews — always use NodeViewContent for typing.
 * Math source stays visible as text (no MathRichText takeover).
 * Media / divider / block-math are atomic (non-editable content).
 */

import type { CSSProperties } from 'react';
import type { NodeViewProps } from '@tiptap/react';
import { NodeViewContent, NodeViewWrapper } from '@tiptap/react';
import { KatexPreview } from '../../components/notebook/KatexPreview';
import { plainMathToLatex } from '../mathInputAssistant';
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

const baseText: CSSProperties = {
  fontFamily: NB_FONT_STACK,
  color: NB_INK.primary,
  lineHeight: 1.92,
  fontSize: NB_TYPE_SCALE.l3,
  margin: 0,
  outline: 'none',
};

export function SandboxParagraphView({ node }: NodeViewProps) {
  const variant = node.attrs.variant as string | null;
  return (
    <NodeViewWrapper
      as="div"
      data-nb="nbParagraph"
      style={{
        ...baseText,
        fontSize:
          variant === 'fine' ? NB_TYPE_SCALE.l5 : variant === 'muted' ? NB_TYPE_SCALE.l4 : NB_TYPE_SCALE.l3,
        color: variant === 'fine' || variant === 'muted' ? NB_INK.muted : NB_INK.primary,
        minHeight: NB_TYPE_SCALE.l3 * 1.5,
      }}
    >
      <NodeViewContent as="div" />
    </NodeViewWrapper>
  );
}

export function SandboxTitleView() {
  return (
    <NodeViewWrapper
      as="h1"
      data-nb="nbTitle"
      style={{
        ...baseText,
        fontSize: NB_TYPE_SCALE.l1,
        fontWeight: 700,
        letterSpacing: '-0.03em',
        color: NB_INK.headline,
        lineHeight: 1.25,
      }}
    >
      <NodeViewContent as="div" />
    </NodeViewWrapper>
  );
}

export function SandboxSectionView() {
  return (
    <NodeViewWrapper
      as="h2"
      data-nb="nbSection"
      style={{
        ...baseText,
        fontSize: NB_TYPE_SCALE.l2,
        fontWeight: 600,
        letterSpacing: '-0.02em',
        color: NB_INK.section,
        lineHeight: 1.35,
      }}
    >
      <NodeViewContent as="div" />
    </NodeViewWrapper>
  );
}

export function SandboxQuoteView() {
  return (
    <NodeViewWrapper
      as="blockquote"
      data-nb="nbQuote"
      style={{
        ...baseText,
        borderLeft: '3px solid rgba(148,163,184,0.45)',
        paddingLeft: 14,
        color: NB_INK.secondary,
        fontStyle: 'italic',
      }}
    >
      <NodeViewContent as="div" />
    </NodeViewWrapper>
  );
}

export function SandboxStepView() {
  return (
    <NodeViewWrapper as="div" data-nb="nbStep" style={{ ...baseText, display: 'flex', gap: 10 }}>
      <span style={{ color: '#34d399', fontWeight: 700, flexShrink: 0 }}>⇒</span>
      <div style={{ flex: 1 }}>
        <NodeViewContent as="div" />
      </div>
    </NodeViewWrapper>
  );
}

export function SandboxBulletView({ node }: NodeViewProps) {
  const depth = Math.min(2, Math.max(0, Number(node.attrs.depth ?? 0)));
  return (
    <NodeViewWrapper
      as="div"
      data-nb="nbBullet"
      style={{ ...baseText, display: 'flex', gap: 10, paddingLeft: depth * 20 }}
    >
      <span contentEditable={false} style={{ color: NB_INK.muted, width: 14, flexShrink: 0 }}>
        {BULLET_GLYPHS[depth]}
      </span>
      <div style={{ flex: 1 }}>
        <NodeViewContent as="div" />
      </div>
    </NodeViewWrapper>
  );
}

export function SandboxOrderedView({ node }: NodeViewProps) {
  const number = Number(node.attrs.number ?? 1);
  return (
    <NodeViewWrapper as="div" data-nb="nbOrdered" style={{ ...baseText, display: 'flex', gap: 10 }}>
      <span contentEditable={false} style={{ color: NB_INK.muted, minWidth: 22, flexShrink: 0 }}>
        {number}.
      </span>
      <div style={{ flex: 1 }}>
        <NodeViewContent as="div" />
      </div>
    </NodeViewWrapper>
  );
}

export function SandboxTaskView({ node }: NodeViewProps) {
  const checked = Boolean(node.attrs.checked);
  return (
    <NodeViewWrapper
      as="div"
      data-nb="nbTask"
      style={{
        ...baseText,
        display: 'flex',
        gap: 10,
        textDecoration: checked ? 'line-through' : undefined,
        color: checked ? NB_INK.muted : NB_INK.primary,
      }}
    >
      <span contentEditable={false} style={{ flexShrink: 0 }}>
        {checked ? '☑' : '☐'}
      </span>
      <div style={{ flex: 1 }}>
        <NodeViewContent as="div" />
      </div>
    </NodeViewWrapper>
  );
}

export function SandboxCalloutView({ node }: NodeViewProps) {
  const tone = (node.attrs.tone ?? 'concept') as CalloutTone;
  const ct = calloutToneTokens(tone);
  return (
    <NodeViewWrapper
      as="div"
      data-nb="nbCallout"
      style={{
        borderLeft: `3px solid ${ct.bar}`,
        backgroundColor: ct.bg,
        borderRadius: '0 12px 12px 0',
        padding: '10px 14px',
        margin: '8px 0',
        fontFamily: NB_FONT_STACK,
      }}
    >
      <div
        contentEditable={false}
        style={{
          fontSize: NB_TYPE_SCALE.l5,
          fontWeight: 700,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: ct.label,
          marginBottom: 6,
        }}
      >
        <span style={{ marginRight: 6 }}>{ct.glyph}</span>
        {calloutLabel(tone)}
      </div>
      <div style={{ ...baseText }}>
        <NodeViewContent as="div" />
      </div>
    </NodeViewWrapper>
  );
}

/** Block math — atomic / read-only in sandbox (safety over edit parity). */
export function SandboxMathAtomView({ node }: NodeViewProps) {
  const latex = node.textContent;
  return (
    <NodeViewWrapper as="div" data-nb="nbMath" data-nb-sandbox-atom="math" style={{ margin: '10px 0' }}>
      <KatexPreview
        latex={plainMathToLatex(latex.trim())}
        displayMode
        hero
        textColor={NB_INK.primary}
        mutedColor={NB_INK.muted}
      />
      <div
        contentEditable={false}
        style={{ fontSize: 11, color: NB_INK.ghost, marginTop: 4, fontFamily: 'ui-monospace, monospace' }}
      >
        $$ {latex} <em>(read-only in sandbox)</em>
      </div>
    </NodeViewWrapper>
  );
}

export function SandboxDividerView() {
  return (
    <NodeViewWrapper as="div" data-nb="nbDivider" data-nb-sandbox-atom="divider" style={{ margin: '14px 0' }}>
      <hr style={{ border: 'none', borderTop: '1px solid rgba(148,163,184,0.28)', margin: 0 }} />
    </NodeViewWrapper>
  );
}

export function SandboxImageRefView({ node }: NodeViewProps) {
  return (
    <NodeViewWrapper as="div" data-nb="nbImageRef" data-nb-sandbox-atom="image" style={{ margin: '10px 0' }}>
      <NotebookImageReadonlyView imageKey={String(node.attrs.key ?? '')} alt={String(node.attrs.alt ?? '')} />
    </NodeViewWrapper>
  );
}

export function createSandboxHandwritingView(objectId?: string) {
  return function SandboxHandwritingView({ node }: NodeViewProps) {
    return (
      <NodeViewWrapper
        as="div"
        data-nb="nbHandwriting"
        data-nb-sandbox-atom="handwriting"
        style={{ margin: '10px 0' }}
      >
        <NotebookHandwritingReadonlyView objectId={objectId} blockKey={String(node.attrs.key ?? '')} />
      </NodeViewWrapper>
    );
  };
}
