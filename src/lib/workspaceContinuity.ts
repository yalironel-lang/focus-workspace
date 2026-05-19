import type { PositionMap } from '../hooks/useBlockPositions';
import {
  coerceFreeSpaceConnectionIds,
  ensureProjectObjectContent,
  type ProjectSpaceObject,
} from '../hooks/useSectionFreeSpaceObjects';
import type { FocusMode } from '../focusMode/focusModeTypes';
import { getCompanionKind } from './companionPanels';
import { countNeedsReviewMistakes } from './mistakeIntelligence';
import { findLinkedNotebook, findLinkedSource } from './studyConnections';

export type WorkspaceContinuityIntent =
  | 'reading'
  | 'solving'
  | 'reviewing'
  | 'thinking'
  | 'general';

export interface WorkspaceContinuityMemory {
  version: 1;
  sectionId: string;
  savedAt: number;
  lastSelectedObjectId: string | null;
  recentObjectIds: string[];
  nearbyObjectIds: string[];
  activeClusterObjectIds: string[];
  recentConnectionKeys: string[];
  activeFocusMode: FocusMode | null;
  recentNotebookId: string | null;
  openCompanionIds: string[];
  viewport: {
    zoom: number;
    panX: number;
    panY: number;
  };
  intent: WorkspaceContinuityIntent;
}

export interface WorkspaceContinuitySuggestion {
  id: string;
  label: string;
  subtitle: string;
  objectId?: string;
  focusMode?: FocusMode | null;
  openCompanion?: boolean;
}

export interface WorkspaceResumeCopy {
  headline: string;
  subtitle: string;
  details: string[];
}

interface BuildMemoryArgs {
  sectionId: string;
  objects: ProjectSpaceObject[];
  positions: PositionMap;
  selectedId: string | null;
  lastSelectedId: string | null;
  recentNotebookId: string | null;
  focusMode: FocusMode | null;
  zoom: number;
  panX: number;
  panY: number;
}

const VERSION = 1;
const RECENT_HOURS = 96;
const COMPANION_WINDOW_MS = 36 * 60 * 60 * 1000;

