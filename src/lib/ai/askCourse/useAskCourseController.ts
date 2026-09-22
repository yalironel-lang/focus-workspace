/**
 * M0.6 Ask ZIKUK — single-result request lifecycle (client-only).
 * IDLE | LOADING | SUCCESS | ERROR. No history, threads, or persistence.
 *
 * M0.9B.1: on success, composer (`question`) clears while `submittedQuestion`
 * remains for the result surface. On error, composer keeps the question for retry.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  zikukAiRequest,
  type AskCourseSourceRef,
  type ZikukAiErrorCode,
} from '../gatewayClient';

export type AskCoursePhase = 'idle' | 'loading' | 'success' | 'error';

export type AskCourseState = {
  phase: AskCoursePhase;
  /** Composer draft / retry text. */
  question: string;
  /** Last successfully submitted question (result surface). Cleared on idle/loading reset. */
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
}) {
  const { sectionId, open } = input;
  const [state, setState] = useState<AskCourseState>(IDLE);
  const genRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const questionRef = useRef('');
  const phaseRef = useRef<AskCoursePhase>(IDLE.phase);
  phaseRef.current = state.phase;
  const sectionIdRef = useRef(sectionId);
  sectionIdRef.current = sectionId;

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

      abortInFlight();
      const gen = ++genRef.current;
      const ac = new AbortController();
      abortRef.current = ac;
      questionRef.current = question;

      setState({
        phase: 'loading',
        question,
        submittedQuestion: null,
        resultText: null,
        sources: [],
        errorMessage: null,
        errorCode: null,
      });

      const response = await zikukAiRequest(
        {
          version: 1,
          capability: 'ask_course',
          sectionId: sid,
          question,
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
        questionRef.current = '';
        setState({
          phase: 'success',
          question: '',
          submittedQuestion: question,
          resultText: response.result.text,
          sources: response.result.sources,
          errorMessage: null,
          errorCode: null,
        });
        return;
      }

      if (ac.signal.aborted || response.error.message === 'Request cancelled.') {
        return;
      }

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
    const q = questionRef.current;
    if (!normalizeQuestion(q)) return;
    void runAsk(q);
  }, [runAsk]);

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
