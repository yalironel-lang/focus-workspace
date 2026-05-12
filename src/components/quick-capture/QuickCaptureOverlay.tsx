import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';

interface Props {
  open: boolean;
  tokens: AtmosphereTokens;
  /** Note vs mistake quick capture */
  variant?: 'note' | 'mistake';
  onClose: () => void;
  /** Trimmed non-empty text, or empty string if user submitted blank */
  onCommit: (text: string) => void;
}

export function QuickCaptureOverlay({ open, tokens, variant = 'note', onClose, onCommit }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');
  const [visible, setVisible] = useState(false);

  useLayoutEffect(() => {
    if (!open) {
      setVisible(false);
      return;
    }
    setValue('');
    const id = requestAnimationFrame(() => {
      setVisible(true);
      inputRef.current?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDocKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onDocKey, true);
    return () => document.removeEventListener('keydown', onDocKey, true);
  }, [open, onClose]);

  const submit = useCallback(() => {
    onCommit(value);
    setValue('');
  }, [value, onCommit]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-x-0 top-0 z-[280] flex justify-center pointer-events-none px-4 pt-[min(12vh,120px)]"
      aria-modal
      role="dialog"
      aria-label={variant === 'mistake' ? 'Quick capture mistake' : 'Quick capture'}
    >
      <div
        data-fw-quick-capture-root="1"
        className="pointer-events-auto w-full max-w-[min(420px,92vw)] rounded-2xl overflow-hidden"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(-10px)',
          transition: 'opacity 0.15s ease-out, transform 0.15s ease-out',
          backgroundColor:
            variant === 'mistake' ? 'rgba(24,10,12,0.78)' : 'rgba(10,14,24,0.72)',
          border: `1px solid ${tokens.cardBorder}`,
          boxShadow: `0 16px 48px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.04) inset, 0 1px 0 rgba(255,255,255,0.06) inset`,
          backdropFilter: 'blur(16px) saturate(1.15)',
        }}
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="px-4 pt-3 pb-1.5 flex flex-col gap-1">
          <span
            className="text-[11px] font-medium tracking-wide"
            style={{ color: tokens.textGhost }}
          >
            {variant === 'mistake' ? 'Capture mistake…' : 'Quick capture…'}
          </span>
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={variant === 'mistake' ? 'What went wrong…' : 'One thought…'}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            className="w-full bg-transparent outline-none text-[15px] leading-snug py-1.5 border-b"
            style={{
              color: tokens.textPrimary,
              borderColor: `${tokens.cardBorder}`,
              caretColor: tokens.accent,
            }}
          />
          <div className="flex justify-between items-center pt-2 pb-2 gap-2">
            <span className="text-[10px] font-medium" style={{ color: tokens.textMuted }}>
              Enter to save · Esc to cancel
            </span>
            <span className="text-[10px] tabular-nums" style={{ color: tokens.textGhost }}>
              {variant === 'mistake' ? '⌥C · note: C' : 'C · ⇧Space'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
