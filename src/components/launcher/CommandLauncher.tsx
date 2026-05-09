/**
 * CommandLauncher — the universal fast-access layer.
 *
 * Open: ⌘K (or Ctrl+K)
 * Close: Escape
 * Navigate: ↑ ↓ arrows
 * Execute: Enter
 *
 * Interaction model:
 *   Empty query   → show default actions + recent workspaces
 *   Typing text   → first result is always "Capture: [text]",
 *                   then filtered workspaces + matching deadlines
 *
 * This replaces the ⌘K → AddWorkspacePanel shortcut as the primary
 * entry point. The Add panel is accessible as an action within the launcher.
 *
 * Design goal: open → type → Enter. Three interactions maximum.
 * The launcher should feel faster than clicking anything.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Zap, Search, ArrowRight, Plus, BookOpen,
  Clock, AlertCircle, X,
} from 'lucide-react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import type { SectionWithProgress, Deadline } from '../../types';

// ── Types ─────────────────────────────────────────────────────────────────────

type ActionKind =
  | 'capture'
  | 'start-session'
  | 'open-workspace'
  | 'open-add'
  | 'deadline';

interface LauncherAction {
  id:          string;
  kind:        ActionKind;
  label:       string;
  sublabel?:   string;
  urgency?:    'critical' | 'warning' | 'normal';
  payload?:    string;   // sectionId, deadlineId, etc.
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getDaysUntil(dateStr: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due   = new Date(dateStr); due.setHours(0, 0, 0, 0);
  return Math.ceil((due.getTime() - today.getTime()) / 86_400_000);
}

function deadlineLabel(days: number): string {
  if (days < -1)  return `${Math.abs(days)}d overdue`;
  if (days === -1) return '1d overdue';
  if (days === 0)  return 'due today';
  if (days === 1)  return 'due tomorrow';
  return `due in ${days}d`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function KbdHint({ tokens, label }: { tokens: AtmosphereTokens; label: string }) {
  return (
    <kbd style={{
      fontFamily:      "'Space Grotesk', monospace",
      fontSize:        '9px',
      fontWeight:      600,
      padding:         '2px 5px',
      borderRadius:    '5px',
      border:          `1px solid ${tokens.cardBorderHover}`,
      backgroundColor: tokens.wellBg,
      color:           tokens.textGhost,
      letterSpacing:   '0.03em',
      lineHeight:      '1.5',
      flexShrink:      0,
    }}>
      {label}
    </kbd>
  );
}

function ActionRow({
  action, active, tokens, onClick,
}: {
  action:  LauncherAction;
  active:  boolean;
  tokens:  AtmosphereTokens;
  onClick: () => void;
}) {
  const urgencyColor =
    action.urgency === 'critical' ? '#f87171' :
    action.urgency === 'warning'  ? '#fbbf24' :
    null;

  const Icon = (() => {
    switch (action.kind) {
      case 'capture':         return Zap;
      case 'start-session':   return Clock;
      case 'open-workspace':  return BookOpen;
      case 'open-add':        return Plus;
      case 'deadline':        return AlertCircle;
    }
  })();

  return (
    <button
      onClick={onClick}
      style={{
        width:           '100%',
        display:         'flex',
        alignItems:      'center',
        gap:             '10px',
        padding:         '9px 12px',
        borderRadius:    '9px',
        border:          `1px solid ${active ? tokens.accent + '30' : 'transparent'}`,
        backgroundColor: active ? `${tokens.accent}10` : 'transparent',
        cursor:          'pointer',
        textAlign:       'left' as const,
        transition:      'background-color 0.08s ease',
      }}
    >
      {/* Icon */}
      <div style={{
        width:           '28px',
        height:          '28px',
        borderRadius:    '7px',
        backgroundColor: active
          ? `${tokens.accent}20`
          : urgencyColor
          ? `${urgencyColor}15`
          : tokens.cardBorder,
        border:          `1px solid ${active ? tokens.accent + '30' : urgencyColor ? urgencyColor + '30' : 'transparent'}`,
        display:         'flex',
        alignItems:      'center',
        justifyContent:  'center',
        flexShrink:      0,
      }}>
        <Icon style={{
          width:  '13px',
          height: '13px',
          color:  active ? tokens.accent : urgencyColor ?? tokens.textSecondary,
        }} strokeWidth={action.kind === 'capture' ? 2.5 : 2} />
      </div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          fontSize:     '13px',
          fontWeight:   action.kind === 'capture' ? 700 : 500,
          color:        active ? tokens.textPrimary : urgencyColor ?? tokens.textPrimary,
          margin:       0,
          overflow:     'hidden',
          textOverflow: 'ellipsis',
          whiteSpace:   'nowrap',
        }}>
          {action.label}
        </p>
        {action.sublabel && (
          <p style={{
            fontSize:  '10px',
            color:     active ? tokens.textMuted : urgencyColor ? `${urgencyColor}cc` : tokens.textMuted,
            margin:    '1px 0 0',
            overflow:  'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {action.sublabel}
          </p>
        )}
      </div>

      {/* Right hint */}
      {active && <ArrowRight style={{ width: '12px', height: '12px', color: tokens.textGhost, flexShrink: 0 }} />}
    </button>
  );
}

