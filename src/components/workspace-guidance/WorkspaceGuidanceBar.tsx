import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import type { ProjectSpaceObject } from '../../hooks/useSectionFreeSpaceObjects';
import { coerceFreeSpaceConnectionIds } from '../../hooks/useSectionFreeSpaceObjects';
import type { FocusMode } from '../../focusMode/focusModeTypes';
import { WorkspaceMicroScene, type WorkspaceMicroSceneVariant } from './WorkspaceMicroScene';

interface Props {
  sectionId: string;
  tokens: AtmosphereTokens;
  topOffset: number;
  objects: ProjectSpaceObject[];
  focusMode: FocusMode | null;
  priorityHints?: string[] | null;
  onClearPriorityHints?: () => void;
  lastArrangeAt?: number | null;
  chromeQuiet?: boolean;
}

interface GuidanceMessage {
  id: string;
  text: string;
  variant: WorkspaceMicroSceneVariant;
}

const SNOOZE_MS = 20 * 60 * 1000;
const CONTEXT_ROTATE_MS = 9800;
const PRIORITY_ROTATE_MS = 7200;
const FADE_MS = 360;

function snoozeKey(sectionId: string): string {
  return `fw_section_${sectionId}_workspace_guidance_snooze_v1`;
}

function uniqueConnectionCount(objects: ProjectSpaceObject[]): number {
  const seen = new Set<string>();
  for (const object of objects) {
    for (const otherId of coerceFreeSpaceConnectionIds(object.connections)) {
      if (otherId === object.id) continue;
      const key = object.id < otherId ? `${object.id}|${otherId}` : `${otherId}|${object.id}`;
      seen.add(key);
    }
  }
  return seen.size;
}

function hasConnectedTypePair(
  objects: ProjectSpaceObject[],
  leftType: ProjectSpaceObject['type'],
  rightType: ProjectSpaceObject['type'],
): boolean {
  const byId = new Map(objects.map((object) => [object.id, object]));
  for (const object of objects) {
    if (object.type !== leftType) continue;
    for (const otherId of coerceFreeSpaceConnectionIds(object.connections)) {
      const other = byId.get(otherId);
      if (!other) continue;
      if (other.type === rightType) return true;
    }
  }
  return false;
}

function inferPriorityVariant(text: string, index: number): WorkspaceMicroSceneVariant {
  const lower = text.toLowerCase();
  if (lower.includes('focus')) return 'reading-focus';
  if (lower.includes('mistake') || lower.includes('recall')) return 'cluster-return';
  if (lower.includes('connect')) return 'thinking-map';
  if (lower.includes('arrange') || lower.includes('group')) return 'study-flow';
  return index % 2 === 0 ? 'study-flow' : 'thinking-map';
}

function buildContextMessages(
  objects: ProjectSpaceObject[],
  focusMode: FocusMode | null,
  lastArrangeAt: number | null | undefined,
): GuidanceMessage[] {
  const objectCount = objects.length;
  const connectionCount = uniqueConnectionCount(objects);
  const hasNotebook = objects.some((object) => object.type === 'notebook');
  const hasPdf = objects.some((object) => object.type === 'pdf');
  const hasMistake = objects.some((object) => object.type === 'mistake');
  const hasToolPair = objects.some((object) => object.type === 'graph') && objects.some((object) => object.type === 'calculator');
  const hasNotebookPdfConnection = hasConnectedTypePair(objects, 'notebook', 'pdf') || hasConnectedTypePair(objects, 'pdf', 'notebook');
  const arrangedRecently = !!lastArrangeAt && Date.now() - lastArrangeAt < 12 * 60 * 1000;

  if (objectCount === 0) {
    return [
      { id: 'empty-build', text: 'Build connected study spaces.', variant: 'thinking-map' },
      { id: 'empty-link', text: 'Link notes, PDFs, mistakes, and tools.', variant: 'study-flow' },
      { id: 'empty-arrange', text: 'Arrange ideas visually by thinking flow.', variant: 'course-desk' },
      { id: 'empty-review', text: 'Review concepts spatially over time.', variant: 'cluster-return' },
    ];
  }

  const messages: GuidanceMessage[] = [];

  if (objectCount < 2) {
    messages.push({
      id: 'capture',
      text: 'Press C anywhere to quickly capture an idea.',
      variant: 'cluster-return',
    });
  }

  if (objectCount >= 2 && connectionCount === 0) {
    messages.push({
      id: 'connect',
      text: 'Related objects work best when connected.',
      variant: 'thinking-map',
    });
  }

  if (connectionCount > 0) {
    messages.push({
      id: 'grouped',
      text: 'Connected notes stay grouped together.',
      variant: 'study-flow',
    });
  }

  if (hasNotebook && hasPdf && !hasNotebookPdfConnection) {
    messages.push({
      id: 'source-link',
      text: 'Connect reading material to your notes so it stays part of the same thought.',
      variant: 'reading-focus',
    });
  }

  if (objectCount >= 3 && !arrangedRecently) {
    messages.push({
      id: 'arrange',
      text: 'Try Arrange to organize the workspace by thinking flow.',
      variant: 'study-flow',
    });
  }

  if (arrangedRecently) {
    messages.push({
      id: 'arranged',
      text: 'Arrange keeps connected groups closer and easier to read at a glance.',
      variant: 'course-desk',
    });
  }

  if (hasMistake) {
    messages.push({
      id: 'mistakes',
      text: 'Mistakes can resurface later for recall.',
      variant: 'cluster-return',
    });
  }

  if (focusMode) {
    messages.push({
      id: 'focus-active',
      text: 'Focus Modes reduce distraction while keeping nearby context visible.',
      variant: focusMode === 'thinking' ? 'thinking-map' : focusMode === 'solving' ? 'problem-tools' : 'reading-focus',
    });
  } else if (objectCount >= 3) {
    messages.push({
      id: 'focus-discovery',
      text: 'Cmd+K can shift the room into a calmer focus mode when you want less noise.',
      variant: 'reading-focus',
    });
  }

  if (hasToolPair) {
    messages.push({
      id: 'tool-pair',
      text: 'Tools feel clearer when they stay near the notebook they support.',
      variant: 'problem-tools',
    });
  }

  if (objectCount >= 4 && connectionCount > 0 && arrangedRecently && focusMode) {
    messages.unshift({
      id: 'first-moment',
      text: 'Connections, layout, and focus work together best when the workspace thinks in clusters.',
      variant: 'study-flow',
    });
  }

  return messages.slice(0, 5);
}

