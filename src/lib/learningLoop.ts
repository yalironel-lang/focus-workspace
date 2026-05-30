/**
 * V1 Learning Loop — Attempt → Confusion → Repair → Re-attempt → Improvement
 * Minimal helpers; uses existing mistake objects as confusion carriers.
 */

import type { ProjectObjectContent, ProjectSpaceObject } from '../hooks/useSectionFreeSpaceObjects';
import {
  coerceFreeSpaceConnectionIds,
  ensureProjectObjectContent,
} from '../hooks/useSectionFreeSpaceObjects';
import { findLinkedNotebook, findLinkedSource } from './studyConnections';
import { mistakeNeedsReview } from './mistakeIntelligence';

export type LearningAttemptOutcome = 'pass' | 'fail';

export type LearningAttemptTargetKind = 'mistake' | 'note' | 'notebook' | 'pdf' | 'studyfile';

export interface LearningAttemptTarget {
  kind: LearningAttemptTargetKind;
  objectId: string;
}

export interface LearningAttemptRecord {
  at: number;
  outcome: LearningAttemptOutcome;
  belief?: string;
}

export type MistakeLearningBody = Extract<ProjectObjectContent, { type: 'mistake' }>;

const RE_ATTEMPT_AFTER_REPAIR_MS = 48 * 60 * 60 * 1000;

export function learningLoopFields(content: MistakeLearningBody) {
  return {
    loopOpen: content.loopOpen !== false,
    pendingReAttempt: content.pendingReAttempt === true,
    repairedAt: content.repairedAt ?? null,
    lastAttemptOutcome: content.lastAttemptOutcome ?? null,
    lastAttemptAt: content.lastAttemptAt ?? null,
    confusionBelief: content.confusionBelief ?? '',
    anchorObjectId: content.anchorObjectId ?? null,
    attemptHistory: content.attemptHistory ?? [],
  };
}

/** Loop is fully closed — no further closed-book attempts required. */
export function isLearningLoopClosed(content: MistakeLearningBody): boolean {
  if (content.loopOpen === false) return true;
  if (content.confidence === 'mastered' && content.pendingReAttempt !== true) return true;
  return false;
}

/**
 * Loop needs re-entry / queue attention (failed attempt or awaiting re-attempt).
 * Legacy mistakes with only `whatWrong` text are not active until the user engages the loop.
 */
export function isLearningLoopActive(content: MistakeLearningBody): boolean {
  if (isLearningLoopClosed(content)) return false;
  if (content.pendingReAttempt === true) return true;
  if (content.lastAttemptOutcome === 'fail') return true;
  return false;
}

/** @alias isLearningLoopActive */
export function isLearningLoopOpen(content: MistakeLearningBody): boolean {
  return isLearningLoopActive(content);
}

export function needsReAttempt(content: MistakeLearningBody): boolean {
  if (!isLearningLoopOpen(content)) return false;
  if (!content.pendingReAttempt) return false;
  if (content.lastAttemptOutcome === 'pass') return false;
  return true;
}

export function reAttemptOverdue(content: MistakeLearningBody, now = Date.now()): boolean {
  if (!needsReAttempt(content)) return false;
  const repairedAt = content.repairedAt;
  if (repairedAt == null) return true;
  return now - repairedAt >= RE_ATTEMPT_AFTER_REPAIR_MS;
}

export function hasRepairLink(object: ProjectSpaceObject, objects: ProjectSpaceObject[]): boolean {
  if (object.type !== 'mistake') return false;
  const c = ensureProjectObjectContent('mistake', object.content);
  if (c.type !== 'mistake') return false;
  if (c.sourceObjectId && objects.some(o => o.id === c.sourceObjectId)) return true;
  if (c.anchorObjectId && objects.some(o => o.id === c.anchorObjectId)) return true;
  const source = findLinkedSource(object, objects);
  if (source) return true;
  const notebook = findLinkedNotebook(object, objects);
  if (notebook) return true;
  for (const id of coerceFreeSpaceConnectionIds(object.connections)) {
    const linked = objects.find(o => o.id === id);
    if (!linked) continue;
    if (linked.type === 'notebook' || linked.type === 'note' || linked.type === 'pdf' || linked.type === 'studyfile') {
      return true;
    }
  }
  return false;
}

