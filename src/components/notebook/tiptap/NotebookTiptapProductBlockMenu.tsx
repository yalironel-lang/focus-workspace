/**
 * Product Add / Block menu for the TipTap document toolbar.
 * Portaled to document.body (Notebook overflow would clip an absolute menu).
 * Re-anchors on scroll/resize so sticky toolbar deep in a long Notebook stays correct.
 */

import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronDown,
  Image as ImageIcon,
  PenLine,
  Plus,
  Sigma,
} from 'lucide-react';
import {
  CANDIDATE_BLOCK_MENU,
  type CandidateBlockMenuItem,
  type CandidateBlockTarget,
} from '../../../lib/notebookTiptap/candidateBlockCommands';
import { CANDIDATE_INSERT_IMAGE_MENU_VALUE } from '../../../lib/notebookTiptap/candidateImageInsert';
import { CANDIDATE_INSERT_HANDWRITING_MENU_VALUE } from '../../../lib/notebookTiptap/candidateHandwritingInsert';
import type { CalloutTone } from '../../../lib/notebookDialect';
import { calloutToneTokens } from '../../../lib/notebookTiptap/visualTokens';
import {
  NB_PRODUCT_CHROME,
  NB_PRODUCT_TRIGGER_LABEL,
  nbProductTriggerStyle,
} from './notebookProductToolbarChrome';

export type ProductBlockMenuAction =
  | { kind: 'block'; target: CandidateBlockTarget }
  | { kind: 'image' }
  | { kind: 'handwriting' };

type Props = {
  /** Optional legacy prop — chrome tokens own the trigger look now. */
  buttonStyle?: CSSProperties;
  /** Called when the menu is about to open — capture TipTap insert target before blur. */
  onBeforeOpen?: () => void;
  onAction: (action: ProductBlockMenuAction) => void;
};

/** Text / structure blocks (product "Text" group). */
const TEXT_STRUCTURE_IDS = new Set([
  'paragraph',
  'title',
  'section',
  'bullet',
  'ordered',
  'task',
  'quote',
  'step',
]);

/** UI-only academic hints — never persisted into Notebook content. */
const ACADEMIC_HINTS: Record<CalloutTone, string> = {
  definition: 'Formal meaning of a term',
  concept: 'Important idea to remember',
  theorem: 'Formal proposition',
  example: 'Concrete illustration',
  mistake: 'Error to avoid',
  summary: 'Condensed recap',
  review: 'Return to this later',
};

function holdEditorSelection(e: React.MouseEvent | React.PointerEvent) {
  e.preventDefault();
  e.stopPropagation();
}

function splitMenuItems(items: readonly CandidateBlockMenuItem[]) {
  const text: CandidateBlockMenuItem[] = [];
  const insertExtras: CandidateBlockMenuItem[] = [];
  const academic: CandidateBlockMenuItem[] = [];
  for (const item of items) {
    if (item.group === 'academic') academic.push(item);
    else if (TEXT_STRUCTURE_IDS.has(item.id)) text.push(item);
    else insertExtras.push(item); // Math Block today
  }
  return { text, insertExtras, academic };
}

type MenuPos = { top: number; left: number; width: number; maxHeight: number; placement: 'below' | 'above' };

function computeMenuPosition(trigger: HTMLElement): MenuPos {
  const r = trigger.getBoundingClientRect();
  const vv = window.visualViewport;
  const viewW = vv?.width ?? window.innerWidth;
  const viewH = vv?.height ?? window.innerHeight;
  /* Slightly wider than the compact Add trigger — deliberate product menu width. */
  const width = Math.min(300, Math.max(268, viewW - 24));
  let left = r.left;
  left = Math.max(8, Math.min(left, viewW - width - 8));

  const spaceBelow = viewH - r.bottom - 8;
  const spaceAbove = r.top - 8;
  const preferBelow = spaceBelow >= 200 || spaceBelow >= spaceAbove;
  const maxHeight = Math.min(440, Math.max(180, preferBelow ? spaceBelow : spaceAbove));
  const top = preferBelow ? r.bottom + 6 : Math.max(8, r.top - 6 - maxHeight);

  return {
    top,
    left,
    width,
    maxHeight,
    placement: preferBelow ? 'below' : 'above',
  };
}

