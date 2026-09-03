/**
 * Mission Control derivation — pure function, no side effects, no storage.
 *
 * CONTINUE source of truth: `deriveMissionControlContinue`.
 * ACTIVE / FADING remain secondary lists derived from the same object array.
 *
 * Other continuation systems (not unified in this pass):
 * - StudyContinueBanner / study session restore
 * - CourseEntry strip (`resolveCourseEntry` — may share this Continue via sections.next)
 * - workspaceContinuity suggestions
 * - legacy `getContinueTarget` (lane tasks/files)
 */

import type { ProjectSpaceObject } from '../hooks/useSectionFreeSpaceObjects';

// ── Constants ─────────────────────────────────────────────────────────────────

const HOUR = 3_600_000;
const DAY  = 86_400_000;

const ACTIVE_EXCLUDED = new Set(['calculator', 'graph', 'companion', 'mistake']);
const ACTIVE_CAP   = 8;
const FADING_CAP   = 6;
const ACTIVE_WINDOW = 14 * DAY;

/** Study surfaces older than this are ignored for Continue. */
const CONTINUE_MAX_AGE = 14 * DAY;

// ── Text helpers ──────────────────────────────────────────────────────────────

function stripMd(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`(.*?)`/g, '$1')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/^#+\s+/gm, '')
    .replace(/^¶\s*/gm, '')
    .replace(/^!note\s*/gim, '')
    .trim();
}

function firstMeaningfulLine(body: string): string {
  const lines = body.split('\n').map(l => l.trim()).filter(Boolean);
  return stripMd(lines.find(l => !l.startsWith('#')) ?? lines[0] ?? '');
}

function lastMeaningfulLine(body: string): string {
  const lines = body.split('\n').map(l => l.trim()).filter(Boolean);
  const content = lines.filter(l => !l.startsWith('#'));
  return stripMd(content[content.length - 1] ?? lines[lines.length - 1] ?? '');
}

function truncate(text: string, maxWords: number): string {
  const words = text.split(/\s+/).filter(Boolean);
  return words.length <= maxWords ? text : words.slice(0, maxWords).join(' ') + '…';
}

/** Finite timestamps only — malformed values never dominate ranking. */
export function safeTimestamp(value: unknown, fallback = 0): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return fallback;
  return value;
}

export function relativeTime(now: number, then: number): string {
  const t = safeTimestamp(then);
  if (t <= 0) return '';
  const diff = Math.max(0, now - t);
  if (diff < 60_000)     return 'just now';
  if (diff < HOUR)       return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 2 * HOUR)   return '1h ago';
  if (diff < DAY)        return `${Math.floor(diff / HOUR)}h ago`;
  if (diff < 2 * DAY)    return 'yesterday';
  return `${Math.floor(diff / DAY)}d ago`;
}

function recencyBonus(now: number, at: number): number {
  const t = safeTimestamp(at);
  if (t <= 0) return 0;
  const age = now - t;
  if (age < 0) return 0;
  if (age < HOUR)       return 100;
  if (age < 4 * HOUR)   return 80;
  if (age < DAY)        return 50;
  if (age < 3 * DAY)    return 25;
  if (age < CONTINUE_MAX_AGE) return 10;
  return 0;
}

function noteSubstance(body: string): 0 | 1 | 2 {
  const t = stripMd(body).replace(/\s+/g, ' ').trim();
  if (!t) return 0;
  if (t.length < 12) return 1;
  return 2;
}

function notebookSubstance(body: string, subtitle: string | null | undefined): 0 | 1 | 2 {
  const sub = subtitle ? stripMd(subtitle) : '';
  if (sub.length >= 4) return 2;
  return noteSubstance(body);
}

function activityAt(o: ProjectSpaceObject): number {
  if (o.content.type === 'pdf' || o.content.type === 'studyfile') {
    const opened = safeTimestamp(o.content.lastOpenedAt);
    if (opened > 0) return opened;
  }
  const updated = safeTimestamp(o.updatedAt);
  if (updated > 0) return updated;
  return safeTimestamp(o.createdAt);
}

function joinMeta(parts: Array<string | null | undefined | false>): string {
  return parts.filter((p): p is string => typeof p === 'string' && p.length > 0).join(' · ');
}

