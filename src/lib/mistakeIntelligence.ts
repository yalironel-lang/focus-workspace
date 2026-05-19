/**
 * Local heuristics for mistake patterns — no network, no ML.
 * Keep pure for memoization from callers.
 */

import type { ProjectSpaceObject } from '../hooks/useSectionFreeSpaceObjects';
import { coerceFreeSpaceConnectionIds } from '../hooks/useSectionFreeSpaceObjects';

export type MistakeInsightKind = 'tag_pattern' | 'cluster' | 'neglected' | 'low_confidence';

export interface MistakeInsight {
  id: string;
  kind: MistakeInsightKind;
  message: string;
  relatedIds: string[];
}

function isMistake(o: ProjectSpaceObject): boolean {
  return o.type === 'mistake';
}

export function mistakeContent(o: ProjectSpaceObject): {
  tags: string[];
  confidence: string;
  timesReviewed: number;
  lastReviewedAt: number | null;
  sourceObjectId: string | null;
} | null {
  if (o.type !== 'mistake' || !o.content || typeof o.content !== 'object') return null;
  const c = o.content as Record<string, unknown>;
  if (c.type !== 'mistake') return null;
  const tags = Array.isArray(c.tags)
    ? (c.tags as unknown[]).map(t => (typeof t === 'string' ? t.trim().toLowerCase() : '')).filter(Boolean)
    : [];
  const sourceRaw = c.sourceObjectId;
  const sourceObjectId =
    typeof sourceRaw === 'string' && sourceRaw.trim() ? sourceRaw.trim() : null;
  return {
    tags,
    confidence: typeof c.confidence === 'string' ? c.confidence : 'low',
    timesReviewed: typeof c.timesReviewed === 'number' && Number.isFinite(c.timesReviewed) ? c.timesReviewed : 0,
    lastReviewedAt:
      typeof c.lastReviewedAt === 'number' && Number.isFinite(c.lastReviewedAt) ? c.lastReviewedAt : null,
    sourceObjectId,
  };
}

const MS_DAY = 86_400_000;

/** Lightweight “due for revisit” — not spaced repetition. */
export function mistakeNeedsReview(
  m: {
    confidence: string;
    timesReviewed: number;
    lastReviewedAt: number | null;
  },
  now = Date.now(),
): boolean {
  if (m.confidence === 'mastered') return false;
  const daysSince =
    m.lastReviewedAt != null ? (now - m.lastReviewedAt) / MS_DAY : 999;
  if (m.confidence === 'low') return daysSince >= 2 || m.timesReviewed === 0;
  if (m.confidence === 'medium') return daysSince >= 6;
  if (m.confidence === 'high') return daysSince >= 14;
  return daysSince >= 3;
}

export function mistakeReviewLabel(
  m: {
    confidence: string;
    timesReviewed: number;
    lastReviewedAt: number | null;
  },
  now = Date.now(),
): string {
  if (m.confidence === 'mastered') return 'Quiet for now';
  if (!mistakeNeedsReview(m, now)) {
    if (m.lastReviewedAt == null) return 'Not reviewed yet';
    const d = Math.floor((now - m.lastReviewedAt) / MS_DAY);
    if (d <= 0) return 'Reviewed today';
    if (d === 1) return 'Reviewed yesterday';
    return `Settling · ${d}d since review`;
  }
  const daysSince =
    m.lastReviewedAt != null ? Math.floor((now - m.lastReviewedAt) / MS_DAY) : null;
  if (daysSince == null || m.timesReviewed === 0) return 'Needs first review';
  if (daysSince >= 14) return 'Long quiet — worth revisiting';
  if (daysSince >= 7) return 'Due for revisit';
  return 'Needs review';
}

/** Priority score: higher = review sooner. Heuristic, not SM-2. */
export function mistakeReviewScore(o: ProjectSpaceObject, now: number): number {
  const m = mistakeContent(o);
  if (!m) return -1e9;
  if (m.confidence === 'mastered') return -800 + m.timesReviewed * 0.1;

  const confW = m.confidence === 'low' ? 4 : m.confidence === 'medium' ? 2.5 : 1.5;
  const daysSince = m.lastReviewedAt != null ? (now - m.lastReviewedAt) / MS_DAY : 400;
  const neglect = Math.min(120, daysSince) * 2.2;
  const lowReviewBoost = Math.max(0, 6 - Math.min(m.timesReviewed, 6)) * 3;
  return confW * 38 + neglect + lowReviewBoost;
}

export function countNeedsReviewMistakes(objects: ProjectSpaceObject[], now = Date.now()): number {
  return objects.filter(o => {
    if (o.type !== 'mistake') return false;
    const m = mistakeContent(o);
    return m != null && mistakeNeedsReview(m, now);
  }).length;
}

