/**
 * M0.9C2 / M0.9C2.2 / M0.9C2.3 / TQ1.2.3 — Ask session (turns + v2 wiring + local continuity).
 *
 * M0.9C2.3: persist successful turns + draft per user+section in localStorage.
 * TQ1.2.3: support active TeachingMode per course, turn-level mode tags,
 * and seamless v1 session migration.
 * Close/Escape hides Ask but does not destroy the conversation.
 * New conversation clears memory + storage, resetting mode to 'explain'.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AskCourseSourceRef, ContextAvailable, KnowledgeTier, TeachingMode } from '../gatewayClient';
import { useAskCourseController } from './useAskCourseController';
import { buildAskCourseRecentTurns } from './buildAskCourseRecentTurns';
import { prepareAskCourseSubmitContext } from './prepareAskCourseSubmitContext';
import {
  clearAskSession,
  readAskSession,
  writeAskSession,
  type AskSessionTurn,
} from './askSessionStorage';

export type { AskSessionTurn };

function newTurnId(): string {
  return `ask-turn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function loadTurns(userId: string | null | undefined, sectionId: string): AskSessionTurn[] {
  return readAskSession(userId, sectionId)?.turns ?? [];
}

export function useAskCourseSession(input: {
  sectionId: string;
  open: boolean;
  /** Authenticated user id for storage isolation. Persistence disabled when missing. */
  userId?: string | null;
  /** Initial mode override if desired (defaults to persisted mode or 'explain'). */
  initialMode?: TeachingMode;
}) {
  const { sectionId, open, userId = null, initialMode } = input;
  const userIdRef = useRef(userId);
  userIdRef.current = userId;
  const sectionIdRef = useRef(sectionId);
  sectionIdRef.current = sectionId;

  const [turns, setTurns] = useState<AskSessionTurn[]>(() => loadTurns(userId, sectionId));
  const turnsRef = useRef<AskSessionTurn[]>(turns);
  turnsRef.current = turns;

  // Active teaching mode for this course
  const [mode, setModeState] = useState<TeachingMode>(() => {
    const stored = readAskSession(userId, sectionId);
    return stored?.mode ?? initialMode ?? 'explain';
  });
  const modeRef = useRef<TeachingMode>(mode);
  modeRef.current = mode;

  // Session generation: bumps on New conversation / section switch for stale safety.
  const sessionGenRef = useRef(0);

  const getSubmitContext = useCallback(() => {
    return prepareAskCourseSubmitContext(turnsRef.current);
  }, []);

  const persistNow = useCallback((nextTurns: AskSessionTurn[], draft: string, turnMode?: TeachingMode) => {
    writeAskSession(userIdRef.current, sectionIdRef.current, {
      turns: nextTurns,
      draft,
      mode: turnMode || modeRef.current,
    });
  }, []);

  const onAskSuccess = useCallback(
    (result: {
      question: string;
      text: string;
      sources: AskCourseSourceRef[];
      mode?: TeachingMode;
      knowledgeTier?: KnowledgeTier;
      contextAvailable?: ContextAvailable;
      generationIncomplete?: boolean;
    }) => {
      const gen = sessionGenRef.current;
      const sid = sectionIdRef.current;
      const turnMode = result.mode || modeRef.current;
      setTurns(prev => {
        if (gen !== sessionGenRef.current) return prev;
        if (sid !== sectionIdRef.current) return prev;
        const next: AskSessionTurn[] = [
          ...prev,
          {
            id: newTurnId(),
            question: result.question,
            answer: result.text,
            sources: result.sources,
            status: 'success',
            mode: turnMode,
            ...(result.knowledgeTier ? { knowledgeTier: result.knowledgeTier } : {}),
            ...(result.contextAvailable ? { contextAvailable: result.contextAvailable } : {}),
            ...(result.generationIncomplete ? { generationIncomplete: true } : {}),
          },
        ];
        turnsRef.current = next;
        persistNow(next, '', turnMode);
        return next;
      });
    },
    [persistNow],
  );

  const {
    state,
    setQuestion,
    submit,
    retry,
    reset,
    canSubmit,
    isLoading,
  } = useAskCourseController({
    sectionId,
    open,
    getSubmitContext,
    onAskSuccess,
    mode,
  });

  const questionRefForPersist = useRef(state.question);
  questionRefForPersist.current = state.question;

  const setMode = useCallback((newMode: TeachingMode) => {
    setModeState(newMode);
    modeRef.current = newMode;
    if (userIdRef.current && sectionIdRef.current) {
      writeAskSession(userIdRef.current, sectionIdRef.current, {
        turns: turnsRef.current,
        draft: questionRefForPersist.current,
        mode: newMode,
      });
    }
  }, []);

  // Section / user scope change → load that section's persisted session (or empty).
  // If auth hydrates (null → userId) and we already have in-memory turns with empty storage,
  // keep + persist them instead of wiping a mid-session conversation.
  const prevUserIdRef = useRef(userId);
  useEffect(() => {
    sessionGenRef.current += 1;
    const prevUser = prevUserIdRef.current;
    prevUserIdRef.current = userId;

    const stored = readAskSession(userId, sectionId);
    if (
      !stored &&
      !prevUser &&
      userId &&
      turnsRef.current.length > 0
    ) {
      persistNow(turnsRef.current, questionRefForPersist.current, modeRef.current);
      return;
    }
    const nextTurns = stored?.turns ?? [];
    const nextDraft = stored?.draft ?? '';
    const nextMode = stored?.mode ?? 'explain';
    turnsRef.current = nextTurns;
    setTurns(nextTurns);
    setQuestion(nextDraft);
    setModeState(nextMode);
    modeRef.current = nextMode;
  }, [sectionId, userId, setQuestion, persistNow]);

  // Persist draft while typing (successful turns already persisted on success).
  // Skip writing a blank empty session (avoids littering storage on course switch).
  useEffect(() => {
    if (!userId) return;
    const draft = state.question;
    if (turnsRef.current.length === 0 && !draft.trim()) {
      // If nothing meaningful, ensure no stale empty key for this section.
      const existing = readAskSession(userId, sectionId);
      if (!existing || (existing.turns.length === 0 && !existing.draft.trim())) {
        clearAskSession(userId, sectionId);
      }
      return;
    }
    writeAskSession(userId, sectionId, {
      turns: turnsRef.current,
      draft,
      mode: modeRef.current,
    });
  }, [state.question, userId, sectionId]);

  // Restore draft once when Ask reopens (controller may have preserved it; storage is source of truth after refresh).
  const wasOpenRef = useRef(open);
  useEffect(() => {
    const wasOpen = wasOpenRef.current;
    wasOpenRef.current = open;
    if (!wasOpen && open) {
      const stored = readAskSession(userIdRef.current, sectionIdRef.current);
      if (stored && stored.draft && !state.question) {
        setQuestion(stored.draft);
      }
      if (stored && stored.mode) {
        setModeState(stored.mode);
        modeRef.current = stored.mode;
      }
    }
  }, [open, setQuestion, state.question]);

  const newConversation = useCallback(() => {
    sessionGenRef.current += 1;
    reset();
    turnsRef.current = [];
    setTurns([]);
    setModeState('explain');
    modeRef.current = 'explain';
    clearAskSession(userIdRef.current, sectionIdRef.current);
  }, [reset]);

  const activePendingQuestion =
    state.phase === 'loading' ? state.submittedQuestion : null;

  return {
    turns,
    activePendingQuestion,
    state,
    mode,
    setMode,
    setQuestion,
    submit,
    retry,
    reset,
    newConversation,
    canSubmit,
    isLoading,
    getRecentTurnsForTest: () => buildAskCourseRecentTurns(turnsRef.current),
    getSubmitContextForTest: getSubmitContext,
  };
}