// ── CONTINUE ──────────────────────────────────────────────────────────────────

export interface NextItem {
  object: ProjectSpaceObject;
  verb: 'Continue' | 'Return to' | 'Revisit' | 'Resolve';
  label: string;
  sublabel: string;
  /** Ranking score — exposed for tests. */
  score?: number;
}

/**
 * Single source of truth for Mission Control Continue.
 *
 * Semantic hierarchy (base bands — recency adds within band):
 * 1. Primary study surfaces — notebook / pdf / studyfile (800+)
 * 2. Other meaningful recent objects — image/link with signal (400+)
 * 3. Capture / unlinked notes with substance (220+)
 * 4. Empty/tiny notes (40+) — never beat a study surface with any recent activity
 * 5. Mistake revisit prompts (150+) — below active study work
 *
 * Rules:
 * - PDF/studyfile eligible WITHOUT graph connections (connections are a small bonus only).
 * - Empty/new notes must not steal Continue from meaningful notebook/PDF work.
 * - Malformed timestamps are treated as 0 (no recency boost).
 * - Only objects in the provided array are considered (section-scoped by caller).
 */
export function deriveMissionControlContinue(
  objects: ProjectSpaceObject[],
  nowInput?: number,
): NextItem | null {
  const now = typeof nowInput === 'number' && Number.isFinite(nowInput) ? nowInput : Date.now();

  let bestScore = -1;
  let bestItem: NextItem | null = null;

  const consider = (score: number, item: NextItem) => {
    if (score > bestScore) {
      bestScore = score;
      bestItem = { ...item, score };
    }
  };

  for (const o of objects) {
    if (!o?.id || !o.content) continue;
    const at = activityAt(o);
    const age = at > 0 ? now - at : Number.POSITIVE_INFINITY;
    const bonus = recencyBonus(now, at);
    const timeLabel = relativeTime(now, at);

    // ── 1. Notebook ─────────────────────────────────────────────────────────
    if (o.content.type === 'notebook') {
      if (age > CONTINUE_MAX_AGE && at > 0) continue;
      const substance = notebookSubstance(o.content.body ?? '', o.content.subtitle);
      const subtitle = o.content.subtitle ? stripMd(o.content.subtitle) : null;
      const lastLine = lastMeaningfulLine(o.content.body ?? '');
      const label = truncate(subtitle || lastLine || o.title || 'Notebook', 12);
      const base = substance >= 2 ? 820 : substance === 1 ? 760 : 700;
      consider(base + bonus, {
        object: o,
        verb: 'Continue',
        label,
        sublabel: joinMeta(['Notebook', timeLabel]),
      });
      continue;
    }

    // ── 1. PDF (connections optional) ───────────────────────────────────────
    if (o.content.type === 'pdf') {
      if (age > CONTINUE_MAX_AGE && at > 0) continue;
      // No lastOpened/updated signal and ancient createdAt → skip
      if (at <= 0) continue;
      const page = typeof o.content.page === 'number' && o.content.page > 1 ? o.content.page : null;
      const conns = o.connections?.length ?? 0;
      const connBonus = conns > 0 ? 12 : 0;
      const pageBonus = page ? 4 : 0;
      const fileName = (o.content.fileName || o.title || 'PDF').trim() || 'PDF';
      consider(800 + bonus + connBonus + pageBonus, {
        object: o,
        verb: 'Continue',
        label: truncate(fileName, 14),
        sublabel: joinMeta([
          'PDF',
          page ? `page ${page}` : null,
          timeLabel,
        ]),
      });
      continue;
    }

    // ── 1. Study file ───────────────────────────────────────────────────────
    if (o.content.type === 'studyfile') {
      if (age > CONTINUE_MAX_AGE && at > 0) continue;
      if (at <= 0) continue;
      const page = typeof o.content.page === 'number' && o.content.page > 1 ? o.content.page : null;
      const conns = o.connections?.length ?? 0;
      const fileName = (o.content.fileName || o.title || 'Study file').trim() || 'Study file';
      consider(790 + bonus + (conns > 0 ? 10 : 0) + (page ? 4 : 0), {
        object: o,
        verb: 'Continue',
        label: truncate(fileName, 14),
        sublabel: joinMeta([
          'Study file',
          page ? `page ${page}` : null,
          timeLabel,
        ]),
      });
      continue;
    }

    // ── 2. Image / link (meaningful recent) ─────────────────────────────────
    if (o.content.type === 'image') {
      if (age > CONTINUE_MAX_AGE) continue;
      const conns = o.connections?.length ?? 0;
      if (conns === 0 && age > DAY) continue;
      consider(420 + bonus + (conns > 0 ? 15 : 0), {
        object: o,
        verb: 'Return to',
        label: truncate(o.title || 'Reference image', 12),
        sublabel: joinMeta(['Image', timeLabel]),
      });
      continue;
    }

    if (o.content.type === 'link') {
      if (age > CONTINUE_MAX_AGE) continue;
      consider(400 + bonus, {
        object: o,
        verb: 'Return to',
        label: truncate(o.content.title || o.content.url || o.title || 'Link', 12),
        sublabel: joinMeta(['Link', timeLabel]),
      });
      continue;
    }

    // ── 3–4. Notes (capture) — never outrank study surfaces via base score ──
    if (o.content.type === 'note') {
      const substance = noteSubstance(o.content.body ?? '');
      const linked = (o.connections?.length ?? 0) > 0;
      // Empty notes: only very recent, lowest band
      if (substance === 0) {
        if (now - safeTimestamp(o.createdAt, now) > DAY) continue;
        consider(40 + Math.min(bonus, 20), {
          object: o,
          verb: 'Resolve',
          label: truncate(o.title || 'Empty note', 10),
          sublabel: joinMeta(['Note', 'empty', timeLabel || 'captured']),
        });
        continue;
      }
      // Unlinked capture with substance
      if (!linked) {
        if (age > 3 * DAY) continue;
        const line = firstMeaningfulLine(o.content.body ?? '');
        consider(220 + bonus + (substance === 2 ? 20 : 0), {
          object: o,
          verb: 'Resolve',
          label: truncate(line || o.title || 'Note', 10),
          sublabel: joinMeta(['Note', 'unlinked', timeLabel]),
        });
        continue;
      }
      // Linked note — mild recent object
      if (age > CONTINUE_MAX_AGE) continue;
      const line = firstMeaningfulLine(o.content.body ?? '');
      consider(380 + bonus, {
        object: o,
        verb: 'Return to',
        label: truncate(line || o.title || 'Note', 10),
        sublabel: joinMeta(['Note', timeLabel]),
      });
      continue;
    }

    // ── 5. Mistakes — below study work ──────────────────────────────────────
    if (o.content.type === 'mistake') {
      if (o.content.confidence === 'mastered') continue;
      if (o.content.timesReviewed !== 0) continue;
      const created = safeTimestamp(o.createdAt);
      if (created > 0 && now - created > 2 * DAY) continue;
      consider(150 + Math.min(bonus, 40), {
        object: o,
        verb: 'Revisit',
        label: truncate(stripMd(o.content.whatWrong || o.title || 'Mistake'), 8),
        sublabel: joinMeta(["You haven't returned to this", timeLabel]),
      });
    }
  }

  return bestItem;
}

