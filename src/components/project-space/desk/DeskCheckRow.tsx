import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { usePrefersReducedMotion } from '../../../hooks/usePrefersReducedMotion';
import type { DeskCheckDisplay } from '../../../lib/mathDesk/deskCheck';

export type DeskCheckRowState = {
  display: DeskCheckDisplay;
  stale?: boolean;
};

interface Props {
  blockId: string;
  isFocused: boolean;
  state: DeskCheckRowState | undefined;
  onRequestCheck: () => void;
  children: ReactNode;
}

const INK_RESPONSE = 'rgba(28, 25, 23, 0.92)';
const INK_OK = 'rgba(52, 98, 52, 0.95)';
const INK_HINT = 'rgba(68, 64, 60, 0.78)';

function suffixClassName(display: DeskCheckDisplay): string {
  if (display.kind !== 'suffix') return 'desk-check-line__suffix';
  if (display.tone === 'ok') return 'desk-check-line__suffix desk-check-line__suffix--ok';
  if (display.message.startsWith('=')) return 'desk-check-line__suffix desk-check-line__suffix--value';
  return 'desk-check-line__suffix desk-check-line__suffix--hint';
}

function suffixInlineStyle(display: DeskCheckDisplay, stale: boolean): CSSProperties {
  const base: CSSProperties = {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: '1em',
    whiteSpace: 'nowrap',
    userSelect: 'none',
    pointerEvents: 'none',
    opacity: stale ? 0.35 : 1,
    transition: 'opacity 0.12s ease-out',
  };
  if (display.kind !== 'suffix') return base;
  if (display.tone === 'ok') return { ...base, fontWeight: 700, color: INK_OK };
  if (display.message.startsWith('=')) return { ...base, fontWeight: 650, color: INK_RESPONSE };
  return { ...base, fontWeight: 500, color: INK_HINT, fontSize: '0.94em' };
}

export function DeskCheckRow({
  blockId,
  isFocused,
  state,
  onRequestCheck,
  children,
}: Props) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [responseVisible, setResponseVisible] = useState(true);
  const prevSignatureRef = useRef<string | null>(null);

  const signature =
    state && !state.stale
      ? `${state.display.kind}:${state.display.kind === 'suffix' ? state.display.message : state.display.message}`
      : null;

  useEffect(() => {
    if (!signature || state?.stale) {
      setResponseVisible(true);
      prevSignatureRef.current = signature;
      return;
    }
    if (signature === prevSignatureRef.current) return;
    prevSignatureRef.current = signature;
    if (prefersReducedMotion) {
      setResponseVisible(true);
      return;
    }
    setResponseVisible(false);
    const id = window.requestAnimationFrame(() => setResponseVisible(true));
    return () => window.cancelAnimationFrame(id);
  }, [signature, state?.stale, prefersReducedMotion]);

  const responseOpacity =
    state && !state.stale && !prefersReducedMotion && !responseVisible ? 0 : state?.stale ? 0.35 : 1;

  const suffix =
    state && state.display.kind === 'suffix' ? (
      <span
        className={suffixClassName(state.display)}
        style={{
          ...suffixInlineStyle(state.display, Boolean(state.stale)),
          opacity: responseOpacity,
        }}
      >
        {state.display.message}
      </span>
    ) : null;

  const whisper =
    state?.display.kind === 'whisper' ? (
      <div
        className="desk-check-line__whisper"
        style={{
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: '12px',
          color: 'rgba(88, 52, 44, 0.88)',
          fontWeight: 500,
          opacity: responseOpacity,
          userSelect: 'none',
          pointerEvents: 'none',
        }}
      >
        {state.display.message}
      </div>
    ) : null;

  return (
    <div
      className="desk-check-line"
      data-desk-check-row={blockId}
      data-desk-line-focused={isFocused ? '1' : undefined}
    >
      <div className="desk-check-line__row">
        <div className="desk-check-line__input">{children}</div>
        {suffix}
        {isFocused ? (
          <button
            type="button"
            className="desk-check-btn"
            onMouseDown={e => e.preventDefault()}
            onClick={e => {
              e.stopPropagation();
              onRequestCheck();
            }}
            title="Check this line (⌘↵)"
          >
            <span>Check line</span>
            <kbd className="desk-check-btn__kbd">⌘↵</kbd>
          </button>
        ) : null}
      </div>
      {whisper}
    </div>
  );
}
