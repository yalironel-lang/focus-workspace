import { useCallback, useEffect, useMemo, useState } from 'react';
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

const AUTO_HIDE_MS = 7000;
const CONTEXT_ROTATE_MS = 9800;
const PRIORITY_ROTATE_MS = 7200;
const FADE_MS = 360;

function dismissedKey(sectionId: string): string {
  return `fw_section_${sectionId}_guidance_dismissed_v1`;
}

function isDismissed(sectionId: string): boolean {
  try {
    return localStorage.getItem(dismissedKey(sectionId)) === '1';
  } catch {
    return false;
  }
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
  const byId = new Map(objects.map(object => [object.id, object]));
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
  const hasNotebook = objects.some(object => object.type === 'notebook');
  const hasPdf = objects.some(object => object.type === 'pdf');
  const hasMistake = objects.some(object => object.type === 'mistake');
  const hasToolPair =
    objects.some(object => object.type === 'graph') && objects.some(object => object.type === 'calculator');
  const hasNotebookPdfConnection =
    hasConnectedTypePair(objects, 'notebook', 'pdf') || hasConnectedTypePair(objects, 'pdf', 'notebook');
  const arrangedRecently = !!lastArrangeAt && Date.now() - lastArrangeAt < 12 * 60 * 1000;

  if (objectCount === 0) {
    return [
      { id: 'empty-build', text: 'Build connected study spaces.', variant: 'thinking-map' },
      { id: 'empty-link', text: 'Link notes, PDFs, mistakes, and tools.', variant: 'study-flow' },
    ];
  }

  const messages: GuidanceMessage[] = [];

  if (objectCount < 2) {
    messages.push({
      id: 'capture',
      text: 'Press C to capture an idea.',
      variant: 'cluster-return',
    });
  }

  if (objectCount >= 2 && connectionCount === 0) {
    messages.push({
      id: 'connect',
      text: 'Connect related objects.',
      variant: 'thinking-map',
    });
  }

  if (connectionCount > 0) {
    messages.push({
      id: 'grouped',
      text: 'Connected notes stay grouped.',
      variant: 'study-flow',
    });
  }

  if (hasNotebook && hasPdf && !hasNotebookPdfConnection) {
    messages.push({
      id: 'source-link',
      text: 'Link reading to your notes.',
      variant: 'reading-focus',
    });
  }

  if (objectCount >= 3 && !arrangedRecently) {
    messages.push({
      id: 'arrange',
      text: 'Try Arrange for thinking flow.',
      variant: 'study-flow',
    });
  }

  if (hasMistake) {
    messages.push({
      id: 'mistakes',
      text: 'Mistakes resurface for recall.',
      variant: 'cluster-return',
    });
  }

  if (focusMode) {
    messages.push({
      id: 'focus-active',
      text: 'Focus keeps nearby context visible.',
      variant:
        focusMode === 'thinking'
          ? 'thinking-map'
          : focusMode === 'solving'
            ? 'problem-tools'
            : 'reading-focus',
    });
  } else if (objectCount >= 3) {
    messages.push({
      id: 'focus-discovery',
      text: 'Cmd+K for focus modes.',
      variant: 'reading-focus',
    });
  }

  if (hasToolPair) {
    messages.push({
      id: 'tool-pair',
      text: 'Keep tools near the notebook they support.',
      variant: 'problem-tools',
    });
  }

  return messages.slice(0, 4);
}

