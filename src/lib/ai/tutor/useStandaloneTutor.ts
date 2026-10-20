import { useCallback, useRef, useState, useEffect } from 'react';
import {
  zikukAiRequest,
  type AskCourseRecentTurn,
  type AskCourseSourceRef,
  type ContextAvailable,
  type DocumentWindowCoverage,
  type DocumentWindowCursor,
  type KnowledgeTier,
  type ActivePdfDocument,
  type PdfCaptureAttachment,
  type ZikukAiAskCourseRequest,
  type ZikukAiErrorCode,
} from '../gatewayClient';
import {
  legacyActionToTeachingMode,
  teachingModeToLegacyAction,
  type TutorCaptureIntent,
  type TeachingMode,
} from './tutorCaptureTypes';
import {
  readTutorSession,
  writeTutorSession,
  clearTutorSession,
  archiveTutorThread,
  type TutorArchivedThread,
} from './tutorSessionStorage';

export type TutorTurn = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: AskCourseSourceRef[];
  timestamp: number;
  mode?: TeachingMode;
  knowledgeTier?: KnowledgeTier;
  contextAvailable?: ContextAvailable;
  generationIncomplete?: boolean;
  /** Page window actually retrieved for this answer. Not a citation. */
  documentWindow?: DocumentWindowCoverage;
};

export type TutorState = {
  status: 'idle' | 'loading' | 'success' | 'error';
  turns: TutorTurn[];
  errorMessage: string | null;
  /** Gateway code for the current error. Absent on older in-memory states. */
  errorCode?: ZikukAiErrorCode | null;
};

function captureAttachmentKey(intent: TutorCaptureIntent): string {
  const attachment = intent.attachment;
  return `${attachment.sourceObjectId}\0${attachment.pageNumber}\0${attachment.extractedText}`;
}

export type UseStandaloneTutorOptions = {
  sectionId: string;
  sourceObjectId?: string | null;
  userId?: string | null;
  /** Visible PDF page. Not stored on the conversation record. */
  visiblePage?: number | null;
  initialIntent?: TutorCaptureIntent | null;
  initialMode?: TeachingMode;
};

function activePdfDocument(
  sourceObjectId: string | null,
  visiblePage: number | null | undefined,
): ActivePdfDocument | undefined {
  if (!sourceObjectId?.trim()) return undefined;
  if (typeof visiblePage !== 'number' || !Number.isInteger(visiblePage) || visiblePage < 1 || visiblePage > 10000) {
    return undefined;
  }
  return {
    sourceKind: 'free_space_pdf',
    sourceObjectId: sourceObjectId.trim(),
    pageNumber: visiblePage,
  };
}

function documentCursorForSource(
  turns: TutorTurn[],
  sourceObjectId: string | null,
): DocumentWindowCursor | undefined {
  if (!sourceObjectId) return undefined;
  for (let i = turns.length - 1; i >= 0; i -= 1) {
    const window = turns[i]?.documentWindow;
    if (!window) continue;
    if (window.sourceObjectId !== sourceObjectId) return undefined;
    return { sourceObjectId: window.sourceObjectId, resumeFromPage: window.resumeFromPage };
  }
  return undefined;
}

