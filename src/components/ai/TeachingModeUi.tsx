import { useEffect, useRef, type CSSProperties } from 'react';
import {
  BookOpen,
  GraduationCap,
  Zap,
  Target,
  Check,
} from 'lucide-react';
import type { TeachingMode } from '../../lib/ai/gatewayClient/types';
import { TEACHING_MODE_OPTIONS } from '../../lib/ai/tutor/tutorCaptureTypes';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';

export type { TeachingMode } from '../../lib/ai/gatewayClient/types';

export interface ModeTheme {
  badgeBg: string;
  activeBtnBg: string;
  iconColor: string;
  Icon: typeof BookOpen;
}

export function getModeTheme(mode: TeachingMode): ModeTheme {
  switch (mode) {
    case 'teach_me':
      return {
        badgeBg: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
        activeBtnBg: 'bg-amber-500/20 border-amber-500 text-amber-300 shadow-sm',
        iconColor: 'text-amber-400',
        Icon: GraduationCap,
      };
    case 'just_answer':
      return {
        badgeBg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
        activeBtnBg: 'bg-emerald-500/20 border-emerald-500 text-emerald-300 shadow-sm',
        iconColor: 'text-emerald-400',
        Icon: Zap,
      };
    case 'exam_prep':
      return {
        badgeBg: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
        activeBtnBg: 'bg-purple-500/20 border-purple-500 text-purple-300 shadow-sm',
        iconColor: 'text-purple-400',
        Icon: Target,
      };
    case 'explain':
    default:
      return {
        badgeBg: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
        activeBtnBg: 'bg-sky-500/20 border-sky-500 text-sky-300 shadow-sm',
        iconColor: 'text-sky-400',
        Icon: BookOpen,
      };
  }
}

export function TeachingModeBadge({
  mode,
  size = 'sm',
}: {
  mode: TeachingMode;
  size?: 'xs' | 'sm';
}) {
  const meta = TEACHING_MODE_OPTIONS.find(o => o.mode === mode) || TEACHING_MODE_OPTIONS[0];
  const theme = getModeTheme(mode);
  const Icon = theme.Icon;
  const sizeClasses = size === 'xs' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]';
  const iconSize = size === 'xs' ? 'w-2.5 h-2.5' : 'w-3 h-3';

  return (
    <span
      data-testid={`teaching-mode-badge-${mode}`}
      data-teaching-mode={mode}
      className={`inline-flex items-center gap-1 rounded-full font-semibold border ${theme.badgeBg} ${sizeClasses}`}
    >
      <Icon className={`${iconSize} ${theme.iconColor}`} />
      <span>{meta.label}</span>
    </span>
  );
}

export interface TeachingModeDropdownProps {
  currentMode: TeachingMode;
  isOpen: boolean;
  onSelectMode: (mode: TeachingMode) => void;
  onClose: () => void;
  tokens?: AtmosphereTokens;
  align?: 'left' | 'right';
  testIdPrefix?: string;
  style?: CSSProperties;
}

export function TeachingModeDropdown({
  currentMode,
  isOpen,
  onSelectMode,
  onClose,
  tokens,
  align = 'left',
  testIdPrefix = 'ask-zikuk',
  style,
}: TeachingModeDropdownProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen, onClose]);

  // Keyboard navigation inside dropdown
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const buttons = menuRef.current?.querySelectorAll<HTMLButtonElement>('button[role="option"]');
        if (!buttons || buttons.length === 0) return;
        const currentActive = document.activeElement as HTMLButtonElement | null;
        const currentIndex = Array.from(buttons).indexOf(currentActive!);
        let nextIndex = 0;
        if (e.key === 'ArrowDown') {
          nextIndex = currentIndex >= 0 ? (currentIndex + 1) % buttons.length : 0;
        } else {
          nextIndex = currentIndex > 0 ? currentIndex - 1 : buttons.length - 1;
        }
        buttons[nextIndex]?.focus();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={menuRef}
      role="listbox"
      aria-label="Select teaching mode"
      data-testid={`${testIdPrefix}-mode-dropdown`}
      className={`absolute ${align === 'right' ? 'right-0' : 'left-0'} bottom-full mb-2 z-50 w-64 p-1.5 rounded-xl border shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150`}
      style={{
        backgroundColor: tokens?.cardBg || '#0f172a',
        borderColor: tokens?.cardBorder ? `${tokens.cardBorder}99` : 'rgba(255, 255, 255, 0.15)',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.1)',
        ...style,
      }}
    >
      <div className="px-2 py-1 text-[10px] uppercase font-bold tracking-wider text-slate-400">
        Teaching Mode
      </div>
      <div className="space-y-0.5">
        {TEACHING_MODE_OPTIONS.map(opt => {
          const theme = getModeTheme(opt.mode);
          const Icon = theme.Icon;
          const isSelected = opt.mode === currentMode;
          return (
            <button
              key={opt.mode}
              type="button"
              role="option"
              aria-selected={isSelected}
              data-testid={`${testIdPrefix}-dropdown-mode-${opt.mode}`}
              data-mode={opt.mode}
              onClick={() => {
                onSelectMode(opt.mode);
                onClose();
              }}
              className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between transition-colors focus:outline-none focus:ring-1 focus:ring-indigo-400 ${
                isSelected
                  ? 'bg-white/10 text-white font-medium'
                  : 'text-slate-300 hover:bg-white/5 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <Icon className={`w-3.5 h-3.5 shrink-0 ${theme.iconColor}`} />
                <div className="truncate">
                  <div className="font-medium leading-none mb-0.5">{opt.label}</div>
                  <div className="text-[10px] text-slate-400 truncate">{opt.tagline}</div>
                </div>
              </div>
              {isSelected && <Check className="w-3.5 h-3.5 text-indigo-400 shrink-0 ml-1.5" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
