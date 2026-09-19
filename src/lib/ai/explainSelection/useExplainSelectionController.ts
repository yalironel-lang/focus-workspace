/**
 * M0.3 Explain selection request lifecycle (client-only).
 * Snapshot is frozen at activation; never re-captured on response.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/core';
import {
  captureNotebookAiContext,
  type CaptureNotebookAiContextHost,
  type ZikukAiContext,
} from '../context';
import { zikukAiRequest, type ZikukAiErrorCode } from '../gatewayClient';
import { isExplainableFocus } from './isExplainableFocus';
import { extractFocus } from '../context/extractFocus';

export type ExplainHost = CaptureNotebookAiContextHost;

export type ExplainPhase = 'idle' | 'loading' | 'success' | 'error';

export type ExplainSelectionState = {
  phase: ExplainPhase;
  frozenContext: ZikukAiContext | null;
  resultText: string | null;
  errorMessage: string | null;
  errorCode: ZikukAiErrorCode | null;
  localUnavailable: 'missing_host' | 'capture_failed' | 'not_explainable' | null;
};

const IDLE: ExplainSelectionState = {
  phase: 'idle',
  frozenContext: null,
  resultText: null,
  errorMessage: null,
  errorCode: null,
  localUnavailable: null,
};

export function useExplainSelectionController(input: {
  editor: Editor;
  host: ExplainHost | null;
  /** Invalidate in-flight work when the Notebook page changes. */
  pageKey: string;
}) {
  const { editor, host, pageKey } = input;
  const [state, setState] = useState<ExplainSelectionState>(IDLE);
  const genRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const frozenRef = useRef<ZikukAiContext | null>(null);
  const pageKeyRef = useRef(pageKey);
  pageKeyRef.current = pageKey;

  const abortInFlight = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const close = useCallback(() => {
    abortInFlight();
    genRef.current += 1;
    frozenRef.current = null;
    setState(IDLE);
  }, [abortInFlight]);

  // Page change → abort + close stale panel
  useEffect(() => {
    abortInFlight();
    genRef.current += 1;
    frozenRef.current = null;
    setState(IDLE);
  }, [pageKey, abortInFlight]);

  useEffect(() => {
    return () => {
      abortInFlight();
      genRef.current += 1;
    };
  }, [abortInFlight]);

  const runWithFrozen = useCallback(
    async (frozen: ZikukAiContext) => {
      abortInFlight();
      const gen = ++genRef.current;
      const ac = new AbortController();
      abortRef.current = ac;
      frozenRef.current = frozen;
      setState({
        phase: 'loading',
        frozenContext: frozen,
        resultText: null,
        errorMessage: null,
        errorCode: null,
        localUnavailable: null,
      });

      const response = await zikukAiRequest(
        {
          version: 1,
          capability: 'explain_selection',
          context: frozen,
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

      if (response.ok) {
        setState({
          phase: 'success',
          frozenContext: frozen,
          resultText: response.result.text,
          errorMessage: null,
          errorCode: null,
          localUnavailable: null,
        });
        return;
      }

      // Abort / cancel must not surface as a provider failure.
      if (ac.signal.aborted || response.error.message === 'Request cancelled.') {
        return;
      }

      setState({
        phase: 'error',
        frozenContext: frozen,
        resultText: null,
        errorMessage: response.error.message,
        errorCode: response.error.code,
        localUnavailable: null,
      });
    },
    [abortInFlight],
  );

  /**
   * Call ONLY after toolbar ensureSelection / busy is set.
   * Synchronously captures context from the current editor selection.
   */
  const activateExplain = useCallback(() => {
    if (!host) {
      setState({
        ...IDLE,
        phase: 'error',
        localUnavailable: 'missing_host',
        errorMessage: 'Sign in and open a notebook section to use Explain.',
        errorCode: 'unauthenticated',
      });
      return;
    }

    const focus = extractFocus(editor);
    if (!isExplainableFocus(focus)) {
      setState({
        ...IDLE,
        phase: 'error',
        localUnavailable: 'not_explainable',
        errorMessage: 'This selection cannot be explained yet.',
        errorCode: 'unsupported_content',
      });
      return;
    }

    const captured = captureNotebookAiContext({ editor, host });
    if (!captured.ok) {
      setState({
        ...IDLE,
        phase: 'error',
        localUnavailable: 'capture_failed',
        errorMessage: 'Could not capture this selection.',
        errorCode: 'invalid_request',
      });
      return;
    }

    void runWithFrozen(captured.context);
  }, [editor, host, runWithFrozen]);

  const retry = useCallback(() => {
    const frozen = frozenRef.current;
    if (!frozen) return;
    void runWithFrozen(frozen);
  }, [runWithFrozen]);

  return {
    state,
    activateExplain,
    retry,
    close,
    isOpen: state.phase !== 'idle',
  };
}

/** Cheap visibility for toolbar: reuse extractFocus only when toolbar is already shown. */
export function shouldShowExplainAction(editor: Editor): boolean {
  if (!editor || editor.isDestroyed) return false;
  return isExplainableFocus(extractFocus(editor));
}