// ── ACTIVE ────────────────────────────────────────────────────────────────────

export interface ActiveItem {
  object: ProjectSpaceObject;
  primary: string;
  secondary?: string;
  recency: string;
}

function activeTimestamp(o: ProjectSpaceObject): number {
  return activityAt(o);
}

function activeDisplay(o: ProjectSpaceObject): { primary: string; secondary?: string } {
  if (o.content.type === 'notebook') {
    const subtitle = o.content.subtitle ? stripMd(o.content.subtitle) : null;
    const last = lastMeaningfulLine(o.content.body);
    if (subtitle) return { primary: truncate(subtitle, 14) };
    return { primary: last ? `"${truncate(last, 12)}"` : o.title };
  }
  if (o.content.type === 'pdf') {
    const pg = o.content.page > 1 ? `  ·  p.${o.content.page}` : '';
    return { primary: `${o.content.fileName}${pg}` };
  }
  if (o.content.type === 'studyfile') {
    const pg = o.content.page > 1 ? `  ·  p.${o.content.page}` : '';
    return { primary: `${o.content.fileName}${pg}` };
  }
  if (o.content.type === 'note') {
    const first = firstMeaningfulLine(o.content.body);
    const conns = o.connections?.length ?? 0;
    return {
      primary: `"${truncate(first || o.title, 10)}"`,
      secondary: conns > 0 ? `→ ${conns} connection${conns !== 1 ? 's' : ''}` : undefined,
    };
  }
  if (o.content.type === 'image') {
    const conns = o.connections?.length ?? 0;
    return {
      primary: o.title || 'Reference image',
      secondary: conns > 0 ? `Connected to ${conns} item${conns !== 1 ? 's' : ''}` : undefined,
    };
  }
  if (o.content.type === 'link') {
    return { primary: o.content.title || o.content.url };
  }
  return { primary: o.title };
}

