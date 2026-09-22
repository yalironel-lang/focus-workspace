/**
 * M0.6 / M0.9C2 / M0.9C2.2 Ask ZIKUK — single-request lifecycle (client-only).
 * IDLE | LOADING | SUCCESS | ERROR.
 *
 * M0.9C2.2: single immutable submit-context snapshot; prior turns ⇒ non-empty recentTurns.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  zikukAiRequest,
  type AskCourseRecentTurn,
  type AskCourseSourceRef,
  type ZikukAiErrorCode,
} from '../gatewayClient';
import { logAskCourseSubmitDiag } from './logAskCourseSubmitDiag';
import type { PrepareAskCourseSubmitContextResult } from './prepareAskCourseSubmitContext';

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
   * M0.9C2.2 — capture ONE immutable prior-turn snapshot at submit time.
   * Must NOT include the current question.
   */
  getSubmitContext?: () => PrepareAskCourseSubmitContextResult;
  /**
   * @deprecated Prefer getSubmitContext. Still accepted for thin unit tests.
   * Called only when getSubmitContext is absent.
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
  const { sectionId, open, getSubmitContext, getRecentTurns, onAskSuccess } = input;
  const [state, setState] = useState<AskCourseState>(IDLE);
  const genRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const questionRef = useRef('');
  const phaseRef = useRef<AskCoursePhase>(IDLE.phase);
  phaseRef.current = state.phase;
  const sectionIdRef = useRef(sectionId);
  sectionIdRef.current = sectionId;
  const getSubmitContextRef = useRef(getSubmitContext);
  getSubmitContextRef.current = getSubmitContext;
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

  // Panel close → abort + invalidate in-flight.
  // Session mode (getSubmitContext): preserve composer draft; do not wipe conversation ownership.
  // Single-result mode: clear ephemeral state entirely.
  useEffect(() => {
    if (open) return;
    abortInFlight();
    genRef.current += 1;
    const sessionMode = typeof getSubmitContextRef.current === 'function';
    if (sessionMode) {
      setState(prev => {
        const draft =
          prev.phase === 'loading'
            ? (prev.submittedQuestion ?? prev.question)
            : prev.question;
        questionRef.current = draft;
        return {
          ...IDLE,
          question: draft,
        };
      });
      return;
    }
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

      // ONE immutable snapshot of prior context BEFORE this turn.
      let recentTurns: AskCourseRecentTurn[] | undefined;
      let priorSuccessfulTurnCount = 0;
      let recentUserTurnCount = 0;
      let recentAssistantTurnCount = 0;
      let recentTurnsTotalChars = 0;

      const capture = getSubmitContextRef.current;
      if (capture) {
        const prepared = capture();
        if (!prepared.ok) {
          if (import.meta.env.DEV) {
            // eslint-disable-next-line no-console
            console.error('[ask_course] recentTurns invariant failed', {
              reason: prepared.reason,
              priorSuccessfulTurnCount: prepared.priorSuccessfulTurnCount,
            });
          }
          questionRef.current = question;
          setState({
            phase: 'error',
            question,
            submittedQuestion: null,
            resultText: null,
            sources: [],
            errorMessage: 'That question could not be sent. Try again.',
            errorCode: 'internal_error',
          });
          return;
        }
        const ctx = prepared.context;
        priorSuccessfulTurnCount = ctx.priorSuccessfulTurnCount;
        recentUserTurnCount = ctx.recentUserTurnCount;
        recentAssistantTurnCount = ctx.recentAssistantTurnCount;
        recentTurnsTotalChars = ctx.recentTurnsTotalChars;
        recentTurns = ctx.recentTurns.length > 0 ? ctx.recentTurns : undefined;
      } else {
        const recentTurnsRaw = getRecentTurnsRef.current?.() ?? [];
        recentTurns =
          Array.isArray(recentTurnsRaw) && recentTurnsRaw.length > 0
            ? recentTurnsRaw
            : undefined;
        if (recentTurns) {
          priorSuccessfulTurnCount = -1; // unknown without session snapshot
          for (const t of recentTurns) {
            if (t.role === 'user') recentUserTurnCount += 1;
            else recentAssistantTurnCount += 1;
            recentTurnsTotalChars += t.content.length;
          }
        }
      }

      abortInFlight();
      const gen = ++genRef.current;
      const ac = new AbortController();
      abortRef.current = ac;
      // Session mode: clear composer while the pending turn shows the question.
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

      logAskCourseSubmitDiag({
        event: 'ask_course_submit_diag',
        version: 2,
        requestGen: gen,
        hasSectionId: Boolean(sid),
        priorSuccessfulTurnCount,
        recentTurnsCount: recentTurns?.length ?? 0,
        recentUserTurnCount,
        recentAssistantTurnCount,
        currentQuestionLength: question.length,
        recentTurnsTotalChars,
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
