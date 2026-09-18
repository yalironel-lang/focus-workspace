/**
 * Notebook Designer host — adaptive docked panel (wide) or bottom sheet (narrow/iPad).
 * Architecture nav: Design | Cover & Identity | Pages | Writing | Decorate
 * Phase 1: Design + Pages (paperStyle) functional; others clearly future.
 */

import { useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { NotebookProductDesignPresetId } from '../../../lib/notebookAppearance';
import type { NotebookDesignerPresetSelection } from '../../../lib/notebookAppearanceVisualTokens';
import type { NotebookPagePaperStyle } from '../../../lib/notebookPages/pagePresentation';
import {
  NOTEBOOK_DESIGNER_PANEL_WIDTH_PX,
  type NotebookDesignerContainerMode,
} from '../../../lib/notebookDesignerLayout';
import { TOUCH_TARGET_MIN_PX } from '../../../lib/ui/touchTarget';
import { NotebookDesignerDesignSection } from './NotebookDesignerDesignSection';
import { NotebookDesignerPagesSection } from './NotebookDesignerPagesSection';

export type NotebookDesignerNavSection =
  | 'design'
  | 'cover'
  | 'pages'
  | 'writing'
  | 'decorate';

type Props = {
  open: boolean;
  mode: NotebookDesignerContainerMode;
  selection: NotebookDesignerPresetSelection;
  onSelectPreset: (id: NotebookProductDesignPresetId) => void;
  paperStyle: NotebookPagePaperStyle;
  onSelectPaperStyle: (style: NotebookPagePaperStyle) => void;
  onClose: () => void;
  /** Anchor rect for sheet positioning (notebook shell). */
  shellRect: DOMRect | null;
};

const SURFACE = 'rgba(12,18,32,0.97)';
const BORDER = 'rgba(148,163,184,0.18)';

const NAV: {
  id: NotebookDesignerNavSection;
  label: string;
  available: boolean;
}[] = [
  { id: 'design', label: 'Design', available: true },
  { id: 'cover', label: 'Cover & Identity', available: false },
  { id: 'pages', label: 'Pages', available: true },
  { id: 'writing', label: 'Writing', available: false },
  { id: 'decorate', label: 'Decorate', available: false },
];

function DesignerChrome({
  selection,
  onSelectPreset,
  paperStyle,
  onSelectPaperStyle,
  onClose,
  scrollable,
}: {
  selection: NotebookDesignerPresetSelection;
  onSelectPreset: (id: NotebookProductDesignPresetId) => void;
  paperStyle: NotebookPagePaperStyle;
  onSelectPaperStyle: (style: NotebookPagePaperStyle) => void;
  onClose: () => void;
  scrollable: boolean;
}) {
  const [section, setSection] = useState<NotebookDesignerNavSection>('design');

  return (
    <>
      <header
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
          padding: '16px 16px 12px',
          borderBottom: `1px solid ${BORDER}`,
          flexShrink: 0,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h2
            data-nb-designer-title="1"
            style={{
              margin: 0,
              fontSize: 17,
              fontWeight: 650,
              letterSpacing: '-0.02em',
              color: 'rgba(248,250,252,0.95)',
            }}
          >
            Customize Notebook
          </h2>
          <p
            style={{
              margin: '6px 0 0',
              fontSize: 12,
              lineHeight: 1.45,
              color: 'rgba(148,163,184,0.78)',
            }}
          >
            Design the notebook. Style the page.
          </p>
        </div>
        <button
          type="button"
          data-nb-designer-close="1"
          aria-label="Close Customize Notebook"
          onMouseDown={e => e.preventDefault()}
          onClick={onClose}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: TOUCH_TARGET_MIN_PX,
            minHeight: TOUCH_TARGET_MIN_PX,
            border: 'none',
            borderRadius: 10,
            background: 'rgba(148,163,184,0.10)',
            color: 'rgba(226,232,240,0.85)',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          <X size={16} aria-hidden />
        </button>
      </header>

      <nav
        data-nb-designer-nav="1"
        aria-label="Customize sections"
        style={{
          display: 'flex',
          gap: 4,
          padding: '10px 12px',
          borderBottom: `1px solid ${BORDER}`,
          overflowX: 'auto',
          flexShrink: 0,
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {NAV.map(item => {
          const active = section === item.id;
          return (
            <button
              key={item.id}
              type="button"
              data-nb-designer-nav-item={item.id}
              data-nb-designer-nav-available={item.available ? '1' : '0'}
              data-nb-designer-nav-active={active ? '1' : '0'}
              aria-pressed={active}
              aria-disabled={!item.available}
              disabled={!item.available}
              title={item.available ? item.label : `${item.label} — coming soon`}
              onMouseDown={e => e.preventDefault()}
              onClick={() => {
                if (item.available) setSection(item.id);
              }}
              style={{
                flexShrink: 0,
                minHeight: TOUCH_TARGET_MIN_PX,
                padding: '0 12px',
                borderRadius: 8,
                border: 'none',
                background: active ? 'rgba(56,189,248,0.14)' : 'transparent',
                color: !item.available
                  ? 'rgba(148,163,184,0.38)'
                  : active
                    ? 'rgba(186,230,253,0.95)'
                    : 'rgba(203,213,225,0.78)',
                fontSize: 12,
                fontWeight: active ? 650 : 550,
                letterSpacing: '0.01em',
                cursor: item.available ? 'pointer' : 'default',
                fontFamily: 'inherit',
                whiteSpace: 'nowrap',
              }}
            >
              {item.label}
              {!item.available ? (
                <span
                  style={{
                    marginLeft: 6,
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    opacity: 0.7,
                  }}
                >
                  Soon
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

      <div
        data-nb-designer-body="1"
        style={{
          padding: 16,
          overflowY: scrollable ? 'auto' : undefined,
          WebkitOverflowScrolling: 'touch',
          flex: 1,
          minHeight: 0,
        }}
      >
        {section === 'design' ? (
          <NotebookDesignerDesignSection selection={selection} onSelectPreset={onSelectPreset} />
        ) : null}
        {section === 'pages' ? (
          <NotebookDesignerPagesSection
            paperStyle={paperStyle}
            onSelectPaperStyle={onSelectPaperStyle}
          />
        ) : null}
      </div>
    </>
  );
}

export function NotebookDesignerHost({
  open,
  mode,
  selection,
  onSelectPreset,
  paperStyle,
  onSelectPaperStyle,
  onClose,
  shellRect,
}: Props) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);

  if (!open) return null;

  if (mode === 'panel') {
    return (
      <aside
        data-nb-designer="1"
        data-nb-designer-mode="panel"
        role="dialog"
        aria-modal="false"
        aria-labelledby={titleId}
        style={{
          width: NOTEBOOK_DESIGNER_PANEL_WIDTH_PX,
          maxWidth: '100%',
          height: '100%',
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
          background: SURFACE,
          borderLeft: `1px solid ${BORDER}`,
          boxShadow: '-12px 0 32px rgba(0,0,0,0.28)',
          borderRadius: 12,
          overflow: 'hidden',
        }}
      >
        <div id={titleId} hidden>
          Customize Notebook
        </div>
        <DesignerChrome
          selection={selection}
          onSelectPreset={onSelectPreset}
          paperStyle={paperStyle}
          onSelectPaperStyle={onSelectPaperStyle}
          onClose={onClose}
          scrollable
        />
      </aside>
    );
  }

  // Bottom sheet — portaled, visualViewport / shell anchored, notebook stays visible above.
  const vv = typeof window !== 'undefined' ? window.visualViewport : null;
  const viewW = vv?.width ?? (typeof window !== 'undefined' ? window.innerWidth : 390);
  const viewH = vv?.height ?? (typeof window !== 'undefined' ? window.innerHeight : 700);
  const width = Math.min(viewW - 16, shellRect?.width ? Math.min(shellRect.width, 420) : 420);
  const left = shellRect
    ? Math.max(8, Math.min(shellRect.left + (shellRect.width - width) / 2, viewW - width - 8))
    : Math.max(8, (viewW - width) / 2);
  const maxHeight = Math.min(viewH * 0.52, 480);
  const bottomGap = 10;
  const top = Math.max(8, viewH - maxHeight - bottomGap);

  const sheet =
    typeof document !== 'undefined'
      ? createPortal(
          <div
            data-nb-designer="1"
            data-nb-designer-mode="sheet"
            role="dialog"
            aria-modal="false"
            aria-label="Customize Notebook"
            style={{
              position: 'fixed',
              top,
              left,
              width,
              maxHeight,
              zIndex: 10050,
              display: 'flex',
              flexDirection: 'column',
              background: SURFACE,
              border: `1px solid ${BORDER}`,
              borderRadius: '16px 16px 12px 12px',
              boxShadow: '0 -8px 40px rgba(0,0,0,0.45)',
              overflow: 'hidden',
            }}
          >
            <DesignerChrome
              selection={selection}
              onSelectPreset={onSelectPreset}
              paperStyle={paperStyle}
              onSelectPaperStyle={onSelectPaperStyle}
              onClose={onClose}
              scrollable
            />
          </div>,
          document.body,
        )
      : null;

  return sheet;
}