export function WorkspaceGuidanceBar({
  sectionId,
  tokens,
  objects,
  focusMode,
  priorityHints = null,
  onClearPriorityHints,
  lastArrangeAt = null,
  chromeQuiet = false,
}: Props) {
  const [dismissed, setDismissed] = useState(() => (sectionId ? isDismissed(sectionId) : false));
  const [hovered, setHovered] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [index, setIndex] = useState(0);
  const [messageOpacity, setMessageOpacity] = useState(0);

  useEffect(() => {
    if (!sectionId) {
      setDismissed(false);
      return;
    }
    setDismissed(isDismissed(sectionId));
    setExpanded(true);
  }, [sectionId]);

  const dismissPermanent = useCallback(() => {
    setDismissed(true);
    setExpanded(false);
    try {
      localStorage.setItem(dismissedKey(sectionId), '1');
    } catch {
      /* ignore */
    }
  }, [sectionId]);

  const priorityMessages = useMemo(
    () =>
      (priorityHints ?? [])
        .filter(Boolean)
        .map((text, i) => ({
          id: `priority-${i}-${text.slice(0, 18)}`,
          text,
          variant: inferPriorityVariant(text, i),
        })),
    [priorityHints],
  );

  const messages = useMemo(
    () =>
      priorityMessages.length
        ? priorityMessages
        : buildContextMessages(objects, focusMode, lastArrangeAt),
    [priorityMessages, objects, focusMode, lastArrangeAt],
  );

  useEffect(() => {
    setIndex(0);
  }, [messages.map(m => m.id).join('|')]);

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
      setIndex(current => (current + 1) % messages.length);
    }, rotateMs);
    return () => window.clearInterval(timer);
  }, [messages.length, priorityMessages.length]);

  useEffect(() => {
    if (!messages.length) {
      setMessageOpacity(0);
      return;
    }
    setMessageOpacity(0);
    const raf = requestAnimationFrame(() => setMessageOpacity(1));
    return () => cancelAnimationFrame(raf);
  }, [messages[index]?.id, messages.length, index]);

  useEffect(() => {
    if (dismissed || !messages.length) return;
    if (hovered) {
      setExpanded(true);
      return;
    }
    const timer = window.setTimeout(() => setExpanded(false), AUTO_HIDE_MS);
    return () => window.clearTimeout(timer);
  }, [dismissed, hovered, messages.length, sectionId]);

  if (!messages.length || dismissed) return null;

  const message = messages[index] ?? messages[0];
  const showPill = expanded || hovered;
  const shellOpacity = chromeQuiet && !hovered ? 0.72 : 1;

  return (
    <div
      aria-live="polite"
      onMouseEnter={() => {
        setHovered(true);
        setExpanded(true);
      }}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'fixed',
        left: 16,
        bottom: 20,
        zIndex: 44,
        maxWidth: 'min(320px, calc(100vw - 200px))',
        pointerEvents: 'none',
        opacity: shellOpacity,
        transition: 'opacity 0.35s ease, transform 0.35s cubic-bezier(0.22, 1, 0.36, 1)',
        transform: showPill ? 'translateY(0)' : 'translateY(4px)',
      }}
    >
      <GuidancePill
        showPill={showPill}
        tokens={tokens}
        message={message}
        messageOpacity={messageOpacity}
        messages={messages}
        index={index}
        onDismiss={dismissPermanent}
      />
    </div>
  );
}

function GuidancePill({
  showPill,
  tokens,
  message,
  messageOpacity,
  messages,
  index,
  onDismiss,
}: {
  showPill: boolean;
  tokens: AtmosphereTokens;
  message: GuidanceMessage;
  messageOpacity: number;
  messages: GuidanceMessage[];
  index: number;
  onDismiss: () => void;
}) {
  if (!showPill) {
    return (
      <button
        type="button"
        aria-label="Show workspace tip"
        style={{
          pointerEvents: 'auto',
          width: 10,
          height: 10,
          borderRadius: 999,
          border: `1px solid ${tokens.accent}55`,
          backgroundColor: `${tokens.accent}44`,
          boxShadow: `0 0 12px ${tokens.accent}33`,
          cursor: 'default',
          padding: 0,
        }}
      />
    );
  }

  return (
    <div
      style={{
        pointerEvents: 'auto',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 8px 6px 6px',
        borderRadius: 999,
        border: `1px solid ${tokens.cardBorder}`,
        background: tokens.cardBg,
        boxShadow: '0 8px 28px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.06)',
        transition: `opacity ${FADE_MS}ms ease`,
        opacity: messageOpacity,
      }}
    >
      <WorkspaceMicroScene tokens={tokens} variant={message.variant} size="compact" />
      <span
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: 11,
          lineHeight: 1.4,
          color: tokens.textSecondary,
          letterSpacing: '-0.01em',
        }}
      >
        {message.text}
      </span>
      {messages.length > 1 && (
        <span
          aria-hidden
          style={{
            fontSize: 9,
            fontWeight: 600,
            color: tokens.textGhost,
            flexShrink: 0,
          }}
        >
          {index + 1}/{messages.length}
        </span>
      )}
      <button
        type="button"
        aria-label="Dismiss tips for this workspace"
        onClick={onDismiss}
        style={{
          width: 22,
          height: 22,
          border: 'none',
          borderRadius: 999,
          background: 'transparent',
          color: tokens.textGhost,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <X style={{ width: 12, height: 12 }} />
      </button>
    </div>
  );
}
