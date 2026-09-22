/**
 * M0.9B.1 — academic Ask composer (single-turn; no fake actions).
 */

import {
  useCallback,
  useRef,
  type CSSProperties,
  type KeyboardEvent,
  type RefObject,
} from 'react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';

type Props = {
  inputId: string;
  statusId: string;
  courseLabel: string;
  value: string;
  tokens: AtmosphereTokens;
  accent: string;
  canSubmit: boolean;
  isLoading: boolean;
  inputRef?: RefObject<HTMLTextAreaElement | null>;
  onChange: (value: string) => void;
  onSubmit: () => void;
};

export function AskZikukComposer({
  inputId,
  statusId,
  courseLabel,
  value,
  tokens,
  accent,
  canSubmit,
  isLoading,
  inputRef,
  onChange,
  onSubmit,
}: Props) {
  const composingRef = useRef(false);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key !== 'Enter') return;
      if (composingRef.current || e.nativeEvent.isComposing) return;
      if (e.shiftKey) return;
      e.preventDefault();
      if (canSubmit) onSubmit();
    },
    [canSubmit, onSubmit],
  );

  const fieldStyle: CSSProperties = {
    flex: 1,
    minWidth: 0,
    resize: 'none',
    border: 'none',
    background: 'transparent',
    color: tokens.textPrimary,
    padding: '2px 0',
    fontSize: 14,
    lineHeight: 1.45,
    outline: 'none',
    boxSizing: 'border-box',
    minHeight: 44,
    maxHeight: 120,
  };

  const sendStyle: CSSProperties = {
    flexShrink: 0,
    width: 40,
    height: 40,
    borderRadius: 10,
    border: 'none',
    background: canSubmit ? accent : `${tokens.cardBorder}55`,
    color: canSubmit ? '#0a0a0b' : tokens.textMuted,
    fontSize: 17,
    fontWeight: 700,
    cursor: canSubmit ? 'pointer' : 'not-allowed',
    opacity: canSubmit ? 1 : 0.65,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  return (
    <div
      data-ask-zikuk-composer="1"
      style={{
        flexShrink: 0,
        paddingTop: 12,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: 10,
          padding: '10px 12px',
          borderRadius: 14,
          border: `1px solid ${tokens.cardBorder}99`,
          background: `linear-gradient(180deg, ${tokens.cardBg}ee, ${tokens.wellBg}f2)`,
          boxShadow: '0 8px 28px rgba(0,0,0,0.18)',
          boxSizing: 'border-box',
        }}
        onFocusCapture={e => {
          const box = e.currentTarget;
          box.style.borderColor = tokens.focusBorder;
        }}
        onBlurCapture={e => {
          if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
          e.currentTarget.style.borderColor = `${tokens.cardBorder}99`;
        }}
      >
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
          Ask about {courseLabel}
        </label>
        <textarea
          ref={inputRef}
          id={inputId}
          data-ask-zikuk-input="1"
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onCompositionStart={() => {
            composingRef.current = true;
          }}
          onCompositionEnd={() => {
            composingRef.current = false;
          }}
          disabled={isLoading}
          rows={2}
          placeholder={`Ask anything about ${courseLabel}…`}
          aria-describedby={statusId}
          style={fieldStyle}
        />
        <button
          type="button"
          data-ask-zikuk-submit="1"
          aria-label="Ask ZIKUK"
          disabled={!canSubmit}
          onClick={onSubmit}
          style={sendStyle}
        >
          ↑
        </button>
      </div>
      <div
        data-ask-zikuk-composer-scope="1"
        style={{
          marginTop: 8,
          fontSize: 12,
          color: tokens.textMuted,
          lineHeight: 1.35,
          paddingLeft: 2,
        }}
      >
        Asking in {courseLabel}
      </div>
    </div>
  );
}
