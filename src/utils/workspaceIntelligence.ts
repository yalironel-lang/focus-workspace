/**
 * workspaceIntelligence.ts
 *
 * Pure functions that compute actionable insight from workspace data.
 * No side effects, no React — only data in, insight out.
 *
 * Architecture note:
 *   All of these functions have the same signature shape as a future AI API call.
 *   When you add a backend AI layer, replace `computeIntelligence()` with
 *   `await fetchAIIntelligence(sections, deadlines, userProfile)` — same return type.
 *
 * Key principle: surface OUTCOMES, not data.
 *   Not "3 deadlines pending" → "Chemistry exam in 2 days — your #1 priority."
 */

import type { SectionWithProgress, Deadline } from '../types';

// ── Types ─────────────────────────────────────────────────────────────────────

export type UrgencyLevel = 'overdue' | 'critical' | 'soon' | 'later' | 'none';

export interface UrgencyItem {
  id:            string;
  title:         string;
  type:          string;
  daysUntil:     number;
  sectionTitle?: string;
  sectionId?:    string | null;
  urgency:       UrgencyLevel;
  /** Human-readable: "in 2 days", "today", "overdue by 1 day" */
  timeLabel:     string;
  /** Directive copy: "Chemistry exam in 2 days — make it your #1 priority." */
  directive:     string;
}

export type MomentumLabel = 'Crushing it' | 'Strong' | 'In progress' | 'Getting started' | 'Just begun';
export type OverallStatus = 'critical' | 'warning' | 'stable' | 'ahead';

