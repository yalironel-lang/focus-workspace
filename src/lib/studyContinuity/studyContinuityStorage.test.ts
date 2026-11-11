import { describe, it, expect, beforeEach } from 'vitest';
import { patchStorageMethod } from '../knowledge/testLocalStorage';
import {
  studyContinuityStorageKey,
  loadStudyContinuityStore,
  saveStudyContinuityRecord,
  getMostRecentStudyContinuity,
  clearStudyContinuityForBoard,
  parseContinuityRecord,
  parseContinuityStore,
  MAX_CONTINUITY_RECORDS,
} from './persistence';
import { STUDY_CONTINUITY_VERSION } from './types';

describe('WC-6A1 StudyContinuity Storage & Persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  // A. user-scoped key
  it('A. derives user-scoped storage key properly', () => {
    const key = studyContinuityStorageKey('user-1', 'sec-1', 'board-1');
    expect(key).toBe('focus.study_continuity_v1:user-1:sec-1:board-1');

    const mainKey = studyContinuityStorageKey('user-1', 'sec-1', 'main');
    expect(mainKey).toBe('focus.study_continuity_v1:user-1:sec-1:main');

    const emptyBoardKey = studyContinuityStorageKey('user-1', 'sec-1', '');
    expect(emptyBoardKey).toBe('focus.study_continuity_v1:user-1:sec-1:main');
  });

  // B. valid record round-trip
  it('B. saves and loads study continuity record in round-trip', () => {
    const saved = saveStudyContinuityRecord('user-1', 'sec-1', 'board-1', {
      sourceObjectId: 'pdf-1',
      workObjectId: 'nb-1',
      lastActiveAt: 1000,
    });
    expect(saved).toBe(true);

    const store = loadStudyContinuityStore('user-1', 'sec-1', 'board-1');
    expect(store).not.toBeNull();
    expect(store?.version).toBe(STUDY_CONTINUITY_VERSION);
    expect(store?.mostRecentSourceId).toBe('pdf-1');
    expect(store?.records['pdf-1']).toEqual({
      version: 1,
      userId: 'user-1',
      sectionId: 'sec-1',
      boardId: 'board-1',
      sourceObjectId: 'pdf-1',
      workObjectId: 'nb-1',
      lastActiveAt: 1000,
    });

    const mostRecent = getMostRecentStudyContinuity('user-1', 'sec-1', 'board-1');
    expect(mostRecent?.sourceObjectId).toBe('pdf-1');
    expect(mostRecent?.workObjectId).toBe('nb-1');
  });

  // C. malformed JSON safe fallback
  it('C. safely falls back when JSON in localStorage is malformed', () => {
    const key = studyContinuityStorageKey('user-1', 'sec-1', 'board-1');
    localStorage.setItem(key, '{ invalid json');

    const store = loadStudyContinuityStore('user-1', 'sec-1', 'board-1');
    expect(store).not.toBeNull();
    expect(store?.records).toEqual({});
    expect(store?.mostRecentSourceId).toBeNull();
  });

  // D. unknown version safe fallback
  it('D. safely falls back when schema version is unknown', () => {
    expect(parseContinuityStore({ version: 99, records: {} })).toBeNull();
    expect(parseContinuityRecord({ version: 99 })).toBeNull();
  });

  // E. missing userId cannot read/write
  it('E. missing or empty userId fails to read or write', () => {
    expect(saveStudyContinuityRecord('', 'sec-1', 'board-1', {
      sourceObjectId: 'pdf-1',
      workObjectId: 'nb-1',
      lastActiveAt: 1000,
    })).toBe(false);

    expect(saveStudyContinuityRecord(null, 'sec-1', 'board-1', {
      sourceObjectId: 'pdf-1',
      workObjectId: 'nb-1',
      lastActiveAt: 1000,
    })).toBe(false);

    expect(loadStudyContinuityStore('', 'sec-1', 'board-1')).toBeNull();
    expect(loadStudyContinuityStore(null, 'sec-1', 'board-1')).toBeNull();
    expect(getMostRecentStudyContinuity('', 'sec-1', 'board-1')).toBeNull();
  });

  // F. User A cannot read User B
  it('F. User A cannot read User B continuity data (multi-user isolation)', () => {
    saveStudyContinuityRecord('user-A', 'sec-1', 'board-1', {
      sourceObjectId: 'pdf-A',
      workObjectId: 'nb-A',
      lastActiveAt: 1000,
    });

    const userBStore = loadStudyContinuityStore('user-B', 'sec-1', 'board-1');
    expect(userBStore?.records).toEqual({});
    expect(userBStore?.mostRecentSourceId).toBeNull();

    const userBRecent = getMostRecentStudyContinuity('user-B', 'sec-1', 'board-1');
    expect(userBRecent).toBeNull();
  });

  // G. section isolation
  it('G. section isolation prevents cross-section leakage', () => {
    saveStudyContinuityRecord('user-1', 'sec-1', 'board-1', {
      sourceObjectId: 'pdf-1',
      workObjectId: 'nb-1',
      lastActiveAt: 1000,
    });

    const sec2Store = loadStudyContinuityStore('user-1', 'sec-2', 'board-1');
    expect(sec2Store?.records).toEqual({});
    expect(getMostRecentStudyContinuity('user-1', 'sec-2', 'board-1')).toBeNull();
  });

  // H. board isolation
  it('H. board isolation prevents cross-board leakage', () => {
    saveStudyContinuityRecord('user-1', 'sec-1', 'board-1', {
      sourceObjectId: 'pdf-1',
      workObjectId: 'nb-1',
      lastActiveAt: 1000,
    });

    const board2Store = loadStudyContinuityStore('user-1', 'sec-1', 'board-2');
    expect(board2Store?.records).toEqual({});
    expect(getMostRecentStudyContinuity('user-1', 'sec-1', 'board-2')).toBeNull();
  });

  // I. localStorage exception safe fallback
  it('I. handles localStorage exceptions gracefully without crashing', () => {
    // happy-dom Storage Proxy ignores direct method assignment; use defineProperty.
    const unpatchGet = patchStorageMethod(localStorage, 'getItem', (() => {
      throw new Error('QuotaExceeded / SecurityError');
    }) as Storage['getItem']);
    try {
      expect(loadStudyContinuityStore('user-1', 'sec-1', 'board-1')).toBeNull();
    } finally {
      unpatchGet();
    }

    const unpatchSet = patchStorageMethod(localStorage, 'setItem', (() => {
      throw new Error('QuotaExceeded');
    }) as Storage['setItem']);
    try {
      expect(saveStudyContinuityRecord('user-1', 'sec-1', 'board-1', {
        sourceObjectId: 'pdf-1',
        workObjectId: 'nb-1',
        lastActiveAt: 1000,
      })).toBe(false);
    } finally {
      unpatchSet();
    }
  });

  // J. 10-record maximum & K. 11th record prunes oldest
  it('J & K. enforces 10-record maximum and prunes oldest lastActiveAt when 11th added', () => {
    for (let i = 1; i <= 10; i++) {
      saveStudyContinuityRecord('user-1', 'sec-1', 'board-1', {
        sourceObjectId: `pdf-${i}`,
        workObjectId: `nb-${i}`,
        lastActiveAt: i * 100, // 100, 200, ..., 1000
      });
    }

    let store = loadStudyContinuityStore('user-1', 'sec-1', 'board-1');
    expect(Object.keys(store!.records).length).toBe(MAX_CONTINUITY_RECORDS);
    expect(store?.records['pdf-1']).toBeDefined();

    // Add 11th record with newer timestamp
    saveStudyContinuityRecord('user-1', 'sec-1', 'board-1', {
      sourceObjectId: 'pdf-11',
      workObjectId: 'nb-11',
      lastActiveAt: 1100,
    });

    store = loadStudyContinuityStore('user-1', 'sec-1', 'board-1');
    expect(Object.keys(store!.records).length).toBe(MAX_CONTINUITY_RECORDS);
    // pdf-1 (oldest: 100) must be pruned
    expect(store?.records['pdf-1']).toBeUndefined();
    expect(store?.records['pdf-2']).toBeDefined();
    expect(store?.records['pdf-11']).toBeDefined();
  });

  // L. mostRecentSourceId remains valid after pruning
  it('L. mostRecentSourceId updates properly and remains valid after pruning', () => {
    saveStudyContinuityRecord('user-1', 'sec-1', 'board-1', {
      sourceObjectId: 'pdf-A',
      workObjectId: 'nb-A',
      lastActiveAt: 100,
    });
    saveStudyContinuityRecord('user-1', 'sec-1', 'board-1', {
      sourceObjectId: 'pdf-B',
      workObjectId: 'nb-B',
      lastActiveAt: 200,
    });

    let recent = getMostRecentStudyContinuity('user-1', 'sec-1', 'board-1');
    expect(recent?.sourceObjectId).toBe('pdf-B');

    // Update pdf-A with newer timestamp
    saveStudyContinuityRecord('user-1', 'sec-1', 'board-1', {
      sourceObjectId: 'pdf-A',
      workObjectId: 'nb-A',
      lastActiveAt: 300,
    });

    recent = getMostRecentStudyContinuity('user-1', 'sec-1', 'board-1');
    expect(recent?.sourceObjectId).toBe('pdf-A');
  });

  // M. no legacy key read
  it('M. does not read from legacy unscoped study_sessions_v1 key', () => {
    const legacyKey = 'fw_section_sec-1_board_board-1_study_sessions_v1';
    localStorage.setItem(
      legacyKey,
      JSON.stringify({
        version: 1,
        sessions: {
          'pdf-legacy': {
            sourceObjectId: 'pdf-legacy',
            workObjectId: 'nb-legacy',
            lastActiveAt: 9999,
          },
        },
      }),
    );

    const store = loadStudyContinuityStore('user-1', 'sec-1', 'board-1');
    expect(store?.records['pdf-legacy']).toBeUndefined();
    expect(getMostRecentStudyContinuity('user-1', 'sec-1', 'board-1')).toBeNull();
  });
});
