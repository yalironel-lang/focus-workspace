/**
 * M0.9B Ask ZIKUK course workspace — course-scoped single-turn AI surface.
 * M0.9B.1: visual density + presentation refinements (still single-turn; no chat history).
 */

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import type { AskCourseSourceRef } from '../../lib/ai/gatewayClient';
import {
  useAskCourseController,
  userFacingAskCourseErrorMessage,
  isAskCourseRetryAllowed,
} from '../../lib/ai/askCourse';
import { WORKSPACE_SHELL_TOP_INSET } from '../workspace-shell/shellGlass';
import { Z_ASK_ZIKUK_WORKSPACE } from '../../lib/ui/zIndexLayers';
import { AskZikukWorkspaceHeader } from './AskZikukWorkspaceHeader';
import { AskZikukEmptyState } from './AskZikukEmptyState';
import { AskZikukComposer } from './AskZikukComposer';
import { AskZikukResult } from './AskZikukResult';

export type AskZikukWorkspaceProps = {
  open: boolean;
  onClose: () => void;
  sectionId: string;
  /** Display title for current-section scope (presentation only). */
  sectionTitle?: string;
  tokens: AtmosphereTokens;
  accent: string;
  onOpenSource: (source: AskCourseSourceRef) => void;
  /** Restore focus to Ask ZIKUK trigger on close. */
  triggerRef?: RefObject<HTMLButtonElement | null>;
};

function courseDisplayLabel(sectionTitle?: string): string {
  const t = sectionTitle?.trim();
  return t && t.length > 0 ? t : 'this course';
}

export function AskZikukWorkspace({
  open,
  onClose,
  sectionId,
  sectionTitle,
  tokens,
  accent,
  onOpenSource,
  triggerRef,
}: AskZikukWorkspaceProps) {
  const titleId = useId();
  const inputId = useId();
  const statusId = useId();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const wasOpenRef = useRef(false);
  const [narrow, setNarrow] = useState(false);

  const courseLabel = courseDisplayLabel(sectionTitle);

  const { state, setQuestion, submit, retry, canSubmit, isLoading } = useAskCourseController({
    sectionId,
    open,
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(max-width: 820px)');
    const apply = () => setNarrow(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (wasOpenRef.current && !open) {
      triggerRef?.current?.focus();
    }
    wasOpenRef.current = open;
  }, [open, triggerRef]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const handleSuggestion = useCallback(
    (text: string) => {
      setQuestion(text);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    },
    [setQuestion],
  );

  if (!open) return null;

  const errorCopy = userFacingAskCourseErrorMessage(state.errorCode, state.errorMessage);
  const showRetry = state.phase === 'error' && isAskCourseRetryAllowed(state.errorCode);
  const showEmpty = state.phase === 'idle' && !isLoading;

  const shell: CSSProperties = {
    position: 'fixed',
    top: WORKSPACE_SHELL_TOP_INSET,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: Z_ASK_ZIKUK_WORKSPACE,
    display: 'flex',
    flexDirection: 'column',
    background: tokens.pageBg,
    color: tokens.textPrimary,
    boxSizing: 'border-box',
  };

  const inner: CSSProperties = {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    maxWidth: 760,
    margin: '0 auto',
    padding: narrow
      ? '12px 14px max(14px, env(safe-area-inset-bottom))'
      : '14px 24px max(16px, env(safe-area-inset-bottom))',
    boxSizing: 'border-box',
    minHeight: 0,
  };

  const main: CSSProperties = {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    overflowX: 'hidden',
    paddingTop: 14,
    paddingBottom: 8,
    display: 'flex',
    flexDirection: 'column',
  };

  const node = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-ask-zikuk-workspace="1"
      data-ask-zikuk-narrow={narrow ? '1' : '0'}
      style={shell}
    >
      <div style={inner}>
        <AskZikukWorkspaceHeader
          titleId={titleId}
          courseLabel={courseLabel}
          tokens={tokens}
          onClose={onClose}
        />

        <div
          id={statusId}
          role="status"
          aria-live="polite"
          aria-busy={isLoading}
          data-ask-zikuk-status="1"
          style={main}
        >
          {showEmpty ? (
            <AskZikukEmptyState
              courseLabel={courseLabel}
              tokens={tokens}
              accent={accent}
              onSuggestionSelect={handleSuggestion}
              disabled={isLoading}
            />
          ) : null}

          {isLoading ? (
            <p
              data-ask-zikuk-loading="1"
              style={{
                margin: '20px auto',
                fontSize: 14,
                color: tokens.textSecondary,
                textAlign: 'center',
              }}
            >
              Searching your course materials…
            </p>
          ) : null}

          {state.phase === 'success' && state.resultText != null ? (
            <AskZikukResult
              question={state.submittedQuestion ?? ''}
              text={state.resultText}
              sources={state.sources}
              tokens={tokens}
              accent={accent}
              onOpenSource={onOpenSource}
            />
          ) : null}

          {state.phase === 'error' ? (
            <div
              data-ask-zikuk-error="1"
              style={{
                maxWidth: 520,
                margin: '20px auto 0',
                width: '100%',
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: 14,
                  lineHeight: 1.55,
                  color: tokens.textSecondary,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {errorCopy}
              </p>
              {showRetry ? (
                <button
                  type="button"
                  data-ask-zikuk-retry="1"
                  onClick={retry}
                  style={{
                    marginTop: 12,
                    padding: '8px 14px',
                    borderRadius: 8,
                    border: `1px solid ${tokens.cardBorder}`,
                    background: 'transparent',
                    color: tokens.textPrimary,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Retry
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        <AskZikukComposer
          inputId={inputId}
          statusId={statusId}
          courseLabel={courseLabel}
          value={state.question}
          tokens={tokens}
          accent={accent}
          canSubmit={canSubmit}
          isLoading={isLoading}
          inputRef={inputRef}
          onChange={setQuestion}
          onSubmit={submit}
        />
      </div>
    </div>
  );

  if (typeof document === 'undefined') return node;
  return createPortal(node, document.body);
}