// ── Group label ───────────────────────────────────────────────────────────────

function GroupLabel({ tokens, label }: { tokens: AtmosphereTokens; label: string }) {
  return (
    <p style={{
      fontFamily:    "'Space Grotesk', sans-serif",
      fontSize:      '9px',
      fontWeight:    700,
      letterSpacing: '0.14em',
      textTransform: 'uppercase',
      color:         tokens.textGhost,
      margin:        '0 0 4px',
      padding:       '4px 12px 0',
    }}>
      {label}
    </p>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  open:           boolean;
  tokens:         AtmosphereTokens;
  sections:       SectionWithProgress[];
  deadlines:      Deadline[];
  onClose:        () => void;
  onCapture:      (text: string) => void;
  onStartSession: () => void;
  onOpenSection:  (id: string) => void;
  onOpenAdd:      () => void;
}

export function CommandLauncher({
  open, tokens, sections, deadlines,
  onClose, onCapture, onStartSession, onOpenSection, onOpenAdd,
}: Props) {
  const [query,       setQuery]       = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset on open/close
  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  // Build action list based on query
  const actions = useMemo<LauncherAction[]>(() => {
    const q = query.trim().toLowerCase();

    if (!q) {
      // Default: fixed actions + top workspaces
      const defaultActions: LauncherAction[] = [
        {
          id:       'capture-empty',
          kind:     'capture',
          label:    'Capture a thought…',
          sublabel: 'Type something then press Enter',
        },
        {
          id:       'start-session',
          kind:     'start-session',
          label:    'Start a focus session',
          sublabel: 'Choose workspace, set timer, lock in',
        },
        {
          id:       'open-add',
          kind:     'open-add',
          label:    'Add to workspace',
          sublabel: 'Timer, note, checklist, tool and more',
        },
      ];

      const workspaceActions: LauncherAction[] = sections
        .slice(0, 5)
        .map(s => ({
          id:       `ws-${s.id}`,
          kind:     'open-workspace' as ActionKind,
          label:    s.title,
          sublabel: s.total_items > 0
            ? `${s.total_items - s.completed_items} remaining`
            : 'No items yet',
          payload:  s.id,
        }));

      // Surface urgent deadlines in defaults
      const urgentDeadlines: LauncherAction[] = deadlines
        .filter(d => !d.completed)
        .map(d => ({ d, days: getDaysUntil(d.due_date) }))
        .filter(({ days }) => days <= 1)
        .slice(0, 2)
        .map(({ d, days }) => ({
          id:       `dl-${d.id}`,
          kind:     'deadline' as ActionKind,
          label:    d.title,
          sublabel: deadlineLabel(days),
          urgency:  days <= 0 ? 'critical' : 'warning',
          payload:  d.section_id ?? undefined,
        }));

      return [...urgentDeadlines, ...defaultActions, ...workspaceActions];
    }

    // With query: capture is always first
    const captureAction: LauncherAction = {
      id:       'capture',
      kind:     'capture',
      label:    `Capture: "${query}"`,
      sublabel: 'Press Enter to save immediately',
    };

    const matchedWorkspaces: LauncherAction[] = sections
      .filter(s => s.title.toLowerCase().includes(q))
      .slice(0, 4)
      .map(s => ({
        id:       `ws-${s.id}`,
        kind:     'open-workspace' as ActionKind,
        label:    s.title,
        sublabel: s.total_items > 0
          ? `${s.total_items - s.completed_items} remaining`
          : 'No items yet',
        payload:  s.id,
      }));

    const matchedDeadlines: LauncherAction[] = deadlines
      .filter(d => !d.completed && d.title.toLowerCase().includes(q))
      .slice(0, 3)
      .map(d => {
        const days = getDaysUntil(d.due_date);
        return {
          id:       `dl-${d.id}`,
          kind:     'deadline' as ActionKind,
          label:    d.title,
          sublabel: deadlineLabel(days),
          urgency:  days < 0 ? 'critical' : days <= 1 ? 'warning' : 'normal',
          payload:  d.section_id ?? undefined,
        };
      });

    return [captureAction, ...matchedWorkspaces, ...matchedDeadlines];
  }, [query, sections, deadlines]);

  // Clamp activeIndex when list shrinks
  useEffect(() => {
    setActiveIndex(idx => Math.min(idx, Math.max(0, actions.length - 1)));
  }, [actions.length]);

  // Execute the highlighted or specified action
  const execute = useCallback((action: LauncherAction) => {
    onClose();
    switch (action.kind) {
      case 'capture':
        if (query.trim()) {
          onCapture(query.trim());
        }
        break;
      case 'start-session':
        onStartSession();
        break;
      case 'open-workspace':
        if (action.payload) onOpenSection(action.payload);
        break;
      case 'open-add':
        onOpenAdd();
        break;
      case 'deadline':
        if (action.payload) onOpenSection(action.payload);
        break;
    }
  }, [query, onClose, onCapture, onStartSession, onOpenSection, onOpenAdd]);

  // Keyboard handler
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex(i => Math.min(i + 1, actions.length - 1));
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex(i => Math.max(i - 1, 0));
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const action = actions[activeIndex];
        if (action) execute(action);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, actions, activeIndex, execute, onClose]);

  if (!open) return null;

  // Group the actions for rendering
  const q = query.trim().toLowerCase();
  const urgentItems  = !q ? actions.filter(a => a.kind === 'deadline') : [];
  const fixedActions = !q
    ? actions.filter(a => a.kind !== 'deadline' && a.kind !== 'open-workspace')
    : [actions[0]]; // capture
  const workspaces   = !q
    ? actions.filter(a => a.kind === 'open-workspace')
    : actions.filter(a => a.kind === 'open-workspace');
  const deadlineResults = q ? actions.filter(a => a.kind === 'deadline') : [];

  const renderAction = (action: LauncherAction) => {
    const idx = actions.findIndex(a => a.id === action.id);
    return (
      <ActionRow
        key={action.id}
        action={action}
        active={activeIndex === idx}
        tokens={tokens}
        onClick={() => { setActiveIndex(idx); execute(action); }}
      />
    );
  };

  return (
    <>
      {/* ── Backdrop ───────────────────────────────────────────────── */}
      <div
        onClick={onClose}
        style={{
          position:        'fixed',
          inset:           0,
          zIndex:          200,
          backgroundColor: 'rgba(0,0,0,0.6)',
          backdropFilter:  'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
          animation:       'fadeIn 0.12s ease both',
        }}
      />

      {/* ── Panel ──────────────────────────────────────────────────── */}
      <div
        style={{
          position:        'fixed',
          top:             '12vh',
          left:            '50%',
          transform:       'translateX(-50%)',
          zIndex:          201,
          width:           'min(560px, calc(100vw - 32px))',
          maxHeight:       '70vh',
          display:         'flex',
          flexDirection:   'column',
          backgroundColor: tokens.cardBg,
          border:          `1px solid ${tokens.cardBorderHover}`,
          borderRadius:    `${Math.min(tokens.radius, 18)}px`,
          boxShadow:       `0 32px 96px rgba(0,0,0,0.8), 0 0 0 1px ${tokens.accent}15, inset 0 1px 0 rgba(255,255,255,0.04)`,
          overflow:        'hidden',
          animation:       'scaleIn 0.14s cubic-bezier(0.34,1.4,0.64,1) both',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Input ──────────────────────────────────────────────── */}
        <div style={{
          display:     'flex',
          alignItems:  'center',
          gap:         '10px',
          padding:     '14px 16px 12px',
          borderBottom: `1px solid ${tokens.divider}`,
          flexShrink:  0,
        }}>
          <Search style={{ width: '15px', height: '15px', color: tokens.textGhost, flexShrink: 0 }} />
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setActiveIndex(0); }}
            placeholder="Capture, search, or jump anywhere…"
            style={{
              flex:            1,
              fontSize:        '15px',
              fontWeight:      400,
              color:           tokens.textPrimary,
              backgroundColor: 'transparent',
              border:          'none',
              outline:         'none',
              fontFamily:      'inherit',
              caretColor:      tokens.accent,
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}>
            <KbdHint tokens={tokens} label="↑↓ navigate" />
            <KbdHint tokens={tokens} label="⏎ select" />
            <button
              onClick={onClose}
              style={{
                width:  '22px', height: '22px',
                borderRadius: '5px', border: 'none',
                backgroundColor: 'transparent', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: tokens.textGhost,
              }}
              onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = tokens.cardBorder)}
              onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent')}
            >
              <X style={{ width: '11px', height: '11px' }} />
            </button>
          </div>
        </div>

        {/* ── Results ────────────────────────────────────────────── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 8px 12px' }}>

          {/* Urgent deadlines (shown in empty state only) */}
          {urgentItems.length > 0 && (
            <div style={{ marginBottom: '6px' }}>
              <GroupLabel tokens={tokens} label="Needs attention" />
              {urgentItems.map(renderAction)}
            </div>
          )}

          {/* Fixed actions */}
          {fixedActions.length > 0 && (
            <div style={{ marginBottom: '6px' }}>
              {!q && <GroupLabel tokens={tokens} label="Quick actions" />}
              {fixedActions.map(renderAction)}
            </div>
          )}

          {/* Workspaces */}
          {workspaces.length > 0 && (
            <div style={{ marginBottom: '6px' }}>
              <GroupLabel tokens={tokens} label={q ? 'Workspaces' : 'Your workspaces'} />
              {workspaces.map(renderAction)}
            </div>
          )}

          {/* Deadline search results */}
          {deadlineResults.length > 0 && (
            <div>
              <GroupLabel tokens={tokens} label="Deadlines" />
              {deadlineResults.map(renderAction)}
            </div>
          )}

          {/* Empty search results */}
          {q && actions.length === 1 && (
            <div style={{ padding: '0 12px 4px' }}>
              <p style={{ fontSize: '11px', color: tokens.textMuted, margin: 0 }}>
                No matches — press Enter to capture "{query}"
              </p>
            </div>
          )}
        </div>

        {/* ── Footer hint ────────────────────────────────────────── */}
        <div style={{
          display:      'flex',
          alignItems:   'center',
          justifyContent: 'space-between',
          padding:      '8px 16px',
          borderTop:    `1px solid ${tokens.divider}`,
          flexShrink:   0,
        }}>
          <span style={{ fontSize: '10px', color: tokens.textGhost }}>
            {query.trim()
              ? 'Enter to capture · or select a result'
              : 'Start typing to capture or search'
            }
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <KbdHint tokens={tokens} label="Esc" />
            <span style={{ fontSize: '10px', color: tokens.textGhost }}>to close</span>
          </div>
        </div>
      </div>
    </>
  );
}
