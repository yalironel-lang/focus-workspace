import { useEffect } from 'react';
import { X } from 'lucide-react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import { RecentlyDeletedPanel } from './RecentlyDeletedPanel';

interface Props {
  open: boolean;
  onClose: () => void;
  tokens: AtmosphereTokens;
  sectionTitles: Record<string, string>;
}

export function DashboardRecentlyDeletedModal({ open, onClose, tokens, sectionTitles }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);

  if (!open) return null;

  const border = tokens.cardBorder;

  return (
    <div
      className="fixed inset-0 z-[325] flex items-center justify-center p-4"
      role="dialog"
      aria-modal
      aria-labelledby="fw-dashboard-deleted-title"
    >
      <button
        type="button"
        className="absolute inset-0"
        style={{ backgroundColor: 'rgba(4,8,16,0.72)', backdropFilter: 'blur(6px)' }}
        aria-label="Close recently deleted"
        onClick={onClose}
      />
      <div
        className="relative w-full max-w-lg rounded-2xl overflow-hidden flex flex-col max-h-[85vh]"
        style={{
          backgroundColor: 'rgba(12,16,28,0.96)',
          border: `1px solid ${border}`,
          boxShadow: '0 24px 80px rgba(0,0,0,0.55)',
        }}
      >
        <div
          className="flex items-center justify-between px-4 py-3 shrink-0"
          style={{ borderBottom: `1px solid ${border}` }}
        >
          <h2 id="fw-dashboard-deleted-title" className="text-sm font-semibold m-0" style={{ color: tokens.textPrimary }}>
            Recently deleted — all workspaces
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg"
            style={{ color: tokens.textGhost }}
            aria-label="Close"
          >
            <X className="w-4 h-4" strokeWidth={2} />
          </button>
        </div>
        <div className="px-4 py-4 overflow-y-auto">
          <p className="text-[12px] leading-relaxed m-0 mb-3" style={{ color: tokens.textMuted }}>
            Deleted Free Space objects and notebook blocks from any workspace on this device. Items expire after 30 days.
          </p>
          <RecentlyDeletedPanel tokens={tokens} sectionTitles={sectionTitles} />
        </div>
      </div>
    </div>
  );
}
