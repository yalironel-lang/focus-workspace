/**
 * Lightweight study graph helpers — uses existing `connections` + optional lineage ids.
 * No separate link store; pure derivation for UI and auto-linking on create.
 */

import type { WorkspaceContinuityMemory } from './workspaceContinuity';
import {
  coerceFreeSpaceConnectionIds,
  ensureProjectObjectContent,
  type ProjectSpaceObject,
} from '../hooks/useSectionFreeSpaceObjects';
import {
  buildMistakeReviewQueue,
  computeMistakeInsights,
  countNeedsReviewMistakes,
  type MistakeInsight,
} from './mistakeIntelligence';

export interface StudyLineage {
  sourceObjectId: string | null;
  sourceTitle: string | null;
  notebookId: string | null;
  notebookTitle: string | null;
  relatedMistakeIds: string[];
}

export type StudyLoopActionKind =
  | 'review-mistakes'
  | 'resume-object'
  | 'resume-source'
  | 'resume-notebook'
  | 'insight';

export interface StudyLoopAction {
  id: string;
  kind: StudyLoopActionKind;
  label: string;
  subtitle: string;
  objectId?: string;
  reviewMode?: 'all' | 'neglected' | 'low';
  insight?: MistakeInsight;
}

const MS_DAY = 86_400_000;

function byId(objects: ProjectSpaceObject[]): Map<string, ProjectSpaceObject> {
  return new Map(objects.map(o => [o.id, o]));
}

function titleOf(o: ProjectSpaceObject | undefined): string {
  if (!o) return '';
  if (o.type === 'pdf') {
    const c = ensureProjectObjectContent('pdf', o.content);
    if (c.type === 'pdf' && c.fileName) return c.fileName;
  }
  return o.title || 'Untitled';
}

function neighborIds(object: ProjectSpaceObject, objects: ProjectSpaceObject[]): string[] {
  const out = new Set<string>();
  for (const id of coerceFreeSpaceConnectionIds(object.connections)) {
    if (objects.some(o => o.id === id)) out.add(id);
  }
  for (const other of objects) {
    if (other.id === object.id) continue;
    if (coerceFreeSpaceConnectionIds(other.connections).includes(object.id)) out.add(other.id);
  }
  return [...out];
}

export function findLinkedSource(
  object: ProjectSpaceObject,
  objects: ProjectSpaceObject[],
): ProjectSpaceObject | null {
  const map = byId(objects);
  if (object.type === 'pdf') return object;

  const content =
    object.type === 'mistake' ? ensureProjectObjectContent('mistake', object.content) : null;
  if (content?.type === 'mistake' && content.sourceObjectId) {
    const fromLineage = map.get(content.sourceObjectId);
    if (fromLineage?.type === 'pdf') return fromLineage;
  }

  for (const id of neighborIds(object, objects)) {
    const n = map.get(id);
    if (n?.type === 'pdf') return n;
  }
  return null;
}

export function findLinkedNotebook(
  object: ProjectSpaceObject,
  objects: ProjectSpaceObject[],
): ProjectSpaceObject | null {
  const map = byId(objects);
  if (object.type === 'notebook' || object.type === 'note') return object;
  for (const id of neighborIds(object, objects)) {
    const n = map.get(id);
    if (n && (n.type === 'notebook' || n.type === 'note')) return n;
  }
  return null;
}

export function findRelatedMistakes(
  object: ProjectSpaceObject,
  objects: ProjectSpaceObject[],
): ProjectSpaceObject[] {
  const map = byId(objects);
  const ids = new Set<string>();
  if (object.type === 'mistake') ids.add(object.id);
  for (const id of neighborIds(object, objects)) {
    const n = map.get(id);
    if (n?.type === 'mistake') ids.add(n.id);
  }
  return [...ids].map(id => map.get(id)!).filter(Boolean);
}

export function deriveStudyLineage(
  objectId: string | null | undefined,
  objects: ProjectSpaceObject[],
): StudyLineage {
  if (!objectId) {
    return {
      sourceObjectId: null,
      sourceTitle: null,
      notebookId: null,
      notebookTitle: null,
      relatedMistakeIds: [],
    };
  }
  const current = objects.find(o => o.id === objectId);
  if (!current) {
    return {
      sourceObjectId: null,
      sourceTitle: null,
      notebookId: null,
      notebookTitle: null,
      relatedMistakeIds: [],
    };
  }
  const source = findLinkedSource(current, objects);
  const notebook = findLinkedNotebook(current, objects);
  const mistakes = findRelatedMistakes(current, objects);
  return {
    sourceObjectId: source?.id ?? null,
    sourceTitle: source ? titleOf(source) : null,
    notebookId: notebook?.id ?? null,
    notebookTitle: notebook ? titleOf(notebook) : null,
    relatedMistakeIds: mistakes.map(m => m.id),
  };
}