export interface WorkspaceIntelligence {
  urgentItems:       UrgencyItem[];   // sorted, filtered to ≤14 days
  topItem:           UrgencyItem | null;
  suggestedSection:  SectionWithProgress | null;
  suggestedReason:   string;          // e.g. "has exam in 2 days"
  momentumScore:     number;          // 0–100
  momentumLabel:     MomentumLabel;
  overallStatus:     OverallStatus;
  /** Human narrative: "Chemistry exam tomorrow. Physics on track." */
  statusNarrative:   string;
  completedToday:    number;          // placeholder — real value needs backend
  totalActive:       number;          // sections with incomplete work
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getTodayMs() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function getDaysUntil(dateStr: string): number {
  const due = new Date(dateStr);
  due.setHours(0, 0, 0, 0);
  return Math.ceil((due.getTime() - getTodayMs()) / 86_400_000);
}

function urgencyFromDays(days: number): UrgencyLevel {
  if (days < 0)  return 'overdue';
  if (days <= 1) return 'critical';
  if (days <= 3) return 'soon';
  if (days <= 7) return 'later';
  return 'none';
}

function timeLabel(days: number): string {
  if (days < -1)  return `overdue by ${Math.abs(days)} days`;
  if (days === -1) return 'overdue by 1 day';
  if (days === 0)  return 'today';
  if (days === 1)  return 'tomorrow';
  if (days <= 7)   return `in ${days} days`;
  return `in ${days} days`;
}

function buildDirective(item: { title: string; type: string; timeLabel: string; urgency: UrgencyLevel }): string {
  const typeWord = item.type === 'exam' ? 'exam' : item.type === 'assignment' ? 'assignment' : 'deadline';

  if (item.urgency === 'overdue')  return `Your ${item.title} is ${item.timeLabel}. Address this now.`;
  if (item.urgency === 'critical') return `${item.title} is due ${item.timeLabel}. Make it your #1 priority.`;
  if (item.urgency === 'soon')     return `${item.title} ${typeWord} is ${item.timeLabel} — focus on it today.`;
  return `${item.title} is ${item.timeLabel}.`;
}

// ── Core computation ──────────────────────────────────────────────────────────

export function computeIntelligence(
  sections:  SectionWithProgress[],
  deadlines: Deadline[],
): WorkspaceIntelligence {

  // ── Urgent items ───────────────────────────────────────────────────────────
  const urgentItems: UrgencyItem[] = deadlines
    .filter(d => !d.completed)
    .map(d => {
      const days    = getDaysUntil(d.due_date);
      const urgency = urgencyFromDays(days);
      const tLabel  = timeLabel(days);
      const section = sections.find(s => s.id === d.section_id);
      return {
        id:           d.id,
        title:        d.title,
        type:         d.type,
        daysUntil:    days,
        sectionTitle: section?.title,
        sectionId:    d.section_id,
        urgency,
        timeLabel:    tLabel,
        directive:    buildDirective({ title: d.title, type: d.type, timeLabel: tLabel, urgency }),
      };
    })
    .filter(i => i.daysUntil <= 14)
    .sort((a, b) => a.daysUntil - b.daysUntil);

  const topItem = urgentItems[0] ?? null;

  // ── Momentum ───────────────────────────────────────────────────────────────
  const totalItems     = sections.reduce((s, x) => s + x.total_items, 0);
  const completedItems = sections.reduce((s, x) => s + x.completed_items, 0);
  const momentumScore  = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

  const momentumLabel: MomentumLabel =
    momentumScore >= 85 ? 'Crushing it' :
    momentumScore >= 65 ? 'Strong'       :
    momentumScore >= 40 ? 'In progress'  :
    momentumScore >= 15 ? 'Getting started' : 'Just begun';

  // ── Overall status ─────────────────────────────────────────────────────────
  const overdueCount   = urgentItems.filter(i => i.urgency === 'overdue').length;
  const criticalCount  = urgentItems.filter(i => i.urgency === 'critical').length;
  const soonCount      = urgentItems.filter(i => i.urgency === 'soon').length;

  const overallStatus: OverallStatus =
    overdueCount > 0   ? 'critical' :
    criticalCount > 0  ? 'warning'  :
    soonCount > 0      ? 'warning'  :
    momentumScore >= 70 ? 'ahead'   : 'stable';

  // ── Suggested section ──────────────────────────────────────────────────────
  type Scored = { section: SectionWithProgress; score: number; reason: string };

  const scored: Scored[] = sections
    .filter(s => s.total_items - s.completed_items > 0)
    .map(s => {
      const sd = deadlines.filter(d => d.section_id === s.id && !d.completed);
      const overdue   = sd.filter(d => getDaysUntil(d.due_date) < 0).length;
      const critical  = sd.filter(d => { const n = getDaysUntil(d.due_date); return n >= 0 && n <= 1; }).length;
      const soon      = sd.filter(d => { const n = getDaysUntil(d.due_date); return n > 1 && n <= 3; }).length;
      const later     = sd.filter(d => { const n = getDaysUntil(d.due_date); return n > 3 && n <= 7; }).length;
      const ratio     = s.total_items > 0 ? s.completed_items / s.total_items : 0;

      const score = overdue * 200 + critical * 100 + soon * 40 + later * 15 + (1 - ratio) * 10;

      const nextDue = sd.sort((a, b) => getDaysUntil(a.due_date) - getDaysUntil(b.due_date))[0];
      let reason = `${Math.round((1 - ratio) * 100)}% remaining`;
      if (overdue > 0)   reason = `${overdue} overdue`;
      else if (critical > 0 && nextDue) reason = `due ${timeLabel(getDaysUntil(nextDue.due_date))}`;
      else if (soon > 0 && nextDue)     reason = `due ${timeLabel(getDaysUntil(nextDue.due_date))}`;

      return { section: s, score, reason };
    })
    .sort((a, b) => b.score - a.score);

  const top = scored[0] ?? null;

  // ── Status narrative ───────────────────────────────────────────────────────
  let statusNarrative = '';
  if (topItem) {
    statusNarrative = topItem.directive;
  } else if (overallStatus === 'ahead') {
    statusNarrative = 'Everything is on track. Great time for deep work.';
  } else if (totalItems === 0) {
    statusNarrative = 'Add your workspaces to start tracking progress.';
  } else {
    statusNarrative = `Momentum at ${momentumScore}% — ${momentumLabel.toLowerCase()}.`;
  }

  return {
    urgentItems,
    topItem,
    suggestedSection:  top?.section ?? null,
    suggestedReason:   top?.reason ?? '',
    momentumScore,
    momentumLabel,
    overallStatus,
    statusNarrative,
    completedToday:    0,   // future: track via backend events
    totalActive:       sections.filter(s => s.total_items - s.completed_items > 0).length,
  };
}

// ── Time-of-day greeting ──────────────────────────────────────────────────────

export function getGreeting(name: string): string {
  const hour = new Date().getHours();
  const greet =
    hour < 5  ? 'Still going' :
    hour < 12 ? 'Good morning' :
    hour < 17 ? 'Good afternoon' :
    hour < 21 ? 'Good evening' :
                'Good night';
  return name ? `${greet}, ${name}.` : `${greet}.`;
}

// ── Day-of-week context ───────────────────────────────────────────────────────

export function getDayContext(): string {
  const day = new Date().getDay(); // 0=Sun
  if (day === 0) return 'Rest day or catch-up — your call.';
  if (day === 5) return 'Last full day of the week — make it count.';
  if (day === 6) return 'Weekend — use this for deep review.';
  return '';
}