export function WorkspaceGuidanceBar({
  sectionId,
  tokens,
  topOffset,
  objects,
  focusMode,
  priorityHints = null,
  onClearPriorityHints,
  lastArrangeAt = null,
  chromeQuiet = false,
}: Props) {
  const [hovered, setHovered] = useState(false);
  const [dismissedUntil, setDismissedUntil] = useState(0);
  const [index, setIndex] = useState(0);
  const [opacity, setOpacity] = useState(0);

  useEffect(() => {
    if (!sectionId) {
      setDismissedUntil(0);
      return;
    }
    try {
      const raw = localStorage.getItem(snoozeKey(sectionId));
      setDismissedUntil(raw ? Number(raw) || 0 : 0);
    } catch {
      setDismissedUntil(0);
    }
  }, [sectionId]);

  const priorityMessages = useMemo(
    () =>
      (priorityHints ?? [])
        .filter(Boolean)
        .map((text, index) => ({
          id: `priority-${index}-${text.slice(0, 18)}`,
          text,
          variant: inferPriorityVariant(text, index),
        })),
    [priorityHints],
  );

  const messages = useMemo(
    () => (priorityMessages.length ? priorityMessages : buildContextMessages(objects, focusMode, lastArrangeAt)),
    [priorityMessages, objects, focusMode, lastArrangeAt],
  );

  useEffect(() => {
    setIndex(0);
  }, [messages.map((message) => message.id).join('|')]);

  useEffect(() => {
    if (!priorityMessages.length || !onClearPriorityHints) return;
    const total = PRIORITY_ROTATE_MS * priorityMessages.length + FADE_MS * priorityMessages.length;
    const timer = window.setTimeout(() => onClearPriorityHints(), total);
    return () => window.clearTimeout(timer);
  }, [priorityMessages, onClearPriorityHints]);

  useEffect(() => {
    if (messages.length <= 1) return;
    const rotateMs = priorityMessages.length ? PRIORITY_ROTATE_MS : CONTEXT_ROTATE_MS;
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % messages.length);
    }, rotateMs);
    return () => window.clearInterval(timer);
  }, [messages.length, priorityMessages.length]);

  useEffect(() => {
    if (!messages.length) {
      setOpacity(0);
      return;
    }
    setOpacity(0);
    const raf = requestAnimationFrame(() => setOpacity(1));
    return () => cancelAnimationFrame(raf);
  }, [messages[index]?.id, messages.length, index]);

  if (!messages.length) return null;
  if (dismissedUntil > Date.now()) return null;

  const message = messages[index] ?? messages[0];
  const quietOpacity = chromeQuiet && !hovered ? 0.58 : 1;

  return (
    <div
      aria-live="polite"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'fixed',
        top: topOffset + 10,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 46,
        width: 'min(720px, calc(100vw - 146px))',
        pointerEvents: 'none',
        opacity: quietOpacity,
        transition: 'opacity 0.35s ease',
      }}
    >
      <div
        style={{
          pointerEvents: 'auto',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          minHeight: 58,
          padding: '8px 12px 8px 10px',
          borderRadius: 16,
          border: `1px solid rgba(255,255,255,0.07)`,
          background: `${tokens.cardBg}d8`,
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          boxShadow: '0 16px 48px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.04)',
          transition: `opacity ${FADE_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`,
          opacity,
        }}
      >
        <WorkspaceMicroScene tokens={tokens} variant={message.variant} size="compact" />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 12.5,
              lineHeight: 1.45,
              color: tokens.textSecondary,
              letterSpacing: '-0.01em',
            }}
          >
            {message.text}
          </div>
          {messages.length > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 7 }}>
              {messages.map((entry, dotIndex) => (
                <span
                  key={entry.id}
                  style={{
                    width: dotIndex === index ? 13 : 5,
                    height: 5,
                    borderRadius: 999,
                    backgroundColor: dotIndex === index ? `${tokens.accent}c8` : 'rgba(148,163,184,0.28)',
                    transition: 'width 0.25s ease, background-color 0.25s ease',
                  }}
                />
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          aria-label="Dismiss workspace guidance for now"
          onClick={() => {
            const until = Date.now() + SNOOZE_MS;
            setDismissedUntil(until);
            try {
              localStorage.setItem(snoozeKey(sectionId), String(until));
            } catch {
              /* ignore */
            }
          }}
          style={{
            width: 28,
            height: 28,
            border: 'none',
            borderRadius: 8,
            background: 'transparent',
            color: tokens.textGhost,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            transition: 'background-color 0.18s ease, color 0.18s ease',
          }}
          onMouseEnter={(event) => {
            event.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)';
            event.currentTarget.style.color = tokens.textSecondary;
          }}
          onMouseLeave={(event) => {
            event.currentTarget.style.backgroundColor = 'transparent';
            event.currentTarget.style.color = tokens.textGhost;
          }}
        >
          <X style={{ width: 13, height: 13 }} />
        </button>
      </div>
    </div>
  );
}