export function learningLoopPriorityScore(
  object: ProjectSpaceObject,
  objects: ProjectSpaceObject[],
  now = Date.now(),
): number {
  if (object.type !== 'mistake') return -1;
  const c = ensureProjectObjectContent('mistake', object.content);
  if (c.type !== 'mistake' || !isLearningLoopOpen(c)) return -1;

  let score = 0;
  if (needsReAttempt(c)) score += 1000;
  if (reAttemptOverdue(c, now)) score += 500;
  if (c.lastAttemptOutcome === 'fail') score += 200;
  if (c.pendingReAttempt && !c.repairedAt) score += 150;
  if (mistakeNeedsReview(c, now)) score += 80;
  if (!hasRepairLink(object, objects)) score += 30;
  score += Math.min(40, (c.attemptHistory?.length ?? 0) * 4);
  return score;
}

export function buildLearningLoopQueue(objects: ProjectSpaceObject[], now = Date.now()): string[] {
  return objects
    .filter(o => o.type === 'mistake')
    .map(o => ({ id: o.id, score: learningLoopPriorityScore(o, objects, now) }))
    .filter(x => x.score >= 0)
    .sort((a, b) => b.score - a.score)
    .map(x => x.id);
}

export function choosePrimaryLearningLoopTarget(
  objects: ProjectSpaceObject[],
  now = Date.now(),
): { target: LearningAttemptTarget; label: string; subtitle: string } | null {
  const queue = buildLearningLoopQueue(objects, now);
  const topId = queue[0];
  if (!topId) return null;
  const obj = objects.find(o => o.id === topId);
  if (!obj || obj.type !== 'mistake') return null;
  const c = ensureProjectObjectContent('mistake', obj.content);
  if (c.type !== 'mistake') return null;

  if (needsReAttempt(c)) {
    return {
      target: { kind: 'mistake', objectId: topId },
      label: 'Re-attempt after repair',
      subtitle: obj.title || 'Closed-book check on your fix',
    };
  }
  if (c.lastAttemptOutcome === 'fail') {
    return {
      target: { kind: 'mistake', objectId: topId },
      label: 'Continue confusion repair',
      subtitle: obj.title || 'Finish the learning loop',
    };
  }
  return {
    target: { kind: 'mistake', objectId: topId },
    label: 'Try recall closed-book',
    subtitle: obj.title || 'Attempt before revealing the answer',
  };
}

export function resolveAttemptPrompt(
  target: LearningAttemptTarget,
  objects: ProjectSpaceObject[],
): { title: string; prompt: string; hiddenAnswer: string; isRecall: boolean } | null {
  const obj = objects.find(o => o.id === target.objectId);
  if (!obj) return null;

  if (target.kind === 'mistake' && obj.type === 'mistake') {
    const c = ensureProjectObjectContent('mistake', obj.content);
    if (c.type !== 'mistake') return null;
    const isRecall = c.variant === 'recall';
    return {
      title: obj.title,
      prompt: c.whatWrong || obj.title,
      hiddenAnswer: c.correction,
      isRecall,
    };
  }

  if (target.kind === 'note' && obj.type === 'note') {
    const c = ensureProjectObjectContent('note', obj.content);
    const body = c.type === 'note' ? c.body : '';
    return {
      title: obj.title,
      prompt: obj.title || 'What do you remember from this note?',
      hiddenAnswer: body,
      isRecall: true,
    };
  }

  if (target.kind === 'notebook' && obj.type === 'notebook') {
    const c = ensureProjectObjectContent('notebook', obj.content);
    const subtitle = c.type === 'notebook' ? c.subtitle : '';
    return {
      title: obj.title,
      prompt: subtitle
        ? `Recall: ${obj.title} — ${subtitle}`
        : `Recall key ideas from “${obj.title}” without opening it.`,
      hiddenAnswer: c.type === 'notebook' ? c.body : '',
      isRecall: true,
    };
  }

  if (target.kind === 'pdf' && obj.type === 'pdf') {
    const c = ensureProjectObjectContent('pdf', obj.content);
    const name = c.type === 'pdf' ? c.fileName || obj.title : obj.title;
    return {
      title: obj.title,
      prompt: `What do you remember from “${name}”?`,
      hiddenAnswer: '',
      isRecall: true,
    };
  }

  if (target.kind === 'studyfile' && obj.type === 'studyfile') {
    const c = ensureProjectObjectContent('studyfile', obj.content);
    const name = c.type === 'studyfile' ? c.fileName || obj.title : obj.title;
    return {
      title: obj.title,
      prompt: `Summarize what you retained from “${name}”.`,
      hiddenAnswer: '',
      isRecall: true,
    };
  }

  return null;
}

