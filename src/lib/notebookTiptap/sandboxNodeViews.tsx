/**
 * Editable sandbox NodeViews — always use NodeViewContent for typing.
 * Inline `$...$` stays PLAIN TEXT while editing (not MathRichText / not a math node).
 * BiDi isolation for math source is handled by NotebookSandboxInlineMathIsolate decorations.
 * Block math / media / divider are atomic (non-editable content).
 */

import { useCallback, useRef, useState, type CSSProperties } from 'react';
import type { Editor } from '@tiptap/core';
import type { NodeViewProps } from '@tiptap/react';
import { NodeViewContent, NodeViewWrapper } from '@tiptap/react';
import { KatexPreview } from '../../components/notebook/KatexPreview';
import { plainMathToLatex } from '../mathInputAssistant';
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
  notebookDirWrapperProps,
  type NotebookTextDir,
} from './direction';

const baseText: CSSProperties = {
  fontFamily: NB_FONT_STACK,
  color: NB_INK.primary,
  lineHeight: 1.92,
  fontSize: NB_TYPE_SCALE.l3,
  margin: 0,
  outline: 'none',
};

function dirProps(node: NodeViewProps['node']) {
  return notebookDirWrapperProps(
    node.attrs.dir as NotebookTextDir,
    node.textContent ?? '',
    node.attrs.align as TextAlignment | undefined,
  );
}

