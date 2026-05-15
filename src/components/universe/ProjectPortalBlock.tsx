import { ArrowRight, BookOpen } from 'lucide-react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import { getWorkspaceCustomization } from '../../hooks/useWorkspaceCustomization';
import type { SectionWithProgress } from '../../types';
import { getDefaultSubspace } from '../../lib/workspaceUniverse/subspaces';

interface Props {
  section: SectionWithProgress;
  tokens: AtmosphereTokens;
  lastOpenedLabel?: string;
  onOpen: () => void;
}

function accentForTitle(title: string): string {
  const pool = ['#6366f1', '#8b5cf6', '#f59e0b', '#3b82f6', '#a78bfa', '#06b6d4'];
  return pool[[...title].reduce((a, c) => a + c.charCodeAt(0), 0) % pool.length];
}

export function ProjectPortalBlock({ section, tokens, lastOpenedLabel, onOpen }: Props) {
  const custom = getWorkspaceCustomization(section.id);
  const accent = custom.accent || accentForTitle(section.title);
  const subspace = getDefaultSubspace(section.id);
  const nextLabel = section.next_item_title?.trim();
  const progress = section.progress;
  const hasItems = section.total_items > 0;

  return (
    <div
      className="flex flex-col h-full rounded-xl overflow-hidden"
      style={{
        backgroundColor: `${tokens.cardBg}f5`,
        border: `1px solid ${accent}44`,
        boxShadow: `0 8px 28px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.06)`,
      }}
    >
      <div
        className="relative px-4 pt-4 pb-3 shrink-0 overflow-hidden"
        style={{
          borderBottom: `1px solid ${tokens.cardBorder}`,
          background: `linear-gradient(145deg, ${accent}18 0%, transparent 62%)`,
        }}
      >
        <div
          aria-hidden
          style={{
            position: 'absolute',
            right: -20,
            top: -24,
            width: 120,
            height: 120,
            borderRadius: '50%',
            background: `radial-gradient(circle, ${accent}22 0%, transparent 70%)`,
            pointerEvents: 'none',
          }}
        />
        <div className="flex items-start gap-3 relative">
          <div
            className="flex items-center justify-center w-10 h-10 rounded-xl shrink-0"
            style={{
              backgroundColor: `${accent}22`,
              border: `1px solid ${accent}55`,
              color: accent,
            }}
          >
            <BookOpen className="w-5 h-5" strokeWidth={2} />
          </div>
          <div className="min-w-0 flex-1">
            <p
              className="text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: tokens.textGhost }}
            >
              Project region
            </p>
            <h3
              className="text-[15px] font-semibold leading-snug truncate mt-0.5"
              style={{ color: tokens.textPrimary }}
            >
              {section.title}
            </h3>
            <p className="text-[11px] mt-1 truncate" style={{ color: tokens.textMuted }}>
              {subspace.label} space
              {lastOpenedLabel ? ` · ${lastOpenedLabel}` : ''}
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 px-4 py-3 flex flex-col gap-3 min-h-0">
        <div className="flex items-center gap-3">
          <div
            className="relative w-11 h-11 rounded-full shrink-0"
            style={{
              background: `conic-gradient(${accent} ${progress}%, ${tokens.wellBg} 0)`,
            }}
          >
            <div
              className="absolute inset-[3px] rounded-full flex items-center justify-center text-[10px] font-bold tabular-nums"
              style={{ backgroundColor: tokens.cardBg, color: tokens.textSecondary }}
            >
              {hasItems ? `${progress}%` : '—'}
            </div>
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-medium" style={{ color: tokens.textSecondary }}>
              {hasItems
                ? `${section.completed_items} of ${section.total_items} complete`
                : 'Ready to begin'}
            </p>
            <p className="text-[11px] mt-0.5 line-clamp-2" style={{ color: tokens.textMuted }}>
              {nextLabel ? `Next: ${nextLabel}` : 'Open to continue your work surface or free space.'}
            </p>
          </div>
        </div>
      </div>

      <div
        className="px-4 py-3 shrink-0"
        style={{ borderTop: `1px solid ${tokens.cardBorder}`, backgroundColor: `${tokens.wellBg}cc` }}
      >
        <button
          type="button"
          onClick={e => {
            e.stopPropagation();
            onOpen();
          }}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[12px] font-semibold transition-colors"
          style={{
            backgroundColor: `${accent}22`,
            color: accent,
            border: `1px solid ${accent}55`,
          }}
        >
          Enter project
          <ArrowRight className="w-4 h-4" strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}
