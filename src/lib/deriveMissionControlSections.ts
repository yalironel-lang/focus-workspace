/**
 * Mission Control derivation — pure function, no side effects, no storage.
 * Derives NEXT / ACTIVE / FADING from the live Free Space object array.
 */

import type { ProjectSpaceObject } from '../hooks/useSectionFreeSpaceObjects';

// ── Constants ─────────────────────────────────────────────────────────────────

const HOUR = 3_600_000;
const DAY  = 86_400_000;

const ACTIVE_EXCLUDED = new Set(['calculator', 'graph', 'companion', 'mistake']);
const ACTIVE_CAP   = 8;
const FADING_CAP   = 6;
const ACTIVE_WINDOW = 14 * DAY;

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
  const words = text.split(/\s+/);
  return words.length <= maxWords ? text : words.slice(0, maxWords).join(' ') + '…';
}

export function relativeTime(now: number, then: number): string {
  const diff = now - then;
  if (diff < 60_000)     return 'just now';
  if (diff < HOUR)       return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 2 * HOUR)   return '1h ago';
  if (diff < DAY)        return `${Math.floor(diff / HOUR)}h ago`;
  if (diff < 2 * DAY)    return 'yesterday';
  return `${Math.floor(diff / DAY)}d ago`;
}

// ── NEXT ──────────────────────────────────────────────────────────────────────

export interface NextItem {
  object: ProjectSpaceObject;
  verb: 'Continue' | 'Return to' | 'Revisit' | 'Resolve';
  label: string;
  sublabel: string;
}

function deriveNext(objects: ProjectSpaceObject[]): NextItem | null {
  const now = Date.now();

  let bestScore = -1;
  let bestItem: NextItem | null = null;

  const tryCandidate = (score: number, item: NextItem) => {
    if (score > bestScore) { bestScore = score; bestItem = item; }
  };

  for (const o of objects) {
    const age = now - o.updatedAt;
    const recency = age < HOUR ? 30 : age < 4 * HOUR ? 20 : age < DAY ? 10 : age < 3 * DAY ? 5 : 0;

    // Notebooks — primary writing surface, strongest continuation signal
    if (o.content.type === 'notebook') {
      const subtitle = o.content.subtitle ? stripMd(o.content.subtitle) : null;
      const lastLine = lastMeaningfulLine(o.content.body);
      const label = truncate(subtitle ?? (lastLine || o.title), 12);
      tryCandidate(80 + recency, {
        object: o, verb: 'Continue', label,
        sublabel: relativeTime(now, o.updatedAt),
      });
    }

    // Isolated notes created < 24h — interrupted thought capture
    if (o.content.type === 'note' && !o.connections?.length && now - o.createdAt < DAY) {
      const line = firstMeaningfulLine(o.content.body);
      tryCandidate(90, {
        object: o, verb: 'Resolve',
        label: truncate(line || o.title, 10),
        sublabel: 'Captured · not yet connected',
      });
    }

    // PDFs with connections opened recently — you were reading and taking notes
    if (o.content.type === 'pdf') {
      const lastOpened = o.content.lastOpenedAt ?? o.updatedAt;
      if ((o.connections?.length ?? 0) > 0 && now - lastOpened < DAY) {
        const pageLabel = o.content.page > 1 ? `  ·  p.${o.content.page}` : '';
        tryCandidate(75, {
          object: o, verb: 'Return to',
          label: `${o.content.fileName}${pageLabel}`,
          sublabel: relativeTime(now, lastOpened),
        });
      }
    }

    // Study files with connections opened recently
    if (o.content.type === 'studyfile') {
      const lastOpened = o.content.lastOpenedAt ?? o.updatedAt;
      if ((o.connections?.length ?? 0) > 0 && now - lastOpened < DAY) {
        const pageLabel = o.content.page > 1 ? `  ·  p.${o.content.page}` : '';
        tryCandidate(72, {
          object: o, verb: 'Return to',
          label: `${o.content.fileName}${pageLabel}`,
          sublabel: relativeTime(now, lastOpened),
        });
      }
    }

    // Recall/mistake never reviewed, created < 48h — you flagged it while thinking
    if (o.content.type === 'mistake' && o.content.timesReviewed === 0 && now - o.createdAt < 2 * DAY) {
      tryCandidate(70, {
        object: o, verb: 'Revisit',
        label: truncate(stripMd(o.content.whatWrong), 8),
        sublabel: "You haven't returned to this",
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
  if (o.content.type === 'pdf')       return o.content.lastOpenedAt ?? o.updatedAt;
  if (o.content.type === 'studyfile') return o.content.lastOpenedAt ?? o.updatedAt;
  return o.updatedAt;
}

function activeDisplay(o: ProjectSpaceObject): { primary: string; secondary?: string } {
  if (o.content.type === 'notebook') {
    const subtitle = o.content.subtitle ? stripMd(o.content.subtitle) : null;
    const last = lastMeaningfulLine(o.content.body);
    if (subtitle) return { primary: truncate(subtitle, 14) };
    // No subtitle — show the last thought fragment in quotes
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
    // Isolated unlinked notes stay out of ACTIVE — they belong in NEXT
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
  const next   = deriveNext(objects);
  const active = deriveActive(objects, next?.object.id);
  const fading = deriveFading(objects);
  return { next, active, fading };
}