export function SandboxParagraphView({ node }: NodeViewProps) {
  const variant = node.attrs.variant as string | null;
  const d = dirProps(node);
  return (
    <NodeViewWrapper
      as="div"
      data-nb="nbParagraph"
      dir={d.dir}
      data-nb-dir={d['data-nb-dir']}
      data-nb-effective-dir={d['data-nb-effective-dir']}
      style={{
        ...baseText,
        ...d.style,
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

export function SandboxTitleView({ node }: NodeViewProps) {
  const d = dirProps(node);
  return (
    <NodeViewWrapper
      as="h1"
      data-nb="nbTitle"
      dir={d.dir}
      data-nb-dir={d['data-nb-dir']}
      data-nb-effective-dir={d['data-nb-effective-dir']}
      style={{
        ...baseText,
        ...d.style,
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

export function SandboxSectionView({ node }: NodeViewProps) {
  const d = dirProps(node);
  return (
    <NodeViewWrapper
      as="h2"
      data-nb="nbSection"
      dir={d.dir}
      data-nb-dir={d['data-nb-dir']}
      data-nb-effective-dir={d['data-nb-effective-dir']}
      style={{
        ...baseText,
        ...d.style,
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

export function SandboxQuoteView({ node }: NodeViewProps) {
  const d = dirProps(node);
  return (
    <NodeViewWrapper
      as="blockquote"
      data-nb="nbQuote"
      dir={d.dir}
      data-nb-dir={d['data-nb-dir']}
      data-nb-effective-dir={d['data-nb-effective-dir']}
      style={{
        ...baseText,
        ...d.style,
        borderInlineStart: '3px solid rgba(148,163,184,0.45)',
        paddingInlineStart: 14,
        color: NB_INK.secondary,
        fontStyle: 'italic',
      }}
    >
      <NodeViewContent as="div" />
    </NodeViewWrapper>
  );
}

export function SandboxStepView({ node }: NodeViewProps) {
  const d = dirProps(node);
  return (
    <NodeViewWrapper
      as="div"
      data-nb="nbStep"
      dir={d.dir}
      data-nb-dir={d['data-nb-dir']}
      data-nb-effective-dir={d['data-nb-effective-dir']}
      style={{ ...baseText, ...d.style, display: 'flex', gap: 10 }}
    >
      <span contentEditable={false} style={{ color: '#34d399', fontWeight: 700, flexShrink: 0 }}>
        ⇒
      </span>
      <div style={{ flex: 1 }}>
        <NodeViewContent as="div" />
      </div>
    </NodeViewWrapper>
  );
}

export function SandboxBulletView({ node }: NodeViewProps) {
  const depth = Math.min(2, Math.max(0, Number(node.attrs.depth ?? 0)));
  const d = dirProps(node);
  return (
    <NodeViewWrapper
      as="div"
      data-nb="nbBullet"
      dir={d.dir}
      data-nb-dir={d['data-nb-dir']}
      data-nb-effective-dir={d['data-nb-effective-dir']}
      style={{
        ...baseText,
        ...d.style,
        display: 'flex',
        gap: 10,
        paddingInlineStart: depth * 20,
      }}
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
  const d = dirProps(node);
  return (
    <NodeViewWrapper
      as="div"
      data-nb="nbOrdered"
      dir={d.dir}
      data-nb-dir={d['data-nb-dir']}
      data-nb-effective-dir={d['data-nb-effective-dir']}
      style={{ ...baseText, ...d.style, display: 'flex', gap: 10 }}
    >
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
  const d = dirProps(node);
  return (
    <NodeViewWrapper
      as="div"
      data-nb="nbTask"
      dir={d.dir}
      data-nb-dir={d['data-nb-dir']}
      data-nb-effective-dir={d['data-nb-effective-dir']}
      style={{
        ...baseText,
        ...d.style,
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
        <span style={{ marginInlineEnd: 6 }}>{ct.glyph}</span>
        {calloutLabel(tone)}
      </div>
      <div style={{ ...baseText }}>
        <NodeViewContent as="div" />
      </div>
    </NodeViewWrapper>
  );
}

function selectBlockAtom(
  editor: Editor | undefined,
  getPos: NodeViewProps['getPos'],
  e: React.MouseEvent,
) {
  e.preventDefault();
  const pos = typeof getPos === 'function' ? getPos() : undefined;
  if (typeof pos === 'number' && editor) {
    editor.chain().setNodeSelection(pos).focus().run();
  }
}

/** Block math — atomic / read-only in sandbox; always LTR-isolated. */
export function SandboxMathAtomView({ node, selected, editor, getPos }: NodeViewProps) {
  const latex = node.textContent;
  const isolate = mathLtrIsolateProps();

  const handleSelect = useCallback(
    (e: React.MouseEvent) => {
      selectBlockAtom(editor, getPos, e);
    },
    [editor, getPos],
  );

  return (
    <NodeViewWrapper
      as="div"
      data-nb="nbMath"
      data-nb-sandbox-atom="math"
      data-nb-selected={selected ? 'true' : undefined}
      onMouseDown={handleSelect}
      onClick={handleSelect}
      contentEditable={false}
      dir={isolate.dir}
      data-nb-math-isolate={isolate['data-nb-math-isolate']}
      style={{
        margin: '10px 0',
        outline: selected ? '2px solid #38bdf8' : 'none',
        outlineOffset: '2px',
        borderRadius: 8,
        cursor: 'default',
        userSelect: 'none',
        ...isolate.style,
      }}
    >
      <KatexPreview
        latex={plainMathToLatex(latex.trim())}
        displayMode
        hero
        textColor={NB_INK.primary}
        mutedColor={NB_INK.muted}
      />
      <div
        style={{ fontSize: 11, color: NB_INK.ghost, marginTop: 4, fontFamily: 'ui-monospace, monospace' }}
      >
        $$ {latex} <em>(read-only in sandbox)</em>
      </div>
    </NodeViewWrapper>
  );
}

export function SandboxDividerView({ selected, editor, getPos }: NodeViewProps) {
  const handleSelect = useCallback(
    (e: React.MouseEvent) => {
      selectBlockAtom(editor, getPos, e);
    },
    [editor, getPos],
  );

  return (
    <NodeViewWrapper
      as="div"
      data-nb="nbDivider"
      data-nb-sandbox-atom="divider"
      data-nb-selected={selected ? 'true' : undefined}
      onMouseDown={handleSelect}
      onClick={handleSelect}
      contentEditable={false}
      style={{
        margin: '14px 0',
        outline: selected ? '2px solid #38bdf8' : 'none',
        outlineOffset: '4px',
        borderRadius: 4,
        cursor: 'default',
        userSelect: 'none',
      }}
    >
      <hr style={{ border: 'none', borderTop: '1px solid rgba(148,163,184,0.28)', margin: 0 }} />
    </NodeViewWrapper>
  );
}

export function SandboxImageRefView({
  node,
  selected,
  updateAttributes,
  editor,
  getPos,
}: NodeViewProps) {
  const persistedWidth =
    typeof node.attrs.width === 'number' && Number.isFinite(node.attrs.width)
      ? node.attrs.width
      : null;
  const [liveWidth, setLiveWidth] = useState<number | null>(null);
  const displayWidth = liveWidth ?? persistedWidth;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const isDraggingRef = useRef(false);

  const handleSelect = useCallback(
    (e: React.MouseEvent) => {
      if (isDraggingRef.current) return;
      selectBlockAtom(editor, getPos, e);
    },
    [editor, getPos],
  );

  const startResize = useCallback(
    (edge: 'right' | 'left' | 'se' | 'sw') => (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const target = e.currentTarget as HTMLElement;
      try {
        target.setPointerCapture(e.pointerId);
      } catch {}

      isDraggingRef.current = true;
      const startX = e.clientX;
      const el = containerRef.current;
      const initialWidth = el ? el.getBoundingClientRect().width : (displayWidth ?? 400);
      const parentWidth = el?.parentElement ? el.parentElement.getBoundingClientRect().width : 800;
      const minWidth = 100;
      const maxWidth = Math.max(minWidth, Math.min(1200, parentWidth));

      let lastClamped = initialWidth;
      setLiveWidth(initialWidth);

      const onPointerMove = (moveEvt: PointerEvent) => {
        const dx = moveEvt.clientX - startX;
        let targetWidth = initialWidth;
        if (edge === 'right' || edge === 'se') {
          targetWidth = initialWidth + dx;
        } else {
          targetWidth = initialWidth - dx;
        }
        const clamped = Math.max(minWidth, Math.min(maxWidth, Math.round(targetWidth)));
        lastClamped = clamped;
        setLiveWidth(clamped);
      };

      const onPointerUp = (upEvt: PointerEvent) => {
        isDraggingRef.current = false;
        setLiveWidth(null);
        try {
          target.releasePointerCapture(upEvt.pointerId);
        } catch {}
        target.removeEventListener('pointermove', onPointerMove);
        target.removeEventListener('pointerup', onPointerUp);
        target.removeEventListener('pointercancel', onPointerUp);

        const rounded = Math.round(lastClamped);
        if (rounded !== node.attrs.width) {
          updateAttributes({ width: rounded });
        }
      };

      target.addEventListener('pointermove', onPointerMove);
      target.addEventListener('pointerup', onPointerUp);
      target.addEventListener('pointercancel', onPointerUp);
    },
    [displayWidth, node.attrs.width, updateAttributes],
  );

  return (
    <NodeViewWrapper
      as="div"
      data-nb="nbImageRef"
      data-nb-sandbox-atom="image"
      data-nb-selected={selected ? 'true' : undefined}
      data-nb-image-width={displayWidth ?? undefined}
      style={{
        margin: '12px 0',
        display: 'block',
        userSelect: 'none',
      }}
    >
      <div
        ref={containerRef}
        onMouseDown={handleSelect}
        onClick={handleSelect}
        style={{
          position: 'relative',
          display: 'inline-block',
          width: displayWidth ? `${displayWidth}px` : '100%',
          maxWidth: '100%',
          outline: selected ? '2px solid #38bdf8' : 'none',
          outlineOffset: '2px',
          borderRadius: 10,
          transition: isDraggingRef.current ? 'none' : 'outline 0.1s ease',
          cursor: 'default',
          lineHeight: 0,
        }}
      >
        <NotebookImageReadonlyView
          imageKey={String(node.attrs.key ?? '')}
          alt={String(node.attrs.alt ?? '')}
          width={displayWidth}
        />

        {selected && (
          <>
            {/* Right edge handle */}
            <div
              data-nb-resize-handle="right"
              onPointerDown={startResize('right')}
              title="Drag to resize"
              style={{
                position: 'absolute',
                top: '50%',
                right: -5,
                transform: 'translateY(-50%)',
                width: 8,
                height: 36,
                borderRadius: 4,
                background: '#38bdf8',
                cursor: 'ew-resize',
                zIndex: 20,
                boxShadow: '0 1px 4px rgba(0,0,0,0.5)',
              }}
            />

            {/* Left edge handle */}
            <div
              data-nb-resize-handle="left"
              onPointerDown={startResize('left')}
              title="Drag to resize"
              style={{
                position: 'absolute',
                top: '50%',
                left: -5,
                transform: 'translateY(-50%)',
                width: 8,
                height: 36,
                borderRadius: 4,
                background: '#38bdf8',
                cursor: 'ew-resize',
                zIndex: 20,
                boxShadow: '0 1px 4px rgba(0,0,0,0.5)',
              }}
            />

            {/* Bottom-right corner handle */}
            <div
              data-nb-resize-handle="se"
              onPointerDown={startResize('se')}
              title="Drag to resize"
              style={{
                position: 'absolute',
                bottom: -5,
                right: -5,
                width: 12,
                height: 12,
                borderRadius: '50%',
                background: '#38bdf8',
                border: '2px solid white',
                cursor: 'nwse-resize',
                zIndex: 21,
                boxShadow: '0 1px 4px rgba(0,0,0,0.5)',
              }}
            />

            {/* Bottom-left corner handle */}
            <div
              data-nb-resize-handle="sw"
              onPointerDown={startResize('sw')}
              title="Drag to resize"
              style={{
                position: 'absolute',
                bottom: -5,
                left: -5,
                width: 12,
                height: 12,
                borderRadius: '50%',
                background: '#38bdf8',
                border: '2px solid white',
                cursor: 'nesw-resize',
                zIndex: 21,
                boxShadow: '0 1px 4px rgba(0,0,0,0.5)',
              }}
            />

            {/* Contextual Reset Size button if custom width is set */}
            {persistedWidth != null && (
              <button
                type="button"
                data-nb-image-reset="true"
                title="Reset to natural size"
                onClick={e => {
                  e.stopPropagation();
                  e.preventDefault();
                  updateAttributes({ width: null });
                }}
                style={{
                  position: 'absolute',
                  top: 8,
                  right: 8,
                  zIndex: 25,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '3px 8px',
                  fontSize: 11,
                  fontWeight: 500,
                  lineHeight: '14px',
                  color: '#f8fafc',
                  background: 'rgba(15, 23, 42, 0.85)',
                  backdropFilter: 'blur(6px)',
                  border: '1px solid rgba(255, 255, 255, 0.18)',
                  borderRadius: 6,
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
                  userSelect: 'none',
                }}
              >
                Reset size
              </button>
            )}
          </>
        )}
      </div>
    </NodeViewWrapper>
  );
}

export function createSandboxHandwritingView(objectId?: string) {
  return function SandboxHandwritingView({ node, selected, editor, getPos }: NodeViewProps) {
    const handleSelect = useCallback(
      (e: React.MouseEvent) => {
        selectBlockAtom(editor, getPos, e);
      },
      [editor, getPos],
    );

    return (
      <NodeViewWrapper
        as="div"
        data-nb="nbHandwriting"
        data-nb-sandbox-atom="handwriting"
        data-nb-selected={selected ? 'true' : undefined}
        onMouseDown={handleSelect}
        onClick={handleSelect}
        contentEditable={false}
        style={{
          margin: '10px 0',
          outline: selected ? '2px solid #38bdf8' : 'none',
          outlineOffset: '2px',
          borderRadius: 10,
          cursor: 'default',
          userSelect: 'none',
        }}
      >
        <NotebookHandwritingReadonlyView objectId={objectId} blockKey={String(node.attrs.key ?? '')} />
      </NodeViewWrapper>
    );
  };
}
