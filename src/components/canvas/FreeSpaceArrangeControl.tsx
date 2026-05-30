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
import type { ArrangeGoalId } from '../../lib/freeSpaceAutoArrange';
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
  selectedCount: number;
  onApplyTemplate: (id: FreeSpaceTemplateId) => void;
  onAutoArrange: () => void;
  onArrangeSelected: () => void;
  onArrangeByGoal: (goal: ArrangeGoalId) => void;
  /** Notebook deep edit: control recedes until hovered. */
  chromeQuiet?: boolean;
}

export function FreeSpaceArrangeControl({
  tokens,
  topOffset = 0,
  inShell = false,
  objectCount,
  selectedCount,
  onApplyTemplate,
  onAutoArrange,
  onArrangeSelected,
  onArrangeByGoal,
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

  const runAutoArrange = () => {
    setOpen(false);
    if (objectCount === 0) return;
    onAutoArrange();
  };

  const runArrangeSelected = () => {
    setOpen(false);
    if (selectedCount < 2) return;
    onArrangeSelected();
  };

  const runGoal = (goal: ArrangeGoalId) => {
    setOpen(false);
    if (objectCount === 0) return;
    onArrangeByGoal(goal);
  };

  const quietOpacity = chromeQuiet && !hovered && !open ? 0.62 : 1;

  return (
    <div
      ref={rootRef}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: inShell ? 'absolute' : 'fixed',
        top: inShell ? 82 : topOffset + 10,
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
          minHeight: 40,
          padding: '8px 12px',
          borderRadius: '10px',
          border: `1px solid rgba(255,255,255,0.06)`,
          backgroundColor: tokens.cardBg,
          color: tokens.textSecondary,
          fontSize: '11px',
          fontWeight: 600,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          cursor: 'pointer',
          boxShadow: '0 8px 24px rgba(0,0,0,0.32)',
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
            backgroundColor: tokens.cardBg,
            boxShadow: '0 16px 44px rgba(0,0,0,0.4)',
          }}
        >
          <div style={{ padding: '8px 10px 6px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: tokens.textGhost }}>
              Arrange Workspace
            </div>
          </div>
          <button
            type="button"
            onClick={runAutoArrange}
            disabled={objectCount === 0}
            style={{
              display: 'flex',
              alignItems: 'center',
              width: '100%',
              textAlign: 'left',
              padding: '10px 10px',
              border: 'none',
              borderRadius: 8,
              marginBottom: 4,
              background: objectCount === 0 ? 'transparent' : `${tokens.accent}1c`,
              color: objectCount === 0 ? tokens.textGhost : tokens.textPrimary,
              cursor: objectCount === 0 ? 'default' : 'pointer',
              opacity: objectCount === 0 ? 0.45 : 1,
              fontSize: 13,
              fontWeight: 650,
            }}
          >
            ✨ Auto Arrange
          </button>

          <button
            type="button"
            onClick={runArrangeSelected}
            disabled={selectedCount < 2}
            style={{
              display: 'flex',
              alignItems: 'center',
              width: '100%',
              textAlign: 'left',
              padding: '9px 10px',
              border: 'none',
              borderRadius: 8,
              marginBottom: 4,
              background: 'transparent',
              color: selectedCount < 2 ? tokens.textGhost : tokens.textSecondary,
              cursor: selectedCount < 2 ? 'default' : 'pointer',
              opacity: selectedCount < 2 ? 0.45 : 1,
              fontSize: 12.5,
              fontWeight: 600,
            }}
          >
            Arrange selected {selectedCount > 1 ? `(${selectedCount})` : ''}
          </button>

          <div style={{ height: 1, margin: '4px 8px 8px', background: 'rgba(255,255,255,0.06)' }} />
          <div style={{ padding: '0 10px 6px', fontSize: 10.5, fontWeight: 650, letterSpacing: '0.06em', textTransform: 'uppercase', color: tokens.textGhost }}>
            Arrange by goal
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, padding: '0 10px 8px' }}>
            {[
              { id: 'exam-study' as const, label: 'Exam Study' },
              { id: 'research-map' as const, label: 'Research Map' },
              { id: 'project-planning' as const, label: 'Project Planning' },
              { id: 'clean-presentation' as const, label: 'Clean Presentation' },
            ].map((goal) => (
              <button
                key={goal.id}
                type="button"
                onClick={() => runGoal(goal.id)}
                disabled={objectCount === 0}
                style={{
                  padding: '7px 8px',
                  borderRadius: 7,
                  border: '1px solid rgba(255,255,255,0.06)',
                  background: 'transparent',
                  color: objectCount === 0 ? tokens.textGhost : tokens.textSecondary,
                  fontSize: 11.5,
                  fontWeight: 600,
                  textAlign: 'left',
                  cursor: objectCount === 0 ? 'default' : 'pointer',
                  opacity: objectCount === 0 ? 0.45 : 1,
                }}
              >
                {goal.label}
              </button>
            ))}
          </div>

          <div style={{ height: 1, margin: '0 8px 8px', background: 'rgba(255,255,255,0.06)' }} />
          <div style={{ padding: '0 10px 4px', fontSize: 10.5, fontWeight: 650, letterSpacing: '0.06em', textTransform: 'uppercase', color: tokens.textGhost }}>
            Templates
          </div>
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
          <div style={{ padding: '8px 10px 6px', fontSize: 10.5, lineHeight: 1.4, color: tokens.textGhost }}>
            Organize objects while keeping connected ideas close.
          </div>
        </div>
      )}
    </div>
  );
}
