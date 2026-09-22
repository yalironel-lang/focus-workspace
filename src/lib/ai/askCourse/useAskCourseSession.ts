/**
 * M0.9C2 — ephemeral Ask session (in-memory turns + v2 request wiring).
 * UI history may grow; model context is bounded via buildAskCourseRecentTurns.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AskCourseRecentTurn, AskCourseSourceRef } from '../gatewayClient';
import { useAskCourseController } from './useAskCourseController';
import { buildAskCourseRecentTurns } from './buildAskCourseRecentTurns';

export type AskSessionTurn = {
  id: string;
  question: string;
  answer: string;
  sources: AskCourseSourceRef[];
  status: 'success';
};

function newTurnId(): string {
  return `ask-turn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function useAskCourseSession(input: {
  sectionId: string;
  open: boolean;
}) {
  const { sectionId, open } = input;
  const [turns, setTurns] = useState<AskSessionTurn[]>([]);
  const turnsRef = useRef<AskSessionTurn[]>([]);
  turnsRef.current = turns;

  const getRecentTurns = useCallback((): AskCourseRecentTurn[] => {
    return buildAskCourseRecentTurns(turnsRef.current);
  }, []);

  const onAskSuccess = useCallback(
    (result: { question: string; text: string; sources: AskCourseSourceRef[] }) => {
      setTurns(prev => [
        ...prev,
        {
          id: newTurnId(),
          question: result.question,
          answer: result.text,
          sources: result.sources,
          status: 'success',
        },
      ]);
    },
    [],
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
    getRecentTurns,
    onAskSuccess,
  });

  // Mirror controller lifecycle: wipe turns on section change / close
  useEffect(() => {
    setTurns([]);
  }, [sectionId]);

  useEffect(() => {
    if (!open) setTurns([]);
  }, [open]);

  const newConversation = useCallback(() => {
    reset();
    setTurns([]);
  }, [reset]);

  const activePendingQuestion =
    state.phase === 'loading' ? state.submittedQuestion : null;

  return {
    turns,
    activePendingQuestion,
    state,
    setQuestion,
    submit,
    retry,
    reset,
    newConversation,
    canSubmit,
    isLoading,
    /** Test seam: inspect what would be sent as recentTurns right now. */
    getRecentTurnsForTest: getRecentTurns,
  };
}