function SectionHeading({ label, testId }: { label: string; testId: string }) {
  return (
    <div
      data-nb-product-menu-section={testId}
      style={{
        marginTop: testId === 'text' ? 0 : 6,
        padding: '8px 10px 4px',
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: NB_PRODUCT_CHROME.mutedLabel,
        userSelect: 'none',
      }}
    >
      {label}
    </div>
  );
}

function SectionRule() {
  return (
    <div
      aria-hidden
      style={{
        height: 1,
        margin: '6px 8px 2px',
        background: NB_PRODUCT_CHROME.hairline,
      }}
    />
  );
}

function setHoverSurface(el: HTMLElement, on: boolean) {
  el.style.background = on ? NB_PRODUCT_CHROME.hoverFill : 'transparent';
}

function MenuRow({
  children,
  onActivate,
  optionId,
  imageOption,
  handwritingOption,
  academicOption,
  rowStyle,
}: {
  children: ReactNode;
  onActivate: () => void;
  optionId?: string;
  imageOption?: boolean;
  handwritingOption?: boolean;
  academicOption?: string;
  rowStyle?: CSSProperties;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      data-nb-product-block-option={optionId}
      data-nb-product-image-option={imageOption ? '1' : undefined}
      data-nb-product-handwriting-option={handwritingOption ? '1' : undefined}
      data-nb-product-academic-option={academicOption}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        width: '100%',
        textAlign: 'start',
        padding: '7px 10px',
        border: 'none',
        background: 'transparent',
        color: NB_PRODUCT_CHROME.ink,
        fontSize: 13,
        fontWeight: 500,
        cursor: 'pointer',
        borderRadius: 8,
        outline: 'none',
        minHeight: 34,
        fontFamily: 'inherit',
        ...rowStyle,
      }}
      onMouseDown={holdEditorSelection}
      onClick={e => {
        e.stopPropagation();
        onActivate();
      }}
      onMouseEnter={e => setHoverSurface(e.currentTarget, true)}
      onMouseLeave={e => setHoverSurface(e.currentTarget, false)}
      onFocus={e => {
        e.currentTarget.style.boxShadow = `inset 0 0 0 1px ${NB_PRODUCT_CHROME.focusRing}`;
        setHoverSurface(e.currentTarget, true);
      }}
      onBlur={e => {
        e.currentTarget.style.boxShadow = 'none';
        setHoverSurface(e.currentTarget, false);
      }}
    >
      {children}
    </button>
  );
}

