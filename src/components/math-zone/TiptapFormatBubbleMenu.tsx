import { useCallback } from 'react';
import { BubbleMenu } from '@tiptap/react/menus';
import { useEditorState } from '@tiptap/react';
import type { Editor } from '@tiptap/core';
import { Bold, Italic, Underline, Eraser } from 'lucide-react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import { nbAgentLog } from '../../lib/notebookDebugIngest';
import {
  FONT_SIZE_PRESETS,
  TEXT_COLOR_PRESETS,
  HIGHLIGHT_PRESETS,
  DEFAULT_FONT_SIZE_PX,
  fontSizeSelectValue,
} from '../../lib/mathZoneInlineFormat';

/** True while the TipTap bubble menu is handling pointer/mousedown. */
export const tiptapToolbarBusyRef = { current: false };

const SIZE_SHORT: Record<number, string> = {
  14: 'S',
  16: 'N',
  20: 'L',
  24: 'XL',
};

function preventToolbarEvent(e: React.PointerEvent | React.MouseEvent): void {
  e.preventDefault();
  e.stopPropagation();
}

interface Props {
  editor: Editor;
  tokens: AtmosphereTokens;
}

export function TiptapFormatBubbleMenu({ editor, tokens }: Props) {
  const fmt = useEditorState({
    editor,
    selector: ({ editor: ed }) => ({
      bold: ed.isActive('bold'),
      italic: ed.isActive('italic'),
      underline: ed.isActive('underline'),
      fontSize: ed.getAttributes('textStyle').fontSize as string | undefined,
      color: ed.getAttributes('textStyle').color as string | undefined,
      highlight: ed.getAttributes('highlight').color as string | undefined,
    }),
  });

  const releaseBusy = useCallback(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        tiptapToolbarBusyRef.current = false;
      });
    });
  }, []);

  const logPhase2 = useCallback(
    (control: string, event: string, extra: Record<string, unknown> = {}) => {
      if (!import.meta.env.DEV) return;
      const { from, to, empty } = editor.state.selection;
      // #region agent log
      nbAgentLog(
        'TiptapFormatBubbleMenu',
        event,
        {
          control,
          from,
          to,
          selectionEmpty: empty,
          fontSize: editor.getAttributes('textStyle').fontSize,
          color: editor.getAttributes('textStyle').color,
          highlight: editor.getAttributes('highlight').color,
          ...extra,
        },
        'phase2-fix',
        'ui-buttons',
      );
      // #endregion
    },
    [editor],
  );

  /** Same live-selection path as B/I/U — synchronous mousedown + preventDefault. */
  const runChain = useCallback(
    (control: string, fn: () => boolean) => {
      const { from, to, empty } = editor.state.selection;
      if (empty) {
        logPhase2(control, 'phase2-skipped-empty');
        return;
      }
      tiptapToolbarBusyRef.current = true;
      const ok = fn();
      logPhase2(control, 'phase2-command', { ok, from, to });
      releaseBusy();
    },
    [editor, logPhase2, releaseBusy],
  );

  const onMenuMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    tiptapToolbarBusyRef.current = true;
  };

  const activeSizePx = Number(fontSizeSelectValue(fmt.fontSize));

  return (
    <BubbleMenu
      editor={editor}
      appendTo={() => document.body}
      shouldShow={({ state }) => !state.selection.empty}
    >
      <div
        role="toolbar"
        aria-label="Text formatting"
        data-nb-tiptap-bubble-menu="1"
        className="nb-selection-toolbar"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 2,
          padding: '4px 6px',
          borderRadius: 10,
          border: `1px solid ${tokens.cardBorder}`,
          background: 'rgba(10, 14, 24, 0.96)',
          boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
          backdropFilter: 'blur(12px)',
          maxWidth: 'calc(100vw - 24px)',
        }}
        onMouseDown={onMenuMouseDown}
      >
        <button
          type="button"
          className="nb-toolbar-btn"
          title="Bold (⌘B)"
          tabIndex={-1}
          data-active={fmt.bold ? 'true' : undefined}
          onMouseDown={(e) => {
            e.preventDefault();
            runChain('bold', () => editor.chain().focus().toggleBold().run());
          }}
        >
          <Bold size={14} strokeWidth={2.5} />
        </button>
        <button
          type="button"
          className="nb-toolbar-btn"
          title="Italic (⌘I)"
          tabIndex={-1}
          data-active={fmt.italic ? 'true' : undefined}
          onMouseDown={(e) => {
            e.preventDefault();
            runChain('italic', () => editor.chain().focus().toggleItalic().run());
          }}
        >
          <Italic size={14} strokeWidth={2.5} />
        </button>
        <button
          type="button"
          className="nb-toolbar-btn"
          title="Underline (⌘U)"
          tabIndex={-1}
          data-active={fmt.underline ? 'true' : undefined}
          onMouseDown={(e) => {
            e.preventDefault();
            runChain('underline', () => editor.chain().focus().toggleUnderline().run());
          }}
        >
          <Underline size={14} strokeWidth={2.5} />
        </button>

        <div className="nb-toolbar-divider" />

        {FONT_SIZE_PRESETS.map(p => (
          <button
            key={p.px}
            type="button"
            className="nb-toolbar-btn"
            title={p.label}
            tabIndex={-1}
            data-active={activeSizePx === p.px ? 'true' : undefined}
            style={{ fontSize: 11, fontWeight: 700, minWidth: 24 }}
            onMouseDown={(e) => {
              preventToolbarEvent(e);
              logPhase2('fontSize', 'phase2-mousedown', { px: p.px });
              runChain('fontSize', () => {
                if (p.px === DEFAULT_FONT_SIZE_PX) {
                  return editor.chain().focus().unsetFontSize().removeEmptyTextStyle().run();
                }
                return editor.chain().focus().setFontSize(`${p.px}px`).run();
              });
            }}
          >
            {SIZE_SHORT[p.px] ?? p.px}
          </button>
        ))}

        <div className="nb-toolbar-divider" />

        {TEXT_COLOR_PRESETS.map(c => (
          <button
            key={`fg-${c}`}
            type="button"
            className="nb-color-swatch"
            title={`Text color ${c}`}
            tabIndex={-1}
            style={{
              backgroundColor: c,
              outline: fmt.color === c ? '2px solid rgba(255,255,255,0.85)' : undefined,
            }}
            onMouseDown={(e) => {
              preventToolbarEvent(e);
              logPhase2('textColor', 'phase2-mousedown', { color: c });
              runChain('textColor', () => editor.chain().focus().setColor(c).run());
            }}
          />
        ))}

        <div className="nb-toolbar-divider" />

        {HIGHLIGHT_PRESETS.map(c => (
          <button
            key={`hl-${c}`}
            type="button"
            className="nb-color-swatch"
            title={`Highlight ${c}`}
            tabIndex={-1}
            style={{
              backgroundColor: c,
              outline: fmt.highlight === c ? '2px solid rgba(255,255,255,0.85)' : undefined,
            }}
            onMouseDown={(e) => {
              preventToolbarEvent(e);
              logPhase2('highlight', 'phase2-mousedown', { color: c });
              runChain('highlight', () => editor.chain().focus().setHighlight({ color: c }).run());
            }}
          />
        ))}

        <div className="nb-toolbar-divider" />

        <button
          type="button"
          className="nb-toolbar-btn"
          title="Clear formatting"
          tabIndex={-1}
          onMouseDown={(e) => {
            e.preventDefault();
            logPhase2('clearFormatting', 'phase2-mousedown');
            runChain('clearFormatting', () =>
              editor
                .chain()
                .focus()
                .unsetBold()
                .unsetItalic()
                .unsetUnderline()
                .unsetColor()
                .unsetHighlight()
                .unsetFontSize()
                .removeEmptyTextStyle()
                .run(),
            );
          }}
        >
          <Eraser size={14} strokeWidth={2} />
        </button>
      </div>
    </BubbleMenu>
  );
}
