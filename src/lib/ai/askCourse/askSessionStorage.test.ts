/**
 * @vitest-environment happy-dom
 *
 * M0.9C2.3 — local Ask session storage validation / bounds.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ASK_SESSION_MAX_ANSWER_CHARS,
  ASK_SESSION_MAX_QUESTION_CHARS,
  ASK_SESSION_MAX_SERIALIZED_CHARS,
  ASK_SESSION_MAX_TURNS,
  ASK_SESSION_STORAGE_VERSION,
  askSessionStorageKey,
  clearAskSession,
  parsePersistedAskSession,
  readAskSession,
  writeAskSession,
  type AskSessionTurn,
} from './askSessionStorage';

const USER = 'user-test-1';
const SEC = 'sec-test-1';

function turn(partial?: Partial<AskSessionTurn>): AskSessionTurn {
  return {
    id: 't1',
    question: 'What is the Violet Doctrine?',
    answer: 'A grounded answer.',
    sources: [
      {
        index: 1,
        sourceKind: 'free_space_pdf',
        sourceObjectId: 'pdf-1',
        fileName: 'Notes.pdf',
        pageNumber: 3,
      },
    ],
    status: 'success',
    ...partial,
  };
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe('askSessionStorage', () => {
  it('writes and reads a valid session under namespaced key', () => {
    const ok = writeAskSession(USER, SEC, {
      turns: [turn()],
      draft: 'follow-up draft',
    });
    expect(ok).toBe(true);
    expect(localStorage.getItem(askSessionStorageKey(USER, SEC))).toBeTruthy();
    const stored = readAskSession(USER, SEC);
    expect(stored).toMatchObject({
      version: ASK_SESSION_STORAGE_VERSION,
      sectionId: SEC,
      draft: 'follow-up draft',
    });
    expect(stored!.turns).toHaveLength(1);
    expect(stored!.turns[0]!.sources[0]).toMatchObject({
      sourceKind: 'free_space_pdf',
      sourceObjectId: 'pdf-1',
      pageNumber: 3,
    });
  });

  it('refuses persistence without userId', () => {
    expect(writeAskSession(null, SEC, { turns: [turn()], draft: '' })).toBe(false);
    expect(readAskSession(null, SEC)).toBeNull();
  });

  it('clearAskSession removes only that course key', () => {
    writeAskSession(USER, SEC, { turns: [turn()], draft: '' });
    writeAskSession(USER, 'sec-other', { turns: [turn({ id: 't2' })], draft: '' });
    clearAskSession(USER, SEC);
    expect(readAskSession(USER, SEC)).toBeNull();
    expect(readAskSession(USER, 'sec-other')!.turns).toHaveLength(1);
  });

  it('rejects corrupt / wrong-version / wrong-section payloads', () => {
    expect(parsePersistedAskSession(null, SEC)).toBeNull();
    expect(parsePersistedAskSession({ version: 99, sectionId: SEC }, SEC)).toBeNull();
    expect(
      parsePersistedAskSession(
        {
          version: 1,
          sectionId: 'other',
          turns: [],
          draft: '',
          updatedAt: Date.now(),
        },
        SEC,
      ),
    ).toBeNull();
    localStorage.setItem(askSessionStorageKey(USER, SEC), '{not-json');
    expect(readAskSession(USER, SEC)).toBeNull();
    expect(localStorage.getItem(askSessionStorageKey(USER, SEC))).toBeNull();
  });

  it('rejects oversized / invalid turn shapes safely', () => {
    expect(
      parsePersistedAskSession(
        {
          version: 1,
          sectionId: SEC,
          turns: [
            {
              id: 't1',
              question: 'x'.repeat(ASK_SESSION_MAX_QUESTION_CHARS + 1),
              answer: 'ok',
              sources: [],
              status: 'success',
            },
          ],
          draft: '',
          updatedAt: 1,
        },
        SEC,
      ),
    ).toBeNull();

    expect(
      parsePersistedAskSession(
        {
          version: 1,
          sectionId: SEC,
          turns: [
            {
              id: 't1',
              question: 'q',
              answer: 'y'.repeat(ASK_SESSION_MAX_ANSWER_CHARS + 1),
              sources: [],
              status: 'success',
            },
          ],
          draft: '',
          updatedAt: 1,
        },
        SEC,
      ),
    ).toBeNull();

    expect(
      parsePersistedAskSession(
        {
          version: 1,
          sectionId: SEC,
          turns: Array.from({ length: ASK_SESSION_MAX_TURNS + 1 }, (_, i) => ({
            id: `t${i}`,
            question: 'q',
            answer: 'a',
            sources: [],
            status: 'success',
          })),
          draft: '',
          updatedAt: 1,
        },
        SEC,
      ),
    ).toBeNull();

    expect(
      parsePersistedAskSession(
        {
          version: 1,
          sectionId: SEC,
          turns: [
            {
              id: 't1',
              question: 'q',
              answer: 'a',
              sources: [{ index: 1, sourceKind: 'free_space_pdf' }],
              status: 'success',
            },
          ],
          draft: '',
          updatedAt: 1,
        },
        SEC,
      ),
    ).toBeNull();

    localStorage.setItem(
      askSessionStorageKey(USER, SEC),
      'x'.repeat(ASK_SESSION_MAX_SERIALIZED_CHARS + 1),
    );
    expect(readAskSession(USER, SEC)).toBeNull();
  });

  it('accepts notebook_page sources', () => {
    const ok = writeAskSession(USER, SEC, {
      turns: [
        turn({
          sources: [
            {
              index: 1,
              sourceKind: 'notebook_page',
              notebookObjectId: 'nb-1',
              pageId: 'pg-1',
              notebookTitle: 'Notebook',
              pageTitle: 'Page',
            },
          ],
        }),
      ],
      draft: '',
    });
    expect(ok).toBe(true);
    const stored = readAskSession(USER, SEC);
    expect(stored!.turns[0]!.sources[0]).toMatchObject({
      sourceKind: 'notebook_page',
      notebookObjectId: 'nb-1',
      pageId: 'pg-1',
    });
  });
});
