/**
 * M0.9B.1 / TQ1.2.3 — academic Ask composer with teaching-mode selector.
 */

import {
  useCallback,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type RefObject,
} from 'react';
import { ChevronDown } from 'lucide-react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import type { TeachingMode } from '../../lib/ai/gatewayClient/types';
import { TEACHING_MODE_OPTIONS } from '../../lib/ai/tutor/tutorCaptureTypes';
import { getModeTheme, TeachingModeDropdown } from './TeachingModeUi';

type Props = {
  inputId: string;
  statusId: string;
  courseLabel: string;
  value: string;
  tokens: AtmosphereTokens;
  accent: string;
  canSubmit: boolean;
  isLoading: boolean;
  mode?: TeachingMode;
  onSelectMode?: (mode: TeachingMode) => void;
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
  mode = 'explain',
  onSelectMode,
  inputRef,
  onChange,
  onSubmit,
}: Props) {
  const composingRef = useRef(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const activeMode = mode || 'explain';
  const theme = getModeTheme(activeMode);
  const meta = TEACHING_MODE_OPTIONS.find(o => o.mode === activeMode) || TEACHING_MODE_OPTIONS[0];
  const ActiveIcon = theme.Icon;

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
          flexDirection: 'column',
          padding: '10px 12px',
          borderRadius: 14,
          border: `1px solid ${tokens.cardBorder}99`,
          background: `linear-gradient(180deg, ${tokens.cardBg}ee, ${tokens.wellBg}f2)`,
          boxShadow: '0 8px 28px rgba(0,0,0,0.18)',
          boxSizing: 'border-box',
          position: 'relative',
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
        {/* Top row: Mode selector + subtle course context */}
        <div
          data-ask-zikuk-composer-topbar="1"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            marginBottom: 6,
            paddingBottom: 6,
            borderBottom: `1px solid ${tokens.cardBorder}33`,
          }}
        >
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: tokens.textMuted,
              }}
            >
              Mode
            </span>
            <button
              type="button"
              data-ask-zikuk-mode-trigger="1"
              data-testid="ask-zikuk-mode-trigger"
              aria-haspopup="listbox"
              aria-expanded={isDropdownOpen}
              aria-label={`Teaching mode: ${meta.label}. Click to switch mode.`}
              onClick={() => setIsDropdownOpen(prev => !prev)}
              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold border transition-all hover:brightness-110 active:scale-95 focus:outline-none focus:ring-1 focus:ring-indigo-400 ${theme.badgeBg}`}
            >
              <ActiveIcon className={`w-3 h-3 ${theme.iconColor}`} />
              <span>{meta.label}</span>
              <ChevronDown className="w-2.5 h-2.5 opacity-70" />
            </button>

            <TeachingModeDropdown
              currentMode={activeMode}
              isOpen={isDropdownOpen}
              onSelectMode={newMode => {
                onSelectMode?.(newMode);
                setIsDropdownOpen(false);
              }}
              onClose={() => setIsDropdownOpen(false)}
              tokens={tokens}
              testIdPrefix="ask-zikuk"
            />
          </div>

          <div
            style={{
              fontSize: 11,
              color: tokens.textMuted,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: 240,
            }}
          >
            {courseLabel}
          </div>
        </div>

        {/* Input row: Textarea + Submit button */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, width: '100%' }}>
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
