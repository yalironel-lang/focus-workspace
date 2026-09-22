/**
 * M0.6 / M0.9C2 Ask ZIKUK — single-request lifecycle (client-only).
 * IDLE | LOADING | SUCCESS | ERROR.
 *
 * M0.9B.1: on success without onAskSuccess, composer clears; submittedQuestion kept for single result.
 * M0.9C2: sends ask_course v2; optional getRecentTurns + onAskSuccess for session threads.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  zikukAiRequest,
  type AskCourseRecentTurn,
  type AskCourseSourceRef,
  type ZikukAiErrorCode,
} from '../gatewayClient';

export type AskCoursePhase = 'idle' | 'loading' | 'success' | 'error';

export type AskCourseState = {
  phase: AskCoursePhase;
  /** Composer draft / retry text. */
  question: string;
  /** Last successfully submitted question (single-result surface). Cleared when onAskSuccess used. */
  submittedQuestion: string | null;
  resultText: string | null;
  sources: AskCourseSourceRef[];
  errorMessage: string | null;
  errorCode: ZikukAiErrorCode | null;
};

const IDLE: AskCourseState = {
  phase: 'idle',
  question: '',
  submittedQuestion: null,
  resultText: null,
  sources: [],
  errorMessage: null,
  errorCode: null,
};

function normalizeQuestion(raw: string): string {
  return raw.trim();
}

export function useAskCourseController(input: {
  /** Trusted section id from SectionPage route/state — never editable in UI. */
  sectionId: string;
  /** When false, abort in-flight work and clear ephemeral result. */
  open: boolean;
  /**
   * Called at submit time to build prior-turn context for ask_course v2.
   * Must NOT include the current question.
   */
  getRecentTurns?: () => AskCourseRecentTurn[];
  /**
   * When set, success is handed to the session layer and controller returns to IDLE
   * (composer cleared). Single-result SUCCESS state is skipped.
   */
  onAskSuccess?: (result: {
    question: string;
    text: string;
    sources: AskCourseSourceRef[];
  }) => void;
}) {
  const { sectionId, open, getRecentTurns, onAskSuccess } = input;
  const [state, setState] = useState<AskCourseState>(IDLE);
  const genRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const questionRef = useRef('');
  const phaseRef = useRef<AskCoursePhase>(IDLE.phase);
  phaseRef.current = state.phase;
  const sectionIdRef = useRef(sectionId);
  sectionIdRef.current = sectionId;
  const getRecentTurnsRef = useRef(getRecentTurns);
  getRecentTurnsRef.current = getRecentTurns;
  const onAskSuccessRef = useRef(onAskSuccess);
  onAskSuccessRef.current = onAskSuccess;

  const abortInFlight = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const resetEphemeral = useCallback(() => {
    abortInFlight();
    genRef.current += 1;
    questionRef.current = '';
    setState(IDLE);
  }, [abortInFlight]);

  // Section change → abort + invalidate + clear (never paint old answer in new section)
  useEffect(() => {
    abortInFlight();
    genRef.current += 1;
    questionRef.current = '';
    setState(IDLE);
  }, [sectionId, abortInFlight]);

  // Panel close → abort + clear
  useEffect(() => {
    if (open) return;
    abortInFlight();
    genRef.current += 1;
    questionRef.current = '';
    setState(IDLE);
  }, [open, abortInFlight]);

  useEffect(() => {
    return () => {
      abortInFlight();
      genRef.current += 1;
    };
  }, [abortInFlight]);

  const setQuestion = useCallback((next: string) => {
    questionRef.current = next;
    setState(prev => ({ ...prev, question: next }));
  }, []);

  const runAsk = useCallback(
    async (rawQuestion: string) => {
      const question = normalizeQuestion(rawQuestion);
      if (!question) return;
      if (phaseRef.current === 'loading') return;

      const sid = sectionIdRef.current;
      if (!sid) return;

      // Capture prior context BEFORE this turn (never includes current question).
      const recentTurnsRaw = getRecentTurnsRef.current?.() ?? [];
      const recentTurns =
        Array.isArray(recentTurnsRaw) && recentTurnsRaw.length > 0
          ? recentTurnsRaw
          : undefined;

      abortInFlight();
      const gen = ++genRef.current;
      const ac = new AbortController();
      abortRef.current = ac;
      // Session mode: clear composer while the pending turn shows the question.
      // Single-result mode: keep draft visible until success clears it.
      const sessionMode = typeof onAskSuccessRef.current === 'function';
      questionRef.current = sessionMode ? '' : question;

      setState({
        phase: 'loading',
        question: sessionMode ? '' : question,
        submittedQuestion: question,
        resultText: null,
        sources: [],
        errorMessage: null,
        errorCode: null,
      });

      const response = await zikukAiRequest(
        {
          version: 2,
          capability: 'ask_course',
          sectionId: sid,
          question,
          ...(recentTurns ? { recentTurns } : {}),
        },
        { signal: ac.signal },
      ).catch((e: unknown) => {
        if (ac.signal.aborted || (e instanceof DOMException && e.name === 'AbortError')) {
          return {
            version: 1 as const,
            ok: false as const,
            error: {
              code: 'provider_timeout' as const,
              message: 'Request cancelled.',
            },
          };
        }
        throw e;
      });

      if (gen !== genRef.current) return;
      if (ac.signal.aborted) return;
      if (sid !== sectionIdRef.current) return;

      if (response.ok) {
        if (response.result.type !== 'ask_course') {
          questionRef.current = question;
          setState({
            phase: 'error',
            question,
            submittedQuestion: null,
            resultText: null,
            sources: [],
            errorMessage: 'Unexpected response.',
            errorCode: 'internal_error',
          });
          return;
        }
        const text = response.result.text;
        const sources = response.result.sources;
        const successHandler = onAskSuccessRef.current;
        if (successHandler) {
          successHandler({ question, text, sources });
          questionRef.current = '';
          setState(IDLE);
          return;
        }
        questionRef.current = '';
        setState({
          phase: 'success',
          question: '',
          submittedQuestion: question,
          resultText: text,
          sources,
          errorMessage: null,
          errorCode: null,
        });
        return;
      }

      if (ac.signal.aborted || response.error.message === 'Request cancelled.') {
        return;
      }

      // Restore failed question into composer for retry.
      questionRef.current = question;
      setState({
        phase: 'error',
        question,
        submittedQuestion: null,
        resultText: null,
        sources: [],
        errorMessage: response.error.message,
        errorCode: response.error.code,
      });
    },
    [abortInFlight],
  );

  const submit = useCallback(() => {
    void runAsk(questionRef.current);
  }, [runAsk]);

  const retry = useCallback(() => {
    const q = normalizeQuestion(questionRef.current) || normalizeQuestion(state.question);
    if (!q) return;
    void runAsk(q);
  }, [runAsk, state.question]);

  return {
    state,
    setQuestion,
    submit,
    retry,
    reset: resetEphemeral,
    canSubmit:
      normalizeQuestion(state.question).length > 0 && state.phase !== 'loading',
    isLoading: state.phase === 'loading',
  };
}
