/**
 * Minimal “Templates / Arrange” entry for section Free Space.
 */

import { useState, useRef, useEffect } from 'react';
import { Grid3x3, ChevronDown } from 'lucide-react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import {
  FREE_SPACE_TEMPLATES,
  FREE_SPACE_TEMPLATE_CONFIRM_MIN,
  type FreeSpaceTemplateId,
} from '../../lib/sectionFreeSpaceLayoutTemplates';
import { WorkspaceMicroScene, type WorkspaceMicroSceneVariant } from '../workspace-guidance/WorkspaceMicroScene';

const TEMPLATE_SCENE: Record<FreeSpaceTemplateId, WorkspaceMicroSceneVariant> = {
  'study-board': 'study-flow',
  'exam-prep': 'review-column',
  'research-map': 'thinking-map',
  'course-workspace': 'course-desk',
  'weekly-planning': 'course-desk',
  'brainstorm-canvas': 'idea-flow',
};

interface Props {
  tokens: AtmosphereTokens | null | undefined;
  /** Viewport-fixed offset (legacy). Omit when `inShell`. */
  topOffset?: number;
  /** Position inside the Free Space shell (below tabs). */
  inShell?: boolean;
  objectCount: number;
  onApplyTemplate: (id: FreeSpaceTemplateId) => void;
  /** Notebook deep edit: control recedes until hovered. */
  chromeQuiet?: boolean;
}

export function FreeSpaceArrangeControl({
  tokens,
  topOffset = 0,
  inShell = false,
  objectCount,
  onApplyTemplate,
  chromeQuiet = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    if (typeof document === 'undefined') return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  if (!tokens || typeof tokens !== 'object') {
    return null;
  }

  const pick = (id: FreeSpaceTemplateId) => {
    setOpen(false);
    if (objectCount === 0) return;
    if (objectCount >= FREE_SPACE_TEMPLATE_CONFIRM_MIN && typeof window !== 'undefined') {
      const meta = FREE_SPACE_TEMPLATES.find((t) => t.id === id);
      const ok = window.confirm(
        `Apply “${meta?.label ?? id}”? This will reposition ${objectCount} objects. You can still drag and resize them afterward.`,
      );
      if (!ok) return;
    }
    onApplyTemplate(id);
  };

  const quietOpacity = chromeQuiet && !hovered && !open ? 0.62 : 1;

  return (
    <div
      ref={rootRef}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: inShell ? 'absolute' : 'fixed',
        top: inShell ? 10 : topOffset + 10,
        left: 18,
        zIndex: 45,
        opacity: quietOpacity,
        transition: 'opacity 0.35s ease',
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Organize the workspace by thinking flow."
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '6px 11px',
          borderRadius: '10px',
          border: `1px solid rgba(255,255,255,0.06)`,
          background: `${tokens.cardBg}cc`,
          color: tokens.textSecondary,
          fontSize: '11px',
          fontWeight: 600,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          cursor: 'pointer',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          boxShadow: `0 8px 28px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.04)`,
          transition: 'background 0.18s ease, color 0.18s ease, border-color 0.18s ease',
        }}
      >
        <Grid3x3 style={{ width: 13, height: 13, opacity: 0.85 }} />
        Arrange
        <ChevronDown
          style={{
            width: 12,
            height: 12,
            opacity: 0.55,
            transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.2s ease',
          }}
        />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Organize workspace by thinking flow"
          style={{
            marginTop: 6,
            minWidth: 320,
            maxWidth: 360,
            padding: '6px',
            borderRadius: 12,
            border: `1px solid rgba(255,255,255,0.06)`,
            background: `${tokens.cardBg}ee`,
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            boxShadow: '0 16px 48px rgba(0,0,0,0.45)',
          }}
        >
          {FREE_SPACE_TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              role="menuitem"
              onClick={() => pick(t.id)}
              disabled={objectCount === 0}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                width: '100%',
                textAlign: 'left',
                padding: '9px 10px',
                border: 'none',
                borderRadius: 8,
                background: 'transparent',
                cursor: objectCount === 0 ? 'default' : 'pointer',
                opacity: objectCount === 0 ? 0.45 : 1,
              }}
            >
              <WorkspaceMicroScene tokens={tokens} variant={TEMPLATE_SCENE[t.id]} size="compact" />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '12.5px', fontWeight: 600, color: tokens.textPrimary }}>{t.label}</div>
                <div style={{ fontSize: '10.5px', color: tokens.textGhost, marginTop: 2, lineHeight: 1.35 }}>
                  {t.description}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