export function useStandaloneTutor(
  optionsOrSectionId: string | UseStandaloneTutorOptions,
) {
  const options: UseStandaloneTutorOptions =
    typeof optionsOrSectionId === 'string'
      ? { sectionId: optionsOrSectionId }
      : optionsOrSectionId;

  const { sectionId, sourceObjectId = null, userId = null } = options;

  const userIdRef = useRef(userId);
  userIdRef.current = userId;
  const sectionIdRef = useRef(sectionId);
  sectionIdRef.current = sectionId;
  const sourceObjectIdRef = useRef(sourceObjectId);
  sourceObjectIdRef.current = sourceObjectId;
  const visiblePageRef = useRef(options.visiblePage ?? null);
  visiblePageRef.current = options.visiblePage ?? null;

  // Hydrate initial turns and mode from scoped persistence if available
  const [mode, setModeState] = useState<TeachingMode>(() => {
    if (userId && sectionId && sourceObjectId) {
      const persisted = readTutorSession(userId, sectionId, sourceObjectId);
      if (persisted?.mode) return persisted.mode;
      if (persisted?.intent) return legacyActionToTeachingMode(persisted.intent.action);
    }
    if (options.initialMode) return options.initialMode;
    if (options.initialIntent?.mode) return options.initialIntent.mode;
    if (options.initialIntent?.action) return legacyActionToTeachingMode(options.initialIntent.action);
    return 'explain';
  });
  const modeRef = useRef<TeachingMode>(mode);
  modeRef.current = mode;

  const [attachmentAttached, setAttachmentAttachedState] = useState(() => {
    if (userId && sectionId && sourceObjectId) {
      const persisted = readTutorSession(userId, sectionId, sourceObjectId);
      if (persisted) {
        if (!persisted.intent) return false;
        return persisted.attachmentAttached !== false;
      }
    }
    return Boolean(options.initialIntent);
  });
  const attachmentAttachedRef = useRef(attachmentAttached);
  attachmentAttachedRef.current = attachmentAttached;

  const [state, setState] = useState<TutorState>(() => {
    if (userId && sectionId && sourceObjectId) {
      const persisted = readTutorSession(userId, sectionId, sourceObjectId);
      if (persisted && persisted.turns.length > 0) {
        return {
          status: 'idle',
          turns: persisted.turns,
          errorMessage: null,
        };
      }
    }
    return {
      status: 'idle',
      turns: [],
      errorMessage: null,
    };
  });

  const [archivedThreads, setArchivedThreads] = useState<TutorArchivedThread[]>(() => {
    if (userId && sectionId && sourceObjectId) {
      const persisted = readTutorSession(userId, sectionId, sourceObjectId);
      return persisted?.archivedThreads ?? [];
    }
    return [];
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const turnsRef = useRef<TutorTurn[]>(state.turns);
  turnsRef.current = state.turns;
  const [captureIntent, setCaptureIntentState] = useState<TutorCaptureIntent | null>(() => {
    if (options.initialIntent) return options.initialIntent;
    if (userId && sectionId && sourceObjectId) {
      return readTutorSession(userId, sectionId, sourceObjectId)?.intent ?? null;
    }
    return null;
  });
  const activeIntentRef = useRef<TutorCaptureIntent | null>(captureIntent);
  const seenCaptureKeyRef = useRef<string | undefined>(undefined);

  // A new capture replaces the selection. Remounting the same capture must not undo Detach.
  useEffect(() => {
    const key = options.initialIntent ? captureAttachmentKey(options.initialIntent) : '';
    const previous = seenCaptureKeyRef.current;
    seenCaptureKeyRef.current = key;
    if (!options.initialIntent) return;
    activeIntentRef.current = options.initialIntent;
    setCaptureIntentState(options.initialIntent);
    const storedIntent =
      userId && sectionId && sourceObjectId
        ? readTutorSession(userId, sectionId, sourceObjectId)?.intent ?? null
        : null;
    const storedKey = storedIntent ? captureAttachmentKey(storedIntent) : '';
    const replacedSelection =
      (previous !== undefined && previous !== key) || (storedKey !== '' && storedKey !== key);
    if (replacedSelection) {
      setAttachmentAttachedState(true);
      attachmentAttachedRef.current = true;
    }
    const newMode = options.initialIntent.mode || legacyActionToTeachingMode(options.initialIntent.action);
    setModeState(newMode);
    modeRef.current = newMode;
  }, [options.initialIntent, userId, sectionId, sourceObjectId]);

  // Handle scope change (user, section, or sourceObjectId changes)
  const prevScopeRef = useRef(`${userId ?? ''}:${sectionId}:${sourceObjectId ?? ''}`);
  useEffect(() => {
    const currentScope = `${userId ?? ''}:${sectionId}:${sourceObjectId ?? ''}`;
    if (prevScopeRef.current !== currentScope) {
      prevScopeRef.current = currentScope;
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;

      if (userId && sectionId && sourceObjectId) {
        const persisted = readTutorSession(userId, sectionId, sourceObjectId);
        if (persisted) {
          const nextIntent = persisted.intent ?? options.initialIntent ?? null;
          activeIntentRef.current = nextIntent;
          setCaptureIntentState(nextIntent);
          const persistedMode = persisted.mode ?? (persisted.intent ? legacyActionToTeachingMode(persisted.intent.action) : 'explain');
          setModeState(persistedMode);
          modeRef.current = persistedMode;
          const attached = Boolean(nextIntent) && persisted.attachmentAttached !== false;
          setAttachmentAttachedState(attached);
          attachmentAttachedRef.current = attached;
          setArchivedThreads(persisted.archivedThreads ?? []);
          setState({
            status: 'idle',
            turns: persisted.turns,
            errorMessage: null,
          });
          return;
        }
      }
      const fallbackIntent = options.initialIntent ?? null;
      setAttachmentAttachedState(Boolean(fallbackIntent));
      attachmentAttachedRef.current = Boolean(fallbackIntent);
      activeIntentRef.current = fallbackIntent;
      setCaptureIntentState(fallbackIntent);
      setArchivedThreads([]);
      const defaultMode = options.initialMode || legacyActionToTeachingMode(options.initialIntent?.action);
      setModeState(defaultMode);
      modeRef.current = defaultMode;
      setState({
        status: 'idle',
        turns: [],
        errorMessage: null,
      });
    }
  }, [userId, sectionId, sourceObjectId, options.initialIntent, options.initialMode]);

  const setMode = useCallback((newMode: TeachingMode) => {
    setModeState(newMode);
    modeRef.current = newMode;
    if (activeIntentRef.current) {
      activeIntentRef.current = {
        ...activeIntentRef.current,
        mode: newMode,
        action: teachingModeToLegacyAction(newMode),
      };
      setCaptureIntentState(activeIntentRef.current);
    }
    const u = userIdRef.current;
    const s = sectionIdRef.current;
    const src = sourceObjectIdRef.current;
    const intent = activeIntentRef.current;
    if (u && s && src) {
      writeTutorSession(u, s, src, {
        intent,
        turns: turnsRef.current,
        mode: newMode,
        attachmentAttached: intent ? attachmentAttachedRef.current : false,
      });
    }
  }, []);

  // Helper to persist current state
  const persistState = useCallback((newTurns: TutorTurn[], draft?: string) => {
    const u = userIdRef.current;
    const s = sectionIdRef.current;
    const src = sourceObjectIdRef.current;
    const intent = activeIntentRef.current;
    const currentMode = modeRef.current;
    if (u && s && src) {
      writeTutorSession(u, s, src, {
        intent,
        turns: newTurns,
        draftQuestion: draft,
        mode: currentMode,
        attachmentAttached: intent ? attachmentAttachedRef.current : false,
      });
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const abort = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
  }, []);

  const reset = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    const u = userIdRef.current;
    const s = sectionIdRef.current;
    const src = sourceObjectIdRef.current;
    if (u && s && src) {
      clearTutorSession(u, s, src);
    }
    const resetIntent = options.initialIntent ?? null;
    activeIntentRef.current = resetIntent;
    setCaptureIntentState(resetIntent);
    setAttachmentAttachedState(Boolean(resetIntent));
    attachmentAttachedRef.current = Boolean(resetIntent);
    setArchivedThreads([]);
    setState({
      status: 'idle',
      turns: [],
      errorMessage: null,
    });
  }, [options.initialIntent]);

  const startNewThread = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    const currentTurns = turnsRef.current;
    const currentMode = modeRef.current;
    const u = userIdRef.current;
    const s = sectionIdRef.current;
    const src = sourceObjectIdRef.current;
    if (u && s && src && currentTurns.length > 0) {
      archiveTutorThread(u, s, src, currentTurns, currentMode);
      const updated = readTutorSession(u, s, src);
      setArchivedThreads(updated?.archivedThreads ?? []);
    }
    setState({
      status: 'idle',
      turns: [],
      errorMessage: null,
    });
  }, []);

  const restoreArchivedThread = useCallback((threadId: string) => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    const u = userIdRef.current;
    const s = sectionIdRef.current;
    const src = sourceObjectIdRef.current;
    if (!u || !s || !src) return;
    const session = readTutorSession(u, s, src);
    if (!session || !session.archivedThreads) return;
    const target = session.archivedThreads.find(t => t.id === threadId);
    if (!target) return;

    const currentTurns = turnsRef.current;
    let newArchived = session.archivedThreads.filter(t => t.id !== threadId);
    if (currentTurns.length > 0) {
      newArchived.push({
        id: `thread-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        mode: modeRef.current,
        turns: currentTurns,
        createdAt: Date.now(),
      });
    }

    setModeState(target.mode);
    modeRef.current = target.mode;
    setState({
      status: 'idle',
      turns: target.turns,
      errorMessage: null,
    });
    setArchivedThreads(newArchived);

    writeTutorSession(u, s, src, {
      intent: session.intent,
      turns: target.turns,
      mode: target.mode,
      presentation: session.presentation,
      archivedThreads: newArchived,
    });
  }, []);

  const setAttachmentAttached = useCallback((attached: boolean) => {
    setAttachmentAttachedState(attached);
    attachmentAttachedRef.current = attached;
    const u = userIdRef.current;
    const s = sectionIdRef.current;
    const src = sourceObjectIdRef.current;
    const intent = activeIntentRef.current;
    if (u && s && src && intent) {
      writeTutorSession(u, s, src, {
        intent,
        turns: turnsRef.current,
        mode: modeRef.current,
        attachmentAttached: attached,
      });
    }
  }, []);

  const setIntent = useCallback((intent: TutorCaptureIntent) => {
    activeIntentRef.current = intent;
    setCaptureIntentState(intent);
    const u = userIdRef.current;
    const s = sectionIdRef.current;
    const src = sourceObjectIdRef.current;
    if (u && s && src) {
      writeTutorSession(u, s, src, {
        intent,
        turns: turnsRef.current,
      });
    }
  }, []);

  const sendQuestion = useCallback(
    async (questionText: string, isInitial: boolean = false, turnMode?: TeachingMode) => {
      const trimmed = questionText.trim();
      const currentSectionId = sectionIdRef.current;
      if (!trimmed || !currentSectionId) return;

      const effectiveMode: TeachingMode = turnMode || modeRef.current;
      if (effectiveMode !== modeRef.current) {
        setModeState(effectiveMode);
        modeRef.current = effectiveMode;
        if (activeIntentRef.current) {
          activeIntentRef.current = {
            ...activeIntentRef.current,
            mode: effectiveMode,
            action: teachingModeToLegacyAction(effectiveMode),
          };
          setCaptureIntentState(activeIntentRef.current);
        }
      }

      abortControllerRef.current?.abort();
      const ac = new AbortController();
      abortControllerRef.current = ac;

      const userTurn: TutorTurn = {
        id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        role: 'user',
        content: trimmed,
        timestamp: Date.now(),
      };

      const prevTurns = isInitial ? [] : turnsRef.current;
      const updatedTurns = [...prevTurns, userTurn];

      setState({
        status: 'loading',
        turns: updatedTurns,
        errorMessage: null,
      });

      try {
        // Build recent turns from prior history (excluding the current turn)
        const recentTurns: AskCourseRecentTurn[] = prevTurns.map(t => ({
          role: t.role,
          content: t.content,
        }));

        const attachment = attachmentAttachedRef.current ? activeIntentRef.current?.attachment : undefined;
        const capture: PdfCaptureAttachment | undefined = attachment
          ? {
              sourceKind: 'free_space_pdf',
              sourceObjectId: attachment.sourceObjectId,
              sectionId: attachment.sectionId,
              pageNumber: attachment.pageNumber,
              text: attachment.extractedText,
            }
          : undefined;
        const activeDocument = activePdfDocument(sourceObjectIdRef.current, visiblePageRef.current);
        const documentCursor = documentCursorForSource(turnsRef.current, sourceObjectIdRef.current);

        const request: ZikukAiAskCourseRequest = capture
          ? {
              version: 3,
              capability: 'ask_course',
              sectionId: currentSectionId,
              question: trimmed,
              capture,
              teachingMode: effectiveMode,
              ...(recentTurns.length > 0 ? { recentTurns } : {}),
              ...(activeDocument ? { activeDocument } : {}),
              ...(documentCursor ? { documentCursor } : {}),
            }
          : {
              version: 2,
              capability: 'ask_course',
              sectionId: currentSectionId,
              question: trimmed,
              teachingMode: effectiveMode,
              ...(recentTurns.length > 0 ? { recentTurns } : {}),
              ...(activeDocument ? { activeDocument } : {}),
              ...(documentCursor ? { documentCursor } : {}),
            };

        const response = await zikukAiRequest(request, { signal: ac.signal, surface: 'tutor' });

        if (!response.ok) {
          const msg = response.error?.message || 'The AI Tutor could not answer. Please try again.';
          setState(prev => ({
            ...prev,
            status: 'error',
            errorMessage: msg,
            errorCode: response.error?.code ?? null,
          }));
          return;
        }

        if (response.result?.type === 'ask_course') {
          const assistantTurn: TutorTurn = {
            id: `assistant-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            role: 'assistant',
            content: response.result.text,
            sources: response.result.sources,
            mode: effectiveMode,
            timestamp: Date.now(),
            ...(response.result.knowledgeTier ? { knowledgeTier: response.result.knowledgeTier } : {}),
            ...(response.result.contextAvailable
              ? { contextAvailable: response.result.contextAvailable }
              : {}),
            ...(response.result.generationIncomplete ? { generationIncomplete: true } : {}),
            ...(response.result.documentWindow ? { documentWindow: response.result.documentWindow } : {}),
          };

          const finalTurns = [...updatedTurns, assistantTurn];
          setState({
            status: 'success',
            turns: finalTurns,
            errorMessage: null,
          });
          persistState(finalTurns);
        } else {
          setState({
            status: 'error',
            errorMessage: 'Unexpected response format from AI gateway.',
            errorCode: null,
            turns: updatedTurns,
          });
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        setState(prev => ({
          ...prev,
          status: 'error',
          errorMessage: err instanceof Error ? err.message : 'Network error communicating with AI tutor.',
          errorCode: null,
        }));
      } finally {
        if (abortControllerRef.current === ac) {
          abortControllerRef.current = null;
        }
      }
    },
    [persistState],
  );

  const retry = useCallback(() => {
    // Find the last user question that failed
    const currentTurns = turnsRef.current;
    if (currentTurns.length === 0) return;
    const lastUserTurn = [...currentTurns].reverse().find(t => t.role === 'user');
    if (!lastUserTurn) return;

    // Retry sending this question with the history before it
    const lastUserIndex = currentTurns.indexOf(lastUserTurn);
    const priorTurns = currentTurns.slice(0, lastUserIndex);
    setState({
      status: 'loading',
      turns: priorTurns,
      errorMessage: null,
    });
    void sendQuestion(lastUserTurn.content, priorTurns.length === 0);
  }, [sendQuestion]);

  return {
    status: state.status,
    turns: state.turns,
    errorMessage: state.errorMessage,
    errorCode: state.errorCode ?? null,
    mode,
    setMode,
    sendQuestion,
    retry,
    abort,
    reset,
    startNewThread,
    restoreArchivedThread,
    archivedThreads,
    setIntent,
    attachmentAttached,
    setAttachmentAttached,
    captureIntent,
    persistedIntent: captureIntent,
  };
}