function storageKey(sectionId: string): string {
  return `fw_section_${sectionId}_workspace_continuity_v1`;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function edgeKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function uniqueIds(ids: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function objectCenter(id: string, positions: PositionMap): { x: number; y: number } | null {
  const pos = positions[id];
  if (!pos) return null;
  const w = pos.w > 0 ? pos.w : 340;
  const h = pos.h > 0 ? pos.h : 220;
  return { x: pos.x + w / 2, y: pos.y + h / 2 };
}

function connectedCluster(anchorId: string, objects: ProjectSpaceObject[]): string[] {
  const byId = new Map(objects.map(object => [object.id, object]));
  const out = new Set<string>();
  const stack = [anchorId];
  while (stack.length) {
    const currentId = stack.pop();
    if (!currentId || out.has(currentId)) continue;
    out.add(currentId);
    const current = byId.get(currentId);
    if (!current) continue;
    for (const otherId of coerceFreeSpaceConnectionIds(current.connections)) {
      if (!out.has(otherId) && byId.has(otherId)) stack.push(otherId);
    }
    for (const other of objects) {
      if (other.id === currentId || out.has(other.id)) continue;
      if (coerceFreeSpaceConnectionIds(other.connections).includes(currentId)) {
        stack.push(other.id);
      }
    }
  }
  return [...out];
}

function nearestIds(
  anchorId: string,
  objects: ProjectSpaceObject[],
  positions: PositionMap,
  limit = 4,
): string[] {
  const anchor = objectCenter(anchorId, positions);
  if (!anchor) return [];
  return objects
    .filter(object => object.id !== anchorId)
    .map(object => {
      const center = objectCenter(object.id, positions);
      if (!center) return null;
      return {
        id: object.id,
        distance: Math.hypot(center.x - anchor.x, center.y - anchor.y),
      };
    })
    .filter((item): item is { id: string; distance: number } => !!item)
    .sort((left, right) => left.distance - right.distance)
    .slice(0, limit)
    .map(item => item.id);
}

function isNotebookLike(object: ProjectSpaceObject | undefined): boolean {
  return !!object && (object.type === 'notebook' || object.type === 'note');
}

function inferIntent(
  focusMode: FocusMode | null,
  clusterObjects: ProjectSpaceObject[],
): WorkspaceContinuityIntent {
  if (focusMode === 'reading') return 'reading';
  if (focusMode === 'solving') return 'solving';
  if (focusMode === 'review') return 'reviewing';
  if (focusMode === 'thinking') return 'thinking';

  const hasPdf = clusterObjects.some(object => object.type === 'pdf');
  const hasMistake = clusterObjects.some(object => object.type === 'mistake');
  const hasSolvingTools = clusterObjects.some(
    object => object.type === 'graph' || object.type === 'calculator',
  );
  const hasThinkingCompanion = clusterObjects.some(object => {
    if (object.type !== 'companion') return false;
    const content = ensureProjectObjectContent('companion', object.content);
    return content.type === 'companion' && (
      getCompanionKind(content.url, content.title, content.description) === 'ai' ||
      getCompanionKind(content.url, content.title, content.description) === 'research' ||
      getCompanionKind(content.url, content.title, content.description) === 'docs'
    );
  });

  if (hasPdf) return 'reading';
  if (hasSolvingTools) return 'solving';
  if (hasMistake) return 'reviewing';
  if (hasThinkingCompanion || clusterObjects.length >= 3) return 'thinking';
  return 'general';
}

function recentCompanionIds(objects: ProjectSpaceObject[], preferredIds: string[]): string[] {
  const preferred = new Set(preferredIds);
  const now = Date.now();
  const ranked = objects
    .filter(object => object.type === 'companion')
    .map(object => {
      const content = ensureProjectObjectContent('companion', object.content);
      if (content.type !== 'companion') return null;
      const lastOpenedAt = content.lastOpenedAt ?? 0;
      const score =
        (preferred.has(object.id) ? 10_000_000_000 : 0) +
        (lastOpenedAt > now - COMPANION_WINDOW_MS ? lastOpenedAt : 0);
      return score > 0 ? { id: object.id, score } : null;
    })
    .filter((item): item is { id: string; score: number } => !!item)
    .sort((left, right) => right.score - left.score)
    .map(item => item.id);
  return uniqueIds(ranked).slice(0, 3);
}

function connectionKeysForIds(ids: string[], objects: ProjectSpaceObject[]): string[] {
  const include = new Set(ids);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const object of objects) {
    if (!include.has(object.id)) continue;
    for (const otherId of coerceFreeSpaceConnectionIds(object.connections)) {
      if (!include.has(otherId) || otherId === object.id) continue;
      const key = edgeKey(object.id, otherId);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(key);
    }
  }
  return out.slice(0, 8);
}

function objectById(objects: ProjectSpaceObject[], id: string | null | undefined) {
  return id ? objects.find(object => object.id === id) : undefined;
}

function titleForResume(object: ProjectSpaceObject | undefined): string {
  if (!object) return 'this workspace';
  return object.title || 'this workspace';
}

function subtitleForResume(
  intent: WorkspaceContinuityIntent,
  object: ProjectSpaceObject | undefined,
): string {
  const title = titleForResume(object);
  if (!object) return 'The space remembers where your thinking left off.';
  switch (intent) {
    case 'reading':
      return `You were reading ${title}.`;
    case 'solving':
      return `You were solving around ${title}.`;
    case 'reviewing':
      return `You were reviewing ${title}.`;
    case 'thinking':
      return `You were developing ${title}.`;
    default:
      return `You were working with ${title}.`;
  }
}

function clampFinite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function sanitizeIds(raw: unknown): string[] {
  return Array.isArray(raw)
    ? uniqueIds(raw.filter((item): item is string => typeof item === 'string' && !!item))
    : [];
}

export function loadWorkspaceContinuityMemory(sectionId: string): WorkspaceContinuityMemory | null {
  if (!sectionId) return null;
  try {
    const raw = localStorage.getItem(storageKey(sectionId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    const value = asObject(parsed);
    if (!value) return null;
    const viewportValue = asObject(value.viewport);
    return {
      version: VERSION,
      sectionId,
      savedAt: clampFinite(Number(value.savedAt), Date.now()),
      lastSelectedObjectId:
        typeof value.lastSelectedObjectId === 'string' ? value.lastSelectedObjectId : null,
      recentObjectIds: sanitizeIds(value.recentObjectIds),
      nearbyObjectIds: sanitizeIds(value.nearbyObjectIds),
      activeClusterObjectIds: sanitizeIds(value.activeClusterObjectIds),
      recentConnectionKeys: sanitizeIds(value.recentConnectionKeys),
      activeFocusMode:
        value.activeFocusMode === 'reading' ||
        value.activeFocusMode === 'solving' ||
        value.activeFocusMode === 'review' ||
        value.activeFocusMode === 'thinking'
          ? value.activeFocusMode
          : null,
      recentNotebookId:
        typeof value.recentNotebookId === 'string' ? value.recentNotebookId : null,
      openCompanionIds: sanitizeIds(value.openCompanionIds),
      viewport: {
        zoom: clampFinite(Number(viewportValue?.zoom), 1),
        panX: clampFinite(Number(viewportValue?.panX), 40),
        panY: clampFinite(Number(viewportValue?.panY), 40),
      },
      intent:
        value.intent === 'reading' ||
        value.intent === 'solving' ||
        value.intent === 'reviewing' ||
        value.intent === 'thinking'
          ? value.intent
          : 'general',
    };
  } catch {
    return null;
  }
}

export function saveWorkspaceContinuityMemory(
  sectionId: string,
  memory: WorkspaceContinuityMemory,
): void {
  if (!sectionId) return;
  try {
    localStorage.setItem(storageKey(sectionId), JSON.stringify(memory));
  } catch {
    /* quota */
  }
}

export function isRecentWorkspaceContinuity(memory: WorkspaceContinuityMemory | null): boolean {
  if (!memory) return false;
  return Date.now() - memory.savedAt < RECENT_HOURS * 60 * 60 * 1000;
}

export function buildWorkspaceContinuityMemory({
  sectionId,
  objects,
  positions,
  selectedId,
  lastSelectedId,
  recentNotebookId,
  focusMode,
  zoom,
  panX,
  panY,
}: BuildMemoryArgs): WorkspaceContinuityMemory {
  const effectiveAnchorId =
    objectById(objects, selectedId)?.id ??
    objectById(objects, lastSelectedId)?.id ??
    objectById(objects, recentNotebookId)?.id ??
    objects[0]?.id ??
    null;

  const graphClusterIds = effectiveAnchorId ? connectedCluster(effectiveAnchorId, objects) : [];
  const spatialIds = effectiveAnchorId ? nearestIds(effectiveAnchorId, objects, positions, 4) : [];
  const activeClusterObjectIds = uniqueIds([
    ...(effectiveAnchorId ? [effectiveAnchorId] : []),
    ...graphClusterIds,
    ...spatialIds,
  ]).slice(0, 7);

  const clusterObjects = activeClusterObjectIds
    .map(id => objectById(objects, id))
    .filter((object): object is ProjectSpaceObject => !!object);

  const nearbyObjectIds = activeClusterObjectIds.filter(id => id !== effectiveAnchorId).slice(0, 4);
  const openCompanionIds = recentCompanionIds(objects, activeClusterObjectIds);
  const intent = inferIntent(focusMode, clusterObjects);

  return {
    version: VERSION,
    sectionId,
    savedAt: Date.now(),
    lastSelectedObjectId: effectiveAnchorId,
    recentObjectIds: activeClusterObjectIds.slice(0, 5),
    nearbyObjectIds,
    activeClusterObjectIds,
    recentConnectionKeys: connectionKeysForIds(activeClusterObjectIds, objects),
    activeFocusMode: focusMode,
    recentNotebookId:
      isNotebookLike(objectById(objects, recentNotebookId))
        ? recentNotebookId
        : isNotebookLike(objectById(objects, effectiveAnchorId))
          ? effectiveAnchorId
          : null,
    openCompanionIds,
    viewport: {
      zoom: clampFinite(zoom, 1),
      panX: clampFinite(panX, 40),
      panY: clampFinite(panY, 40),
    },
    intent,
  };
}

export function buildWorkspaceResumeCopy(
  memory: WorkspaceContinuityMemory | null,
  objects: ProjectSpaceObject[],
): WorkspaceResumeCopy | null {
  if (!memory || !isRecentWorkspaceContinuity(memory)) return null;
  const anchor = objectById(objects, memory.lastSelectedObjectId);
  const companions = memory.openCompanionIds
    .map(id => objectById(objects, id))
    .filter((object): object is ProjectSpaceObject => !!object);
  const details: string[] = [];
  if (memory.activeFocusMode) {
    details.push(`${memory.activeFocusMode[0]?.toUpperCase() ?? ''}${memory.activeFocusMode.slice(1)} focus was active.`);
  }
  if (memory.activeClusterObjectIds.length > 1) {
    details.push(`${memory.activeClusterObjectIds.length} nearby objects were part of the same cluster.`);
  }
  if (companions.length > 0) {
    details.push(`${companions.length} companion${companions.length === 1 ? '' : 's'} were active.`);
  }
  const needsReview = countNeedsReviewMistakes(objects);
  if (needsReview > 0) {
    details.push(
      needsReview === 1
        ? 'One mistake is ready to revisit.'
        : `${needsReview} mistakes are ready to revisit.`,
    );
  }
  const source = anchor ? findLinkedSource(anchor, objects) : null;
  const notebook = anchor ? findLinkedNotebook(anchor, objects) : null;
  if (source && anchor?.type !== 'pdf') {
    details.push(`Linked source: ${titleForResume(source)}.`);
  }
  if (notebook && anchor && notebook.id !== anchor.id) {
    details.push(`Notebook: ${titleForResume(notebook)}.`);
  }
  return {
    headline: `Last active ${formatTimeAgo(memory.savedAt)}`,
    subtitle: subtitleForResume(memory.intent, anchor),
    details: details.slice(0, 4),
  };
}

function choosePrimaryCompanion(memory: WorkspaceContinuityMemory, objects: ProjectSpaceObject[]) {
  return memory.openCompanionIds
    .map(id => objectById(objects, id))
    .find((object): object is ProjectSpaceObject => !!object && object.type === 'companion');
}

function chooseReadingTarget(memory: WorkspaceContinuityMemory, objects: ProjectSpaceObject[]) {
  return memory.activeClusterObjectIds
    .map(id => objectById(objects, id))
    .find((object): object is ProjectSpaceObject => !!object && object.type === 'pdf');
}

function chooseReviewTarget(memory: WorkspaceContinuityMemory, objects: ProjectSpaceObject[]) {
  return memory.activeClusterObjectIds
    .map(id => objectById(objects, id))
    .find((object): object is ProjectSpaceObject => !!object && object.type === 'mistake');
}

function chooseSolvingTarget(memory: WorkspaceContinuityMemory, objects: ProjectSpaceObject[]) {
  return memory.activeClusterObjectIds
    .map(id => objectById(objects, id))
    .find((object): object is ProjectSpaceObject =>
      !!object &&
      (object.type === 'graph' || object.type === 'calculator' || object.type === 'companion'),
    );
}

export function buildWorkspaceContinuitySuggestions(
  memory: WorkspaceContinuityMemory | null,
  objects: ProjectSpaceObject[],
): WorkspaceContinuitySuggestion[] {
  if (!memory || !isRecentWorkspaceContinuity(memory)) return [];
  const suggestions: WorkspaceContinuitySuggestion[] = [];
  const push = (item: WorkspaceContinuitySuggestion) => {
    if (suggestions.some(existing => existing.id === item.id)) return;
    suggestions.push(item);
  };

  const anchor = objectById(objects, memory.lastSelectedObjectId);
  if (anchor) {
    push({
      id: 'resume-anchor',
      label: `Continue ${titleForResume(anchor)}`,
      subtitle: 'Return to the last focused object and working region.',
      objectId: anchor.id,
      focusMode: memory.activeFocusMode,
    });
  }

  const readingTarget = chooseReadingTarget(memory, objects);
  if (readingTarget) {
    push({
      id: 'resume-reading',
      label: `Resume reading ${titleForResume(readingTarget)}`,
      subtitle: 'Bring the previous reading surface back into view.',
      objectId: readingTarget.id,
      focusMode: 'reading',
    });
  }

  const reviewTarget = chooseReviewTarget(memory, objects);
  if (reviewTarget) {
    push({
      id: 'resume-review',
      label: 'Continue reviewing mistakes',
      subtitle: 'Return to the mistake cluster you were using.',
      objectId: reviewTarget.id,
      focusMode: 'review',
    });
  }

  const dueCount = countNeedsReviewMistakes(objects);
  if (dueCount > 0) {
    push({
      id: 'resume-mistake-loop',
      label: dueCount === 1 ? 'Revisit 1 mistake' : `Revisit ${dueCount} mistakes`,
      subtitle: 'Pick up slips that still need attention.',
      focusMode: 'review',
    });
  }

  const solvingTarget = chooseSolvingTarget(memory, objects);
  if (solvingTarget && (memory.intent === 'solving' || memory.activeFocusMode === 'solving')) {
    push({
      id: 'resume-solving',
      label: 'Continue solving cluster',
      subtitle: 'Restore the graph, calculator, and nearby notes.',
      objectId: solvingTarget.id,
      focusMode: 'solving',
    });
  }

  const companion = choosePrimaryCompanion(memory, objects);
  if (companion) {
    push({
      id: 'resume-companion',
      label: `Reopen ${titleForResume(companion)}`,
      subtitle: 'Bring the companion back into the flow.',
      objectId: companion.id,
      openCompanion: true,
      focusMode: memory.activeFocusMode,
    });
  }

  return suggestions.slice(0, 3);
}

export function formatTimeAgo(ts: number): string {
  const diff = Math.max(0, Date.now() - ts);
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}
