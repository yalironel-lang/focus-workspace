/**
 * CE-parity dialect preview for Milestone 1 side-by-side comparison.
 * Uses the same pure dialect parser + Katex/MathRichText/callout tokens as
 * ProjectNotebookBlock preview — without mounting the live CE editor.
 */

import type { CSSProperties } from 'react';
import type { InlineMark } from '../../../lib/notebookInlineMarks';
import {
  parseNotebookBody,
  type CalloutTone,
  type NotebookDialectBlock,
} from '../../../lib/notebookDialect';
import { KatexPreview } from '../KatexPreview';
import { MathRichText } from '../MathRichText';
import { plainMathToLatex } from '../../../lib/mathInputAssistant';
import { textHasMathDelimiters } from '../../../lib/notebookMath';
import {
  BULLET_GLYPHS,
  NB_FONT_STACK,
  NB_INK,
  NB_TYPE_SCALE,
  calloutLabel,
  calloutToneTokens,
} from '../../../lib/notebookTiptap/visualTokens';
import {
  NotebookHandwritingReadonlyView,
  NotebookImageReadonlyView,
} from '../../../lib/notebookTiptap/readonlyMedia';

function LineBody({
  text,
  marks,
  style,
}: {
  text: string;
  marks?: InlineMark[];
  style?: CSSProperties;
}) {
  if (textHasMathDelimiters(text)) {
    return (
      <MathRichText
        text={text}
        marks={marks}
        textColor={NB_INK.primary}
        mutedColor={NB_INK.muted}
        style={style}
      />
    );
  }
  if (!marks?.length) {
    return <span style={style}>{text || '\u00a0'}</span>;
  }
  return (
    <MathRichText
      text={text}
      marks={marks}
      textColor={NB_INK.primary}
      mutedColor={NB_INK.muted}
      style={style}
    />
  );
}

function renderBlock(block: NotebookDialectBlock, objectId?: string) {
  const base: CSSProperties = {
    fontFamily: NB_FONT_STACK,
    fontSize: NB_TYPE_SCALE.l3,
    lineHeight: 1.92,
    color: NB_INK.primary,
    margin: '4px 0',
    textAlign: ('align' in block ? block.align : undefined) ?? 'start',
  };

  switch (block.kind) {
    case 'title':
      return (
        <div style={{ ...base, fontSize: NB_TYPE_SCALE.l1, fontWeight: 700, letterSpacing: '-0.03em', color: NB_INK.headline }}>
          <LineBody text={block.text} marks={block.marks} />
        </div>
      );
    case 'section':
      return (
        <div style={{ ...base, fontSize: NB_TYPE_SCALE.l2, fontWeight: 600, letterSpacing: '-0.02em', color: NB_INK.section }}>
          <LineBody text={block.text} marks={block.marks} />
        </div>
      );
    case 'paragraph': {
      const muted = block.variant === 'muted' || block.variant === 'fine';
      return (
        <div
          style={{
            ...base,
            fontSize: block.variant === 'fine' ? NB_TYPE_SCALE.l5 : block.variant === 'muted' ? NB_TYPE_SCALE.l4 : NB_TYPE_SCALE.l3,
            color: muted ? NB_INK.muted : NB_INK.primary,
            minHeight: block.text ? undefined : NB_TYPE_SCALE.l3 * 1.92,
          }}
        >
          <LineBody text={block.text} marks={block.marks} />
        </div>
      );
    }
    case 'bullet': {
      const depth = Math.min(2, Math.max(0, block.depth));
      return (
        <div style={{ ...base, display: 'flex', gap: 10, paddingLeft: depth * 20 }}>
          <span style={{ color: NB_INK.muted }}>{BULLET_GLYPHS[depth]}</span>
          <LineBody text={block.text} marks={block.marks} />
        </div>
      );
    }
    case 'ordered':
      return (
        <div style={{ ...base, display: 'flex', gap: 10 }}>
          <span style={{ color: NB_INK.muted, minWidth: 22 }}>{block.number}.</span>
          <LineBody text={block.text} marks={block.marks} />
        </div>
      );
    case 'task':
      return (
        <div
          style={{
            ...base,
            display: 'flex',
            gap: 10,
            textDecoration: block.checked ? 'line-through' : undefined,
            color: block.checked ? NB_INK.muted : NB_INK.primary,
          }}
        >
          <span>{block.checked ? '☑' : '☐'}</span>
          <LineBody text={block.text} marks={block.marks} />
        </div>
      );
    case 'quote':
      return (
        <div
          style={{
            ...base,
            borderLeft: '3px solid rgba(148,163,184,0.45)',
            paddingLeft: 14,
            color: NB_INK.secondary,
            fontStyle: 'italic',
          }}
        >
          <LineBody text={block.text} marks={block.marks} />
        </div>
      );
    case 'step':
      return (
        <div style={{ ...base, display: 'flex', gap: 10 }}>
          <span style={{ color: '#34d399', fontWeight: 700 }}>⇒</span>
          <LineBody text={block.text} marks={block.marks} />
        </div>
      );
    case 'callout': {
      const tone = block.tone as CalloutTone;
      const ct = calloutToneTokens(tone);
      return (
        <div
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
          <LineBody text={block.text} marks={block.marks} />
        </div>
      );
    }
    case 'math':
      return (
        <div style={{ margin: '10px 0' }}>
          <KatexPreview
            latex={plainMathToLatex(block.text.trim())}
            displayMode
            hero
            textColor={NB_INK.primary}
            mutedColor={NB_INK.muted}
          />
        </div>
      );
    case 'divider':
      return <hr style={{ border: 'none', borderTop: '1px solid rgba(148,163,184,0.28)', margin: '14px 0' }} />;
    case 'image-ref':
      return (
        <div style={{ margin: '10px 0' }}>
          <NotebookImageReadonlyView imageKey={block.key} alt={block.alt} width={block.width} />
        </div>
      );
    case 'handwriting':
      return (
        <div style={{ margin: '10px 0' }}>
          <NotebookHandwritingReadonlyView objectId={objectId} blockKey={block.key} />
        </div>
      );
  }
}

export function NotebookDialectPreview({
  documentBody,
  codecVersion,
  objectId,
  className,
}: {
  documentBody: string;
  codecVersion?: number;
  objectId?: string;
  className?: string;
}) {
  const blocks = parseNotebookBody(documentBody, codecVersion);
  return (
    <div
      className={className}
      data-nb-dialect-preview="1"
      style={{ fontFamily: NB_FONT_STACK, color: NB_INK.primary, padding: '8px 4px' }}
    >
      {blocks.map((b, i) => (
        <div key={`${b.kind}-${i}`}>{renderBlock(b, objectId)}</div>
      ))}
    </div>
  );
}