export function NotebookTiptapProductBlockMenu({ onBeforeOpen, onAction }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<MenuPos | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();
  const { text, insertExtras, academic } = splitMenuItems(CANDIDATE_BLOCK_MENU);

  const updatePosition = () => {
    const el = triggerRef.current;
    if (!el) return;
    setPos(computeMenuPosition(el));
  };

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const t = event.target as Node | null;
      if (menuRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      setOpen(false);
      setPos(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        setPos(null);
      }
    };
    const onReposition = () => updatePosition();
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    window.visualViewport?.addEventListener('resize', onReposition);
    window.visualViewport?.addEventListener('scroll', onReposition);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
      window.visualViewport?.removeEventListener('resize', onReposition);
      window.visualViewport?.removeEventListener('scroll', onReposition);
    };
  }, [open]);

  const closeAndRun = (action: ProductBlockMenuAction) => {
    setOpen(false);
    setPos(null);
    onAction(action);
  };

  const renderTextItem = (item: CandidateBlockMenuItem) => (
    <MenuRow
      key={item.id}
      optionId={item.id}
      onActivate={() => closeAndRun({ kind: 'block', target: item.id })}
    >
      <span data-nb-product-menu-item-label="1">{item.label}</span>
    </MenuRow>
  );

  const renderAcademicItem = (item: CandidateBlockMenuItem) => {
    const tone = item.id.startsWith('callout:')
      ? (item.id.slice('callout:'.length) as CalloutTone)
      : null;
    const tokens = tone ? calloutToneTokens(tone) : null;
    const hint = tone ? ACADEMIC_HINTS[tone] : undefined;
    return (
      <MenuRow
        key={item.id}
        optionId={item.id}
        academicOption={item.id}
        rowStyle={{ alignItems: 'flex-start', paddingTop: 8, paddingBottom: 8, minHeight: 40 }}
        onActivate={() => closeAndRun({ kind: 'block', target: item.id })}
      >
        <span
          aria-hidden
          data-nb-product-academic-marker={tone ?? undefined}
          style={{
            width: 3,
            alignSelf: 'stretch',
            minHeight: 28,
            borderRadius: 99,
            background: tokens?.bar ?? 'rgba(148,163,184,0.45)',
            flexShrink: 0,
            marginTop: 2,
            opacity: 0.9,
          }}
        />
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <span data-nb-product-menu-item-label="1" style={{ lineHeight: 1.25 }}>
            {item.label}
          </span>
          {hint ? (
            <span
              data-nb-product-menu-item-hint="1"
              style={{
                fontSize: 11,
                fontWeight: 400,
                lineHeight: 1.3,
                color: NB_PRODUCT_CHROME.mutedInk,
              }}
            >
              {hint}
            </span>
          ) : null}
        </span>
      </MenuRow>
    );
  };

  const insertIconStyle: CSSProperties = {
    width: 15,
    height: 15,
    flexShrink: 0,
    color: NB_PRODUCT_CHROME.mutedInk,
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        data-nb-product-block="1"
        data-nb-product-add="1"
        aria-label="Add or change block"
        title="Add or change block"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        style={nbProductTriggerStyle(open)}
        onMouseDown={holdEditorSelection}
        onClick={e => {
          e.stopPropagation();
          if (!open) {
            onBeforeOpen?.();
            updatePosition();
            setOpen(true);
          } else {
            setOpen(false);
            setPos(null);
          }
        }}
        onMouseEnter={e => {
          if (!open) e.currentTarget.style.background = NB_PRODUCT_CHROME.hoverFill;
        }}
        onMouseLeave={e => {
          if (!open) e.currentTarget.style.background = 'transparent';
        }}
      >
        <Plus size={14} strokeWidth={2.25} aria-hidden />
        <span data-nb-product-add-label="1">{NB_PRODUCT_TRIGGER_LABEL}</span>
        <ChevronDown size={13} strokeWidth={2.25} aria-hidden style={{ opacity: 0.72 }} />
      </button>
      {open && pos && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={menuRef}
              id={menuId}
              role="menu"
              aria-label="Add or change block"
              data-nb-product-block-menu="1"
              data-nb-product-menu-placement={pos.placement}
              style={{
                position: 'fixed',
                top: pos.top,
                left: pos.left,
                width: pos.width,
                maxHeight: pos.maxHeight,
                overflowY: 'auto',
                zIndex: 10050,
                padding: '6px 6px 8px',
                borderRadius: 12,
                border: `1px solid ${NB_PRODUCT_CHROME.menuBorder}`,
                background: NB_PRODUCT_CHROME.menuSurface,
                boxShadow: NB_PRODUCT_CHROME.menuShadow,
                color: NB_PRODUCT_CHROME.ink,
                fontFamily: 'inherit',
                scrollbarWidth: 'thin',
                scrollbarColor: 'rgba(148,163,184,0.28) transparent',
              }}
              onMouseDown={e => e.stopPropagation()}
            >
              <SectionHeading label="Text" testId="text" />
              {text.map(renderTextItem)}

              <SectionRule />
              <SectionHeading label="Insert" testId="insert" />
              <MenuRow
                optionId={CANDIDATE_INSERT_IMAGE_MENU_VALUE}
                imageOption
                onActivate={() => closeAndRun({ kind: 'image' })}
              >
                <ImageIcon style={insertIconStyle} strokeWidth={2} aria-hidden />
                <span data-nb-product-menu-item-label="1">Image</span>
              </MenuRow>
              <MenuRow
                optionId={CANDIDATE_INSERT_HANDWRITING_MENU_VALUE}
                handwritingOption
                onActivate={() => closeAndRun({ kind: 'handwriting' })}
              >
                <PenLine style={insertIconStyle} strokeWidth={2} aria-hidden />
                <span data-nb-product-menu-item-label="1">Handwriting</span>
              </MenuRow>
              {insertExtras.map(item => (
                <MenuRow
                  key={item.id}
                  optionId={item.id}
                  onActivate={() => closeAndRun({ kind: 'block', target: item.id })}
                >
                  <Sigma style={insertIconStyle} strokeWidth={2} aria-hidden />
                  <span data-nb-product-menu-item-label="1">{item.label}</span>
                </MenuRow>
              ))}

              {academic.length > 0 ? (
                <>
                  <SectionRule />
                  <SectionHeading label="Academic" testId="academic" />
                  {academic.map(renderAcademicItem)}
                </>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
