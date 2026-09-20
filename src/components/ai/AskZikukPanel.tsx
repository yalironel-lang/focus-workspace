/**
 * M0.6 Ask ZIKUK ephemeral panel — single question → grounded answer + Sources.
 * Anchored to workspace chrome; does not resize Notebook writing space.
 */

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type RefObject,
} from 'react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import type { AskCourseSourceRef } from '../../lib/ai/gatewayClient';
import {
  useAskCourseController,
  userFacingAskCourseErrorMessage,
  isAskCourseRetryAllowed,
} from '../../lib/ai/askCourse';
import { AskZikukAnswer } from './AskZikukAnswer';
import { AskZikukSources } from './AskZikukSources';

type Props = {
  open: boolean;
  onClose: () => void;
  sectionId: string;
  tokens: AtmosphereTokens;
  accent: string;
  onOpenSource: (source: AskCourseSourceRef) => void;
  /** Restore focus to Ask ZIKUK trigger on close. */
  triggerRef?: RefObject<HTMLButtonElement | null>;
  /** Root for outside-click dismiss (includes trigger). */
  dismissRootRef?: RefObject<HTMLElement | null>;
};

const PANEL_STYLE_DESKTOP: CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 8px)',
  right: 0,
  width: 'min(400px, calc(100vw - 32px))',
  maxWidth: 400,
  maxHeight: 'min(70vh, 560px)',
  display: 'flex',
  flexDirection: 'column',
  borderRadius: 14,
  padding: 14,
  zIndex: 3,
  boxShadow: '0 18px 48px rgba(0,0,0,0.42)',
};

