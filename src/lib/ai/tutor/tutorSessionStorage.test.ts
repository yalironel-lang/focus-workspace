import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearTutorSession,
  readTutorSession,
  writeTutorSession,
  tutorSessionStorageKey,
  TUTOR_SESSION_MAX_TURNS,
} from './tutorSessionStorage';
import type { TutorCaptureIntent } from './tutorCaptureTypes';
import type { TutorTurn } from './useStandaloneTutor';

const dummyIntent: TutorCaptureIntent = {
  action: 'hint',
  attachment: {
    sourceKind: 'free_space_pdf',
    sourceObjectId: 'pdf-1',
    sectionId: 'sec-1',
    pageNumber: 3,
    regionNorm: { x: 0.1, y: 0.2, w: 0.5, h: 0.3 },
    attachmentType: 'text_selection',
    extractedText: 'Integral of f(x) dx',
  },
};

const dummyTurn1: TutorTurn = {
  id: 'turn-1',
  role: 'user',
  content: 'What is this formula?',
  timestamp: 1000,
};

const dummyTurn2: TutorTurn = {
  id: 'turn-2',
  role: 'assistant',
  content: 'It represents the area under the curve.',
  sources: [{ index: 1, sourceKind: 'free_space_pdf', sourceObjectId: 'pdf-1', pageNumber: 3, fileName: 'notes.pdf' }],
  timestamp: 2000,
};