export function pickStudyLinkTargets(
  anchorId: string | null | undefined,
  objects: ProjectSpaceObject[],
): { connectTo: string[]; sourceObjectId: string | null } {
  if (!anchorId) return { connectTo: [], sourceObjectId: null };
  const anchor = objects.find(o => o.id === anchorId);
  if (!anchor) return { connectTo: [], sourceObjectId: null };

  const connectTo = new Set<string>([anchor.id]);
  let sourceObjectId: string | null = null;

  if (anchor.type === 'pdf') {
    sourceObjectId = anchor.id;
  } else if (anchor.type === 'notebook' || anchor.type === 'note') {
    const pdf = findLinkedSource(anchor, objects);
    if (pdf) {
      connectTo.add(pdf.id);
      sourceObjectId = pdf.id;
    }
  } else if (anchor.type === 'mistake') {
    const pdf = findLinkedSource(anchor, objects);
    if (pdf) sourceObjectId = pdf.id;
    const nb = findLinkedNotebook(anchor, objects);
    if (nb) connectTo.add(nb.id);
  } else {
    const pdf = findLinkedSource(anchor, objects);
    if (pdf) {
      connectTo.add(pdf.id);
      sourceObjectId = pdf.id;
    }
  }

  return { connectTo: [...connectTo], sourceObjectId };
}

export function buildStudyLoopActions(
  objects: ProjectSpaceObject[],
  continuity: WorkspaceContinuityMemory | null,
  now = Date.now(),
): StudyLoopAction[] {
  const actions: StudyLoopAction[] = [];
  const push = (item: StudyLoopAction) => {
    if (actions.some(a => a.id === item.id)) return;
    actions.push(item);
  };

  const needsReview = countNeedsReviewMistakes(objects, now);
  if (needsReview > 0) {
    push({
      id: 'review-due',
      kind: 'review-mistakes',
      label:
        needsReview === 1
          ? '1 mistake needs review'
          : `${needsReview} mistakes to revisit`,
      subtitle: 'Gentle pass over what still feels fragile.',
      reviewMode: needsReview >= 3 ? 'neglected' : 'all',
    });
  }

  const insights = computeMistakeInsights(objects, now);
  const tagInsight = insights.find(i => i.kind === 'tag_pattern');
  if (tagInsight) {
    push({
      id: `insight-${tagInsight.id}`,
      kind: 'insight',
      label: tagInsight.message.split('—')[0]?.trim() || 'Pattern in your mistakes',
      subtitle: tagInsight.message,
      insight: tagInsight,
      reviewMode: 'all',
    });
  }

  if (continuity?.lastSelectedObjectId) {
    const anchor = objects.find(o => o.id === continuity.lastSelectedObjectId);
    if (anchor) {
      const ago = Math.round((now - continuity.savedAt) / MS_DAY);
      const when = ago < 1 ? 'earlier today' : ago === 1 ? 'yesterday' : `${ago} days ago`;
      push({
        id: 'resume-anchor',
        kind: 'resume-object',
        label: `Continue ${titleOf(anchor)}`,
        subtitle: `You were here ${when}.`,
        objectId: anchor.id,
      });
    }
  }

  const pdf =
    continuity?.activeClusterObjectIds
      .map(id => objects.find(o => o.id === id))
      .find(o => o?.type === 'pdf') ??
    objects.find(o => o.type === 'pdf' && o.updatedAt > now - 5 * MS_DAY);

  if (pdf && pdf.id !== continuity?.lastSelectedObjectId) {
    push({
      id: 'resume-source',
      kind: 'resume-source',
      label: `Return to ${titleOf(pdf)}`,
      subtitle: 'Pick up the source you were reading.',
      objectId: pdf.id,
    });
  }

  const notebookId = continuity?.recentNotebookId;
  const notebook = notebookId ? objects.find(o => o.id === notebookId) : null;
  if (notebook && (notebook.type === 'notebook' || notebook.type === 'note')) {
    push({
      id: 'resume-notebook',
      kind: 'resume-notebook',
      label: `Open ${titleOf(notebook)}`,
      subtitle: 'Your latest writing surface.',
      objectId: notebook.id,
    });
  }

  const queue = buildMistakeReviewQueue(objects, now);
  if (queue.length > 0 && needsReview === 0) {
    push({
      id: 'review-queue',
      kind: 'review-mistakes',
      label: 'Quick mistake review',
      subtitle: 'A short loop while memory is still warm.',
      reviewMode: 'all',
    });
  }

  return actions.slice(0, 4);
}

export { mistakeNeedsReview, mistakeReviewLabel } from './mistakeIntelligence';
