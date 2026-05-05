import { GroupWithItems, Item, CourseLink, SectionWithProgress, Deadline } from '../types';

// ── Date helpers ──────────────────────────────────────────────────────────────

export function daysUntil(dateStr: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due   = new Date(dateStr + 'T12:00:00');
  return Math.ceil((due.getTime() - today.getTime()) / 86_400_000);
}

export function nearestDeadlineDays(sectionId: string, deadlines: Deadline[]): number {
  const days = deadlines
    .filter(d => d.section_id === sectionId && !d.completed)
    .map(d => daysUntil(d.due_date));
  return days.length > 0 ? Math.min(...days) : 999;
}

// ── Task picking ──────────────────────────────────────────────────────────────
// Priority: high-priority tasks → Exercises group → Exams group → original order
// Completed tasks are excluded entirely (session = active work).

const GROUP_BOOST: Record<string, number> = { Exercises: 20, Exams: 10 };
const PRIORITY_BOOST: Record<string, number> = { high: 30, medium: 15, low: 0 };

export interface TaskRec {
  item: Item;
  groupTitle: string;    // DB value (e.g. 'Exercises')
  displayGroup: string;  // UI label  (e.g. 'To Do')
}

export function pickTasks(
  groups: GroupWithItems[],
  limit = 3,
  /** If supplied, limit auto-expands to 5 when section has an urgent (<3d) deadline */
  urgencyDeadlines?: Deadline[],
  sectionId?: string,
): TaskRec[] {
  // Expand limit for urgent sections so the session covers more prep work
  let effectiveLimit = limit;
  if (urgencyDeadlines && sectionId) {
    const nearest = nearestDeadline(sectionId, urgencyDeadlines);
    if (nearest) {
      const lvl = deadlineLevel(daysUntil(nearest.due_date));
      if (lvl === 'urgent' || lvl === 'overdue') effectiveLimit = Math.max(limit, 5);
      else if (lvl === 'soon')                   effectiveLimit = Math.max(limit, 4);
    }
  }

  const candidates: Array<TaskRec & { score: number }> = [];

  for (const group of groups) {
    const displayGroup = group.title === 'Exercises' ? 'To Do' : group.title;
    for (const item of group.items) {
      if (item.type !== 'task' || item.completed) continue;
      const score =
        (GROUP_BOOST[group.title] ?? 0) +
        (PRIORITY_BOOST[item.content ?? ''] ?? 0);
      candidates.push({ item, groupTitle: group.title, displayGroup, score });
    }
  }

  return candidates
    .sort((a, b) => b.score - a.score)
    .slice(0, effectiveLimit);
}

// ── Portal picking ────────────────────────────────────────────────────────────
// Course-specific portals first, then global (deduplicated by type).

export function pickPortals(
  courseLinks: CourseLink[],
  globalLinks: CourseLink[],
  limit = 4,
): CourseLink[] {
  const combined = [
    ...courseLinks,
    ...globalLinks.filter(g => !courseLinks.some(c => c.type === g.type)),
  ];
  return combined.slice(0, limit);
}

// ── Section sorting ───────────────────────────────────────────────────────────
// Nearest exam date first → nearest deadline → alphabetical.

export function sortSectionsByUrgency(
  sections: SectionWithProgress[],
  deadlines: Deadline[],
): SectionWithProgress[] {
  return [...sections].sort((a, b) => {
    const aExam = a.exam_date ? daysUntil(a.exam_date) : 999;
    const bExam = b.exam_date ? daysUntil(b.exam_date) : 999;
    if (aExam !== bExam) return aExam - bExam;
    const aDead = nearestDeadlineDays(a.id, deadlines);
    const bDead = nearestDeadlineDays(b.id, deadlines);
    if (aDead !== bDead) return aDead - bDead;
    return a.title.localeCompare(b.title);
  });
}

// ── Deadline urgency helpers (shared across UI surfaces) ─────────────────────

/** Human-readable label: "Overdue", "Today", "Tomorrow", "3 days left" */
export function deadlineUrgencyLabel(daysLeft: number): string {
  if (daysLeft < 0)   return 'Overdue';
  if (daysLeft === 0) return 'Due today';
  if (daysLeft === 1) return 'Tomorrow';
  return `${daysLeft} days left`;
}

/** 'overdue' | 'urgent' (<3d) | 'soon' (3–7d) | 'far' */
export function deadlineLevel(daysLeft: number): 'overdue' | 'urgent' | 'soon' | 'far' {
  if (daysLeft < 0)  return 'overdue';
  if (daysLeft < 3)  return 'urgent';
  if (daysLeft <= 7) return 'soon';
  return 'far';
}

/** Returns the nearest non-completed deadline for a section, or null. */
export function nearestDeadline(sectionId: string, deadlines: Deadline[]): Deadline | null {
  const pending = deadlines
    .filter(d => d.section_id === sectionId && !d.completed)
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
  return pending[0] ?? null;
}

// ── Urgency hint (used in course picker) ─────────────────────────────────────

export function urgencyHint(section: SectionWithProgress, deadlines: Deadline[]): string | null {
  if (section.exam_date) {
    const d = daysUntil(section.exam_date);
    if (d <= 0)  return 'Exam today!';
    if (d === 1) return 'Exam tomorrow';
    if (d <= 7)  return `Exam in ${d}d`;
    if (d <= 14) return `Exam in ${d}d`;
  }
  const pending = deadlines
    .filter(d => d.section_id === section.id && !d.completed)
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
  if (pending.length > 0) {
    const d = daysUntil(pending[0].due_date);
    if (d < 0)   return 'Overdue';
    if (d === 0) return 'Due today';
    if (d === 1) return 'Due tomorrow';
    if (d <= 7)  return `Due in ${d}d`;
  }
  return null;
}

// ── Session storage ───────────────────────────────────────────────────────────

export const SESSION_KEY = 'focus_active_session';

export interface ActiveSession {
  sectionId: string;
  sectionTitle: string;
  taskIds: string[];
  portalIds: string[];
  startedAt: string; // ISO string
}

export function saveSession(s: ActiveSession): void {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
}

export function loadSession(): ActiveSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as ActiveSession) : null;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  sessionStorage.removeItem(SESSION_KEY);
}

export function elapsedMinutes(startedAt: string): number {
  return Math.floor((Date.now() - new Date(startedAt).getTime()) / 60_000);
}