export function buildMistakeReviewQueue(objects: ProjectSpaceObject[], now = Date.now()): string[] {
  const mistakes = objects.filter(isMistake);
  return [...mistakes]
    .map(o => ({ id: o.id, score: mistakeReviewScore(o, now) }))
    .filter(x => x.score > -500)
    .sort((a, b) => b.score - a.score)
    .map(x => x.id);
}

export function buildMistakeReviewQueueFiltered(
  objects: ProjectSpaceObject[],
  mode: 'all' | 'neglected' | 'low',
  now = Date.now(),
): string[] {
  const base = buildMistakeReviewQueue(objects, now);
  if (mode === 'all') return base;

  return base.filter(id => {
    const o = objects.find(x => x.id === id);
    if (!o || !isMistake(o)) return false;
    const m = mistakeContent(o);
    if (!m) return false;
    if (mode === 'low') {
      return m.confidence === 'low' || m.confidence === 'medium';
    }
    // neglected
    const ageDays = (now - o.createdAt) / MS_DAY;
    const daysSince =
      m.lastReviewedAt != null ? (now - m.lastReviewedAt) / MS_DAY : ageDays + 1;
    return daysSince >= 10 && ageDays > 2;
  });
}

export function computeMistakeInsights(objects: ProjectSpaceObject[], now = Date.now()): MistakeInsight[] {
  const mistakes = objects.filter(isMistake);
  if (mistakes.length === 0) return [];

  const insights: MistakeInsight[] = [];
  let insightSeq = 0;
  const nextId = (kind: MistakeInsightKind) => `mi-${kind}-${insightSeq++}`;

  // Repeated tags (≥2 mistakes share a tag, tag appears on ≥2 cards)
  const tagToIds = new Map<string, Set<string>>();
  for (const o of mistakes) {
    const m = mistakeContent(o);
    if (!m) continue;
    for (const t of m.tags) {
      if (!tagToIds.has(t)) tagToIds.set(t, new Set());
      tagToIds.get(t)!.add(o.id);
    }
  }
  for (const [tag, ids] of tagToIds) {
    if (ids.size < 2 || !tag) continue;
    insights.push({
      id: nextId('tag_pattern'),
      kind: 'tag_pattern',
      message: `You often revisit “${tag}” — ${ids.size} mistakes share this tag.`,
      relatedIds: [...ids],
    });
  }

  // Low confidence surface
  const lowIds = mistakes.filter(o => {
    const m = mistakeContent(o);
    return m && (m.confidence === 'low' || m.confidence === 'medium');
  }).map(o => o.id);
  if (lowIds.length >= 2) {
    insights.push({
      id: nextId('low_confidence'),
      kind: 'low_confidence',
      message: `${lowIds.length} mistakes are still marked fragile — worth a slow pass.`,
      relatedIds: lowIds.slice(0, 12),
    });
  }

  // Neglected
  const neglected = mistakes.filter(o => {
    const m = mistakeContent(o);
    if (!m || m.confidence === 'mastered') return false;
    const ageDays = (now - o.createdAt) / MS_DAY;
    const daysSince = m.lastReviewedAt != null ? (now - m.lastReviewedAt) / MS_DAY : ageDays + 2;
    return daysSince >= 12 && ageDays > 3;
  });
  if (neglected.length >= 1) {
    insights.push({
      id: nextId('neglected'),
      kind: 'neglected',
      message:
        neglected.length === 1
          ? 'One mistake has been quiet for a long while.'
          : `${neglected.length} mistakes have not been revisited recently.`,
      relatedIds: neglected.map(o => o.id).slice(0, 16),
    });
  }

  // Tight clusters among mistakes (≥2 mutual links in mistake subgraph)
  const mistakeSet = new Set(mistakes.map(o => o.id));
  const pairCount = new Map<string, number>();
  for (const o of mistakes) {
    const neigh = coerceFreeSpaceConnectionIds(o.connections).filter(id => mistakeSet.has(id) && id !== o.id);
    for (const v of neigh) {
      const a = o.id < v ? o.id : v;
      const b = o.id < v ? v : o.id;
      const k = `${a}|${b}`;
      pairCount.set(k, (pairCount.get(k) ?? 0) + 1);
    }
  }
  const clusterIds = new Set<string>();
  for (const [k, c] of pairCount) {
    if (c >= 1) {
      const [a, b] = k.split('|');
      clusterIds.add(a);
      clusterIds.add(b);
    }
  }
  if (clusterIds.size >= 3) {
    insights.push({
      id: nextId('cluster'),
      kind: 'cluster',
      message: 'A cluster of mistakes is tightly linked — they may share one confusion.',
      relatedIds: [...clusterIds].slice(0, 10),
    });
  }

  return insights.slice(0, 8);
}