export function appendAttemptHistory(
  content: MistakeLearningBody,
  outcome: LearningAttemptOutcome,
  belief?: string,
  now = Date.now(),
): MistakeLearningBody {
  const prev = content.attemptHistory ?? [];
  const entry: LearningAttemptRecord = { at: now, outcome, ...(belief?.trim() ? { belief: belief.trim() } : {}) };
  return {
    ...content,
    attemptHistory: [...prev, entry].slice(-24),
    lastAttemptAt: now,
    lastAttemptOutcome: outcome,
  };
}

export function applyAttemptPass(content: MistakeLearningBody, now = Date.now()): MistakeLearningBody {
  const wasPendingReAttempt = content.pendingReAttempt === true;
  let next = appendAttemptHistory(content, 'pass', undefined, now);
  next = {
    ...next,
    timesReviewed: next.timesReviewed + 1,
    lastReviewedAt: now,
    pendingReAttempt: false,
  };
  if (wasPendingReAttempt) {
    next.loopOpen = false;
    next.confidence = 'mastered';
  } else if (next.confidence === 'low') {
    next.confidence = 'medium';
  } else if (next.confidence === 'medium') {
    next.confidence = 'high';
  }
  return next;
}

export function applyAttemptFail(
  content: MistakeLearningBody,
  belief: string,
  now = Date.now(),
): MistakeLearningBody {
  let next = appendAttemptHistory(content, 'fail', belief, now);
  next = {
    ...next,
    confusionBelief: belief.trim(),
    loopOpen: true,
    pendingReAttempt: false,
  };
  if (!next.whyConfused.trim()) {
    next.whyConfused = belief.trim();
  }
  return next;
}

export function applyRepairSaved(content: MistakeLearningBody, now = Date.now()): MistakeLearningBody {
  return {
    ...content,
    repairedAt: now,
    pendingReAttempt: true,
    loopOpen: true,
  };
}

export function inferAnchorObjectId(
  object: ProjectSpaceObject,
  objects: ProjectSpaceObject[],
): string | null {
  if (object.type !== 'mistake') return null;
  const c = ensureProjectObjectContent('mistake', object.content);
  if (c.type !== 'mistake') return null;
  if (c.anchorObjectId && objects.some(o => o.id === c.anchorObjectId)) return c.anchorObjectId;
  const notebook = findLinkedNotebook(object, objects);
  if (notebook) return notebook.id;
  for (const id of coerceFreeSpaceConnectionIds(object.connections)) {
    const linked = objects.find(o => o.id === id);
    if (linked?.type === 'notebook' || linked?.type === 'note') return linked.id;
  }
  return null;
}

export function inferSourceObjectIdForTarget(
  target: LearningAttemptTarget,
  objects: ProjectSpaceObject[],
): string | null {
  if (target.kind === 'mistake') {
    const obj = objects.find(o => o.id === target.objectId);
    if (!obj || obj.type !== 'mistake') return null;
    const c = ensureProjectObjectContent('mistake', obj.content);
    if (c.type === 'mistake' && c.sourceObjectId) return c.sourceObjectId;
    const source = findLinkedSource(obj, objects);
    return source?.id ?? null;
  }
  if (target.kind === 'note' || target.kind === 'notebook' || target.kind === 'pdf' || target.kind === 'studyfile') {
    return target.objectId;
  }
  return null;
}

export function learningTargetFromObject(object: ProjectSpaceObject): LearningAttemptTarget | null {
  if (object.type === 'mistake' || object.type === 'note' || object.type === 'notebook' || object.type === 'pdf' || object.type === 'studyfile') {
    return { kind: object.type, objectId: object.id };
  }
  return null;
}