function deriveActive(objects: ProjectSpaceObject[], excludeId: string | undefined): ActiveItem[] {
  const now = Date.now();

  const candidates = objects.filter(o => {
    if (ACTIVE_EXCLUDED.has(o.type)) return false;
    if (o.id === excludeId) return false;
    if (o.type === 'note' && !o.connections?.length) return false;
    return now - activeTimestamp(o) < ACTIVE_WINDOW;
  });

  return [...candidates]
    .sort((a, b) => activeTimestamp(b) - activeTimestamp(a))
    .slice(0, ACTIVE_CAP)
    .map(o => {
      const { primary, secondary } = activeDisplay(o);
      return { object: o, primary, secondary, recency: relativeTime(now, activeTimestamp(o)) };
    });
}

// ── FADING ────────────────────────────────────────────────────────────────────

export interface FadingItem {
  object: ProjectSpaceObject;
  concept: string;
  signal: string;
  recencyHint: string;
}

const CONF_ORDER = { low: 0, medium: 1, high: 2, mastered: 3 } as const;

function fadingSort(a: ProjectSpaceObject, b: ProjectSpaceObject): number {
  if (a.content.type !== 'mistake' || b.content.type !== 'mistake') return 0;
  const ac = a.content, bc = b.content;
  if (ac.timesReviewed === 0 && bc.timesReviewed !== 0) return -1;
  if (bc.timesReviewed === 0 && ac.timesReviewed !== 0) return 1;
  const ao = CONF_ORDER[ac.confidence] ?? 3;
  const bo = CONF_ORDER[bc.confidence] ?? 3;
  if (ao !== bo) return ao - bo;
  return (ac.lastReviewedAt ?? 0) - (bc.lastReviewedAt ?? 0);
}

function memorySignal(o: ProjectSpaceObject): string {
  if (o.content.type !== 'mistake') return '';
  if (o.content.timesReviewed === 0) return "You haven't returned to this";
  if (o.content.confidence === 'low')    return 'This keeps slipping';
  if (o.content.confidence === 'medium') return 'Getting there';
  if (o.content.confidence === 'high')   return 'Almost solid';
  return '';
}

function deriveFading(objects: ProjectSpaceObject[]): FadingItem[] {
  const now = Date.now();

  const candidates = objects.filter(o =>
    o.content.type === 'mistake' && o.content.confidence !== 'mastered',
  );

  return [...candidates].sort(fadingSort).slice(0, FADING_CAP).map(o => {
    if (o.content.type !== 'mistake') return null;
    const c = o.content;
    const hint = c.timesReviewed === 0 ? 'new'
      : c.lastReviewedAt ? relativeTime(now, c.lastReviewedAt)
      : '';
    return {
      object: o,
      concept: truncate(stripMd(c.whatWrong), 7),
      signal: memorySignal(o),
      recencyHint: hint,
    };
  }).filter((x): x is FadingItem => x !== null);
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface MissionControlSections {
  next:   NextItem | null;
  active: ActiveItem[];
  fading: FadingItem[];
}

export function deriveMissionControlSections(
  objects: ProjectSpaceObject[],
): MissionControlSections {
  const next   = deriveMissionControlContinue(objects);
  const active = deriveActive(objects, next?.object.id);
  const fading = deriveFading(objects);
  return { next, active, fading };
}