describe('tutorSessionStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('writes and reads back a valid tutor session', () => {
    const success = writeTutorSession('user-A', 'sec-1', 'pdf-1', {
      intent: dummyIntent,
      turns: [dummyTurn1, dummyTurn2],
      draftQuestion: 'Next question draft',
    });
    expect(success).toBe(true);

    const loaded = readTutorSession('user-A', 'sec-1', 'pdf-1');
    expect(loaded).not.toBeNull();
    expect(loaded?.userId).toBe('user-A');
    expect(loaded?.sectionId).toBe('sec-1');
    expect(loaded?.sourceObjectId).toBe('pdf-1');
    expect(loaded?.intent?.action).toBe('hint');
    expect(loaded?.intent?.attachment.extractedText).toBe('Integral of f(x) dx');
    expect(loaded?.turns.length).toBe(2);
    expect(loaded?.turns[1].sources?.[0].pageNumber).toBe(3);
    expect(loaded?.draftQuestion).toBe('Next question draft');
  });

  it('strictly isolates by userId', () => {
    writeTutorSession('user-A', 'sec-1', 'pdf-1', {
      intent: dummyIntent,
      turns: [dummyTurn1],
    });

    const userB = readTutorSession('user-B', 'sec-1', 'pdf-1');
    expect(userB).toBeNull();
  });

  it('strictly isolates by sectionId', () => {
    writeTutorSession('user-A', 'sec-1', 'pdf-1', {
      intent: dummyIntent,
      turns: [dummyTurn1],
    });

    const otherCourse = readTutorSession('user-A', 'sec-2', 'pdf-1');
    expect(otherCourse).toBeNull();
  });

  it('strictly isolates by sourceObjectId (different PDFs in same course do not collide)', () => {
    writeTutorSession('user-A', 'sec-1', 'pdf-1', {
      intent: dummyIntent,
      turns: [dummyTurn1],
    });

    const otherPdf = readTutorSession('user-A', 'sec-1', 'pdf-2');
    expect(otherPdf).toBeNull();
  });

  it('safely handles missing or empty userId (no-op write, null read)', () => {
    expect(writeTutorSession(null, 'sec-1', 'pdf-1', { intent: dummyIntent, turns: [] })).toBe(false);
    expect(writeTutorSession('', 'sec-1', 'pdf-1', { intent: dummyIntent, turns: [] })).toBe(false);
    expect(readTutorSession(null, 'sec-1', 'pdf-1')).toBeNull();
    expect(readTutorSession('', 'sec-1', 'pdf-1')).toBeNull();
  });

  it('clears persisted session cleanly', () => {
    writeTutorSession('user-A', 'sec-1', 'pdf-1', {
      intent: dummyIntent,
      turns: [dummyTurn1],
    });
    expect(readTutorSession('user-A', 'sec-1', 'pdf-1')).not.toBeNull();

    clearTutorSession('user-A', 'sec-1', 'pdf-1');
    expect(readTutorSession('user-A', 'sec-1', 'pdf-1')).toBeNull();
  });

  it('enforces maximum turns limit', () => {
    const manyTurns: TutorTurn[] = Array.from({ length: 30 }, (_, i) => ({
      id: `turn-${i}`,
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `Message ${i}`,
      timestamp: 1000 + i,
    }));

    writeTutorSession('user-A', 'sec-1', 'pdf-1', {
      intent: dummyIntent,
      turns: manyTurns,
    });

    const loaded = readTutorSession('user-A', 'sec-1', 'pdf-1');
    expect(loaded?.turns.length).toBe(TUTOR_SESSION_MAX_TURNS);
    // Should retain the most recent turns
    expect(loaded?.turns[loaded.turns.length - 1].content).toBe('Message 29');
  });

  it('fails safely on corrupt JSON without throwing', () => {
    const key = tutorSessionStorageKey('user-A', 'sec-1', 'pdf-1');
    localStorage.setItem(key, '{not-valid-json');

    const result = readTutorSession('user-A', 'sec-1', 'pdf-1');
    expect(result).toBeNull();
    // And cleans up corrupt entry
    expect(localStorage.getItem(key)).toBeNull();
  });

  it('persists detached selection and answer provenance across refresh', () => {
    writeTutorSession('user-A', 'sec-1', 'pdf-1', {
      intent: dummyIntent,
      turns: [
        dummyTurn1,
        {
          ...dummyTurn2,
          knowledgeTier: 'general_academic',
          contextAvailable: { hasIndexedChunks: false, hasPdfCapture: true },
        },
      ],
      attachmentAttached: false,
    });

    const loaded = readTutorSession('user-A', 'sec-1', 'pdf-1');
    expect(loaded?.attachmentAttached).toBe(false);
    expect(loaded?.intent?.attachment.extractedText).toBe('Integral of f(x) dx');
    expect(loaded?.turns).toHaveLength(2);
    expect(loaded?.turns[1]).toMatchObject({
      knowledgeTier: 'general_academic',
      contextAvailable: { hasIndexedChunks: false, hasPdfCapture: true },
    });
  });

  it('keeps an incomplete-answer flag and still reads older sessions', () => {
    writeTutorSession('user-A', 'sec-1', 'pdf-1', {
      intent: dummyIntent,
      turns: [{ ...dummyTurn2, generationIncomplete: true }],
    });
    const loaded = readTutorSession('user-A', 'sec-1', 'pdf-1');
    expect(loaded?.turns[0]?.generationIncomplete).toBe(true);
    expect(loaded?.turns[0]?.content).toBe(dummyTurn2.content);

    writeTutorSession('user-A', 'sec-1', 'pdf-1', {
      intent: dummyIntent,
      turns: [dummyTurn2],
    });
    expect(readTutorSession('user-A', 'sec-1', 'pdf-1')?.turns[0]?.generationIncomplete).toBeUndefined();
  });

  it('keeps the document window on the existing conversation record', () => {
    writeTutorSession('user-A', 'sec-1', 'pdf-1', {
      intent: null,
      mode: 'teach_me',
      turns: [
        {
          ...dummyTurn2,
          documentWindow: {
            sourceObjectId: 'pdf-1',
            fileName: 'Problem Set 4 Solutions.pdf',
            pageCount: 30,
            fromPage: 1,
            toPage: 2,
            resumeFromPage: 2,
            partial: true,
          },
        },
      ],
    });
    const loaded = readTutorSession('user-A', 'sec-1', 'pdf-1');
    expect(loaded?.turns[0]?.documentWindow).toEqual({
      sourceObjectId: 'pdf-1',
      fileName: 'Problem Set 4 Solutions.pdf',
      pageCount: 30,
      fromPage: 1,
      toPage: 2,
      resumeFromPage: 2,
      partial: true,
    });
    expect(tutorSessionStorageKey('user-A', 'sec-1', 'pdf-1')).toBe(
      'focus.tutor_conversation_v1:user-A:sec-1:pdf-1',
    );
  });

  it('round-trips a session that has no PDF selection', () => {
    const success = writeTutorSession('user-A', 'sec-1', 'pdf-1', {
      intent: null,
      mode: 'teach_me',
      turns: [dummyTurn1],
      attachmentAttached: true,
    });
    expect(success).toBe(true);

    const loaded = readTutorSession('user-A', 'sec-1', 'pdf-1');
    expect(loaded?.intent).toBeNull();
    expect(loaded?.mode).toBe('teach_me');
    expect(loaded?.turns).toEqual([dummyTurn1]);
    expect(loaded?.attachmentAttached).toBe(false);
  });

  it('reads a legacy on-disk session and does not disturb it when another PDF has no selection', () => {
    const legacy = {
      version: 2,
      userId: 'user-A',
      sectionId: 'sec-1',
      sourceObjectId: 'pdf-legacy',
      intent: dummyIntent,
      mode: 'explain',
      turns: [dummyTurn1, dummyTurn2],
      attachmentAttached: true,
      updatedAt: 1_700_000_000_000,
    };
    const legacyKey = tutorSessionStorageKey('user-A', 'sec-1', 'pdf-legacy');
    localStorage.setItem(legacyKey, JSON.stringify(legacy));

    const loaded = readTutorSession('user-A', 'sec-1', 'pdf-legacy');
    expect(loaded?.intent?.attachment.extractedText).toBe('Integral of f(x) dx');
    expect(loaded?.turns).toHaveLength(2);
    expect(loaded?.attachmentAttached).toBe(true);
    expect(loaded?.mode).toBe('explain');

    writeTutorSession('user-A', 'sec-1', 'pdf-1', {
      intent: null,
      mode: 'exam_prep',
      turns: [dummyTurn2],
    });

    expect(localStorage.getItem(legacyKey)).toBe(JSON.stringify(legacy));
    expect(readTutorSession('user-A', 'sec-1', 'pdf-1')?.intent).toBeNull();
  });

  it('rejects a present but invalid capture and leaves a valid legacy session alone', () => {
    writeTutorSession('user-A', 'sec-1', 'pdf-legacy', {
      intent: dummyIntent,
      turns: [dummyTurn1],
    });
    const corruptKey = tutorSessionStorageKey('user-A', 'sec-1', 'pdf-corrupt');
    localStorage.setItem(
      corruptKey,
      JSON.stringify({
        version: 2,
        userId: 'user-A',
        sectionId: 'sec-1',
        sourceObjectId: 'pdf-corrupt',
        intent: { action: 'explain' },
        mode: 'explain',
        turns: [dummyTurn1],
        updatedAt: 1,
      }),
    );

    expect(readTutorSession('user-A', 'sec-1', 'pdf-corrupt')).toBeNull();
    expect(localStorage.getItem(corruptKey)).toBeNull();
    expect(readTutorSession('user-A', 'sec-1', 'pdf-legacy')?.turns).toHaveLength(1);
  });
});
