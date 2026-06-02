import { useEffect, useRef, useState } from 'react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import {
  studyLayoutLabel,
  type StudyLayoutMode,
} from '../../lib/mathDesk/studyLayout';
import {
  LayoutGrid,
  Maximize2,
  PanelLeft,
  PanelRight,
  PanelRightClose,
} from 'lucide-react';

interface Props {
  tokens: AtmosphereTokens;
  layout: StudyLayoutMode;
  onLayoutChange: (mode: StudyLayoutMode) => void;
  compact?: boolean;
}

const OPTIONS: Array<{ mode: StudyLayoutMode; icon: typeof LayoutGrid; hint?: string }> = [
  { mode: 'canvas', icon: LayoutGrid, hint: 'Drag and resize on canvas' },
  { mode: 'dock-right-half', icon: PanelRight, hint: 'PDF left, desk right' },
  { mode: 'dock-right-third', icon: PanelRightClose, hint: 'More room for source' },
  { mode: 'dock-left-half', icon: PanelLeft, hint: 'Desk left, source right' },
  { mode: 'fullscreen', icon: Maximize2, hint: 'Focus on math only' },
];

export function MathDeskStudyLayoutMenu({ tokens, layout, onLayoutChange, compact }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div ref={rootRef} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        title="Study layout"
        className="desk-study-layout-trigger"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: compact ? 0 : 5,
          padding: compact ? '4px 6px' : '4px 8px',
          borderRadius: 6,
          border: `1px solid ${tokens.cardBorder}`,
          background: open ? tokens.wellBg : 'transparent',
          color: tokens.textMuted,
          fontSize: 10,
          fontWeight: 600,
          cursor: 'pointer',
          letterSpacing: '0.02em',
        }}
      >
        <PanelRight size={13} strokeWidth={2} aria-hidden />
        {!compact ? <span>Layout</span> : null}
      </button>
      {open ? (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 10050 }}
            aria-hidden
            onClick={() => setOpen(false)}
          />
          <div
            role="menu"
            className="desk-study-layout-menu"
            style={{
              position: 'absolute',
              right: 0,
              top: 'calc(100% + 4px)',
              zIndex: 10051,
              minWidth: 200,
              padding: 4,
              borderRadius: 8,
              background: tokens.cardBg,
              border: `1px solid ${tokens.cardBorder}`,
              boxShadow: '0 12px 32px rgba(0,0,0,0.35)',
            }}
          >
            {OPTIONS.map(({ mode, icon: Icon, hint }) => {
              const active = layout === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  onClick={() => {
                    onLayoutChange(mode);
                    setOpen(false);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 8,
                    width: '100%',
                    textAlign: 'left',
                    padding: '7px 10px',
                    border: 'none',
                    borderRadius: 6,
                    background: active ? `${tokens.accent}18` : 'transparent',
                    color: active ? tokens.textPrimary : tokens.textMuted,
                    cursor: 'pointer',
                  }}
                >
                  <Icon size={14} strokeWidth={2} style={{ marginTop: 1, flexShrink: 0 }} aria-hidden />
                  <span>
                    <span style={{ display: 'block', fontSize: 11, fontWeight: 600 }}>
                      {studyLayoutLabel(mode)}
                    </span>
                    {hint ? (
                      <span style={{ display: 'block', fontSize: 10, opacity: 0.75, marginTop: 2 }}>
                        {hint}
                      </span>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      ) : null}
    </div>
  );
}
