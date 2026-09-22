/**
 * M0.9C1 — sanitize/bound ask_course v2 recentTurns.
 * All content is untrusted. Assistant text is never factual authority.
 */

import type { AskCourseRecentTurn } from '../requestTypes.ts';
import {
  ASK_COURSE_MAX_PRIOR_ASSISTANT_TURN_CHARS,
  ASK_COURSE_MAX_PRIOR_ASSISTANT_TURNS,
  ASK_COURSE_MAX_PRIOR_USER_TURN_CHARS,
  ASK_COURSE_MAX_PRIOR_USER_TURNS,
  ASK_COURSE_MAX_RECENT_TURNS,
  ASK_COURSE_MAX_RECENT_TURNS_TOTAL_CHARS,
} from './bounds.ts';

/**
 * Neutralize citation-like artifacts so prior assistant text cannot
 * masquerade as live current-turn sources.
 */
export function sanitizeAskCourseAssistantTurnContent(raw: string): string {
  let s = raw;
  // Bracket citation markers: [1], [12]
  s = s.replace(/\[\d+\]/g, '');
  // Common source list headings / labels
  s = s.replace(/^\s*sources?\s*:?\s*$/gim, '');
  s = s.replace(/^\s*source\s*:?\s*/gim, '');
  s = s.replace(/\[SOURCE\s+\d+[^\]]*\]/gi, '');
  s = s.replace(/\[\/SOURCE\s+\d+\]/gi, '');
  // Collapse leftover whitespace
  s = s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n');
  s = s.replace(/[ \t]{2,}/g, ' ');
  return s.trim();
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max).trimEnd();
}

function totalChars(turns: AskCourseRecentTurn[]): number {
  return turns.reduce((n, t) => n + t.content.length, 0);
}

/**
 * Normalize client recentTurns into a bounded, preferred shape:
 * up to 2 newest user + 1 newest assistant (max 3), chronological order.
 * Invalid entries are dropped (degrade); empty result is valid standalone.
 */
export function normalizeAskCourseRecentTurns(raw: unknown): AskCourseRecentTurn[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) return [];

  const cleaned: AskCourseRecentTurn[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const role = (item as { role?: unknown }).role;
    const contentRaw = (item as { content?: unknown }).content;
    if (role !== 'user' && role !== 'assistant') continue;
    if (typeof contentRaw !== 'string') continue;
    let content = contentRaw.trim();
    if (!content) continue;
    if (role === 'assistant') {
      content = sanitizeAskCourseAssistantTurnContent(content);
      if (!content) continue;
      content = truncate(content, ASK_COURSE_MAX_PRIOR_ASSISTANT_TURN_CHARS);
    } else {
      content = truncate(content, ASK_COURSE_MAX_PRIOR_USER_TURN_CHARS);
    }
    if (!content) continue;
    cleaned.push({ role, content });
  }

  // Prefer newest: walk reverse, pick up to 2 user + 1 assistant, max 3 total.
  let userCount = 0;
  let assistantCount = 0;
  const pickedRev: AskCourseRecentTurn[] = [];
  for (let i = cleaned.length - 1; i >= 0; i--) {
    const t = cleaned[i]!;
    if (t.role === 'user') {
      if (userCount >= ASK_COURSE_MAX_PRIOR_USER_TURNS) continue;
      userCount += 1;
    } else {
      if (assistantCount >= ASK_COURSE_MAX_PRIOR_ASSISTANT_TURNS) continue;
      assistantCount += 1;
    }
    pickedRev.push(t);
    if (pickedRev.length >= ASK_COURSE_MAX_RECENT_TURNS) break;
  }
  const picked = pickedRev.reverse();

  while (picked.length > 0 && totalChars(picked) > ASK_COURSE_MAX_RECENT_TURNS_TOTAL_CHARS) {
    picked.shift();
  }
  return picked;
}