export function AskZikukPanel({
  open,
  onClose,
  sectionId,
  tokens,
  accent,
  onOpenSource,
  triggerRef,
  dismissRootRef,
}: Props) {
  const titleId = useId();
  const inputId = useId();
  const statusId = useId();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const composingRef = useRef(false);
  const wasOpenRef = useRef(false);
  const [narrow, setNarrow] = useState(false);

  const { state, setQuestion, submit, retry, canSubmit, isLoading } = useAskCourseController({
    sectionId,
    open,
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(max-width: 640px)');
    const apply = () => setNarrow(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  // Focus question field when opened
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  // Restore focus to trigger after close
  useEffect(() => {
    if (wasOpenRef.current && !open) {
      triggerRef?.current?.focus();
    }
    wasOpenRef.current = open;
  }, [open, triggerRef]);

  // Escape closes
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent | globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Outside click — only when click is outside dismiss root
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const root = dismissRootRef?.current;
      if (root && root.contains(e.target as Node)) return;
      onClose();
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open, onClose, dismissRootRef]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key !== 'Enter') return;
      if (composingRef.current || e.nativeEvent.isComposing) return;
      if (e.shiftKey) return;
      e.preventDefault();
      if (canSubmit) submit();
    },
    [canSubmit, submit],
  );

  if (!open) return null;

  const errorCopy = userFacingAskCourseErrorMessage(state.errorCode, state.errorMessage);
  const showRetry = state.phase === 'error' && isAskCourseRetryAllowed(state.errorCode);
  const panelBg = `linear-gradient(165deg, ${tokens.cardBg}f2, ${tokens.wellBg}e8)`;
  const layoutStyle: CSSProperties = narrow
    ? {
        position: 'fixed',
        top: 'auto',
        right: 12,
        left: 12,
        bottom: 'max(12px, env(safe-area-inset-bottom))',
        width: 'auto',
        maxWidth: 'none',
        maxHeight: 'min(78vh, 560px)',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 14,
        padding: 14,
        zIndex: 620,
        boxShadow: '0 18px 48px rgba(0,0,0,0.42)',
      }
    : PANEL_STYLE_DESKTOP;

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      data-ask-zikuk-panel="1"
      data-ask-zikuk-narrow={narrow ? '1' : '0'}
      style={{
        ...layoutStyle,
        border: `1px solid ${tokens.cardBorder}99`,
        background: panelBg,
        backdropFilter: 'blur(22px) saturate(1.4)',
        WebkitBackdropFilter: 'blur(22px) saturate(1.4)',
        color: tokens.textPrimary,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 10,
          marginBottom: 10,
        }}
      >
        <div>
          <div
            id={titleId}
            style={{ fontSize: 14, fontWeight: 700, color: tokens.textPrimary }}
          >
            Ask ZIKUK
          </div>
          <div style={{ fontSize: 12, color: tokens.textMuted, marginTop: 2 }}>
            Ask your course
          </div>
        </div>
        <button
          type="button"
          aria-label="Close Ask ZIKUK"
          onClick={onClose}
          style={{
            flexShrink: 0,
            width: 28,
            height: 28,
            borderRadius: 8,
            border: `1px solid ${tokens.cardBorder}88`,
            background: 'transparent',
            color: tokens.textMuted,
            cursor: 'pointer',
            fontSize: 16,
            lineHeight: 1,
          }}
        >
          ×
        </button>
      </div>

      <label
        htmlFor={inputId}
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: 'hidden',
          clip: 'rect(0,0,0,0)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
      >
        Question about your course
      </label>
      <textarea
        ref={inputRef}
        id={inputId}
        data-ask-zikuk-input="1"
        value={state.question}
        onChange={e => setQuestion(e.target.value)}
        onKeyDown={handleKeyDown}
        onCompositionStart={() => {
          composingRef.current = true;
        }}
        onCompositionEnd={() => {
          composingRef.current = false;
        }}
        disabled={isLoading}
        rows={3}
        placeholder="Ask a specific question about your course material."
        aria-describedby={statusId}
        style={{
          width: '100%',
          resize: 'none',
          borderRadius: 10,
          border: `1px solid ${tokens.cardBorder}99`,
          background: tokens.wellBg,
          color: tokens.textPrimary,
          padding: '10px 12px',
          fontSize: 13,
          lineHeight: 1.45,
          outline: 'none',
          boxSizing: 'border-box',
        }}
      />
      <div
        style={{
          fontSize: 11,
          color: tokens.textMuted,
          marginTop: 6,
          marginBottom: 10,
        }}
      >
        Example: “What does this course say about natural law?”
      </div>

      <button
        type="button"
        data-ask-zikuk-submit="1"
        disabled={!canSubmit}
        onClick={submit}
        style={{
          alignSelf: 'flex-end',
          padding: '8px 16px',
          borderRadius: 999,
          border: 'none',
          background: canSubmit ? accent : `${tokens.cardBorder}66`,
          color: canSubmit ? '#0a0a0b' : tokens.textMuted,
          fontSize: 12,
          fontWeight: 700,
          cursor: canSubmit ? 'pointer' : 'not-allowed',
          opacity: canSubmit ? 1 : 0.7,
        }}
      >
        Ask
      </button>

      <div
        id={statusId}
        role="status"
        aria-live="polite"
        aria-busy={isLoading}
        data-ask-zikuk-status="1"
        style={{
          marginTop: 14,
          paddingTop: 12,
          borderTop: `1px solid ${tokens.cardBorder}66`,
          minHeight: 48,
          overflowY: 'auto',
          flex: 1,
        }}
      >
        {state.phase === 'idle' ? (
          <p style={{ margin: 0, fontSize: 12, color: tokens.textMuted }}>
            Answers are grounded in your indexed course material.
          </p>
        ) : null}

        {isLoading ? (
          <p style={{ margin: 0, fontSize: 13, color: tokens.textSecondary }}>
            Searching your course…
          </p>
        ) : null}

        {state.phase === 'success' && state.resultText != null ? (
          <>
            <AskZikukAnswer
              text={state.resultText}
              sources={state.sources}
              textColor={tokens.textPrimary}
              mutedColor={tokens.textMuted}
              accentColor={accent}
              onCitationActivate={onOpenSource}
            />
            <AskZikukSources
              sources={state.sources}
              tokens={tokens}
              accent={accent}
              onSourceActivate={onOpenSource}
            />
          </>
        ) : null}

        {state.phase === 'error' ? (
          <div data-ask-zikuk-error="1">
            <p
              style={{
                margin: 0,
                fontSize: 13,
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
                  marginTop: 10,
                  padding: '6px 12px',
                  borderRadius: 8,
                  border: `1px solid ${tokens.cardBorder}`,
                  background: 'transparent',
                  color: tokens.textPrimary,
                  fontSize: 12,
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
    </div>
  );
}
