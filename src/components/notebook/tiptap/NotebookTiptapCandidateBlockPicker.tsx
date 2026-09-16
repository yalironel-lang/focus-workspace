import { useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { CANDIDATE_BLOCK_MENU, type CandidateBlockTarget } from '../../../lib/notebookTiptap/candidateBlockCommands';
import { placeCandidateBlockMenu } from '../../../lib/notebookTiptap/candidateBlockMenuPosition';
import { NB_FORMAT_TOOLBAR_Z } from '../../../lib/notebookToolbarLayers';
import './candidateBlockPicker.css';

const academicOrder = ['callout:definition', 'callout:concept', 'callout:theorem', 'callout:example', 'callout:mistake', 'callout:summary', 'callout:review'];
const pickerItems = [...CANDIDATE_BLOCK_MENU].sort((a, b) => {
  if (a.group !== 'academic' || b.group !== 'academic') return 0;
  const rank = (id: string) => { const index = academicOrder.indexOf(id); return index < 0 ? academicOrder.length : index; };
  return rank(a.id) - rank(b.id);
});

function holdSelection(event: React.MouseEvent | React.PointerEvent) {
  event.preventDefault();
  event.stopPropagation();
}

/** UI only. Conversion and selection restoration stay in the existing toolbar. */
export function NotebookTiptapCandidateBlockPicker({
  open,
  label,
  onToggle,
  onClose,
  onSelect,
}: {
  open: boolean;
  /** Current block product label (for checkmarks / context). */
  label: string;
  onToggle: () => void;
  onClose: () => void;
  onSelect: (target: CandidateBlockTarget) => void;
}) {
  const id = useId();
  const keyboardOpen = useRef(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<ReturnType<typeof placeCandidateBlockMenu> | null>(null);

  // Measure the entire toolbar so the picker can sit above it, away from selected text.
  const updatePosition = () => {
    const anchor = trigger.current?.closest('[data-nb-candidate-selection-toolbar]') ?? trigger.current;
    if (!anchor) return;
    const viewport = window.visualViewport;
    const next = placeCandidateBlockMenu(anchor.getBoundingClientRect(), {
      left: viewport?.offsetLeft ?? 0, top: viewport?.offsetTop ?? 0,
      width: viewport?.width ?? window.innerWidth, height: viewport?.height ?? window.innerHeight,
    });
    setPosition(previous => previous && Object.keys(next).every(key => previous[key as keyof typeof next] === next[key as keyof typeof next]) ? previous : next);
  };

  // Parent selection geometry may change without the toolbar changing size.
  useLayoutEffect(() => {
    if (open) updatePosition();
    if (open && menu.current && keyboardOpen.current) {
      menu.current.querySelector<HTMLButtonElement>('[aria-pressed="true"], [data-nb-candidate-block]')?.focus();
      keyboardOpen.current = false;
    }
  });
  useLayoutEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) onClose();
    };
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    window.visualViewport?.addEventListener('resize', updatePosition);
    window.visualViewport?.addEventListener('scroll', updatePosition);
    document.addEventListener('pointerdown', closeOutside, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      window.visualViewport?.removeEventListener('resize', updatePosition);
      window.visualViewport?.removeEventListener('scroll', updatePosition);
      document.removeEventListener('pointerdown', closeOutside, true);
    };
  }, [open, onClose]);

  return <>
    <button ref={trigger} type="button" className="nb-toolbar-btn nb-candidate-block-trigger"
      title={`Turn this block into… (currently ${label})`}
      aria-label={`Turn into — currently ${label}`}
      aria-expanded={open}
      aria-haspopup="dialog" aria-controls={open ? id : undefined}
      data-nb-candidate-fmt="blockMenu"
      data-nb-candidate-block-convert="1"
      onPointerDownCapture={holdSelection} onMouseDownCapture={holdSelection}
      onClick={event => { event.stopPropagation(); keyboardOpen.current = event.detail === 0; onToggle(); }}
      onKeyDown={event => {
        if (event.key === 'ArrowDown') { event.preventDefault(); keyboardOpen.current = true; if (!open) onToggle(); else menu.current?.querySelector<HTMLButtonElement>('[data-nb-candidate-block]')?.focus(); }
        if (event.key === 'Escape') { event.preventDefault(); onClose(); }
      }}>
      <span data-nb-candidate-block-convert-label="1">Turn into</span>
      <span data-nb-candidate-block-current="1" className="nb-candidate-block-current">{label}</span>
      <ChevronDown size={12} aria-hidden />
    </button>
    {open && position ? createPortal(
      <div ref={menu} id={id} role="dialog" aria-label="Turn this block into"
        dir="ltr"
        data-nb-candidate-block-menu="1" data-placement={position.side}
        className="nb-candidate-block-picker"
        style={{ position: 'fixed', left: position.left, top: position.top, width: position.width,
          height: position.height, zIndex: NB_FORMAT_TOOLBAR_Z.toolbar + 2 }}
        onMouseDown={event => event.stopPropagation()}
        onKeyDown={event => {
          event.stopPropagation();
          if (event.key === 'Escape') { event.preventDefault(); onClose(); trigger.current?.focus(); }
          const buttons = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('[data-nb-candidate-block]') ?? []);
          const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            buttons[(index + (event.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length]?.focus();
          }
        }}>
        {(['basic', 'academic'] as const).map(group => <section key={group} aria-label={group === 'basic' ? 'Basic blocks' : 'Academic blocks'}>
          <div className="nb-candidate-block-heading">{group === 'basic' ? 'Basic' : 'Academic'}</div>
          <div className="nb-candidate-block-options">
            {pickerItems.filter(item => item.group === group).map(item => <button
              key={item.id} type="button" data-nb-candidate-block={item.id}
              aria-pressed={item.label === label} className="nb-candidate-block-option"
              onPointerDownCapture={holdSelection} onMouseDownCapture={holdSelection}
              onClick={event => { event.stopPropagation(); onSelect(item.id); }}>
              <span>{item.label}</span><Check size={14} aria-hidden style={{ visibility: item.label === label ? 'visible' : 'hidden' }} />
            </button>)}
          </div>
        </section>)}
      </div>, document.body,
    ) : null}
  </>;
}
