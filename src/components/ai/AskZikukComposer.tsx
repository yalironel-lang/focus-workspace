/**
 * M0.9B — academic Ask composer (single-turn; no fake actions).
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
    borderRadius: 12,
    border: `1px solid ${tokens.cardBorder}99`,
    background: tokens.wellBg,
    color: tokens.textPrimary,
    padding: '12px 14px',
    fontSize: 14,
    lineHeight: 1.45,
    outline: 'none',
    boxSizing: 'border-box',
    minHeight: 52,
    maxHeight: 140,
  };

  const sendStyle: CSSProperties = {
    flexShrink: 0,
    width: 44,
    height: 44,
    borderRadius: 12,
    border: 'none',
    background: canSubmit ? accent : `${tokens.cardBorder}66`,
    color: canSubmit ? '#0a0a0b' : tokens.textMuted,
    fontSize: 18,
    fontWeight: 700,
    cursor: canSubmit ? 'pointer' : 'not-allowed',
    opacity: canSubmit ? 1 : 0.7,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  return (
    <div
      data-ask-zikuk-composer="1"
      style={{
        flexShrink: 0,
        paddingTop: 14,
        borderTop: `1px solid ${tokens.divider}`,
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
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
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
          onFocus={e => {
            e.currentTarget.style.borderColor = tokens.focusBorder;
          }}
          onBlur={e => {
            e.currentTarget.style.borderColor = `${tokens.cardBorder}99`;
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
        }}
      >
        Asking in {courseLabel}
      </div>
    </div>
  );
}
