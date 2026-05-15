import { X } from 'lucide-react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import type { GlobalTheme } from '../../hooks/useWorkspaceTheme';
import { resolveBackgroundPresetId } from '../../lib/workspaceBackgroundStudio';
import { LivingBackgroundStudio } from './LivingBackgroundStudio';

interface Props {
  open: boolean;
  tokens: AtmosphereTokens;
  atmosphereId: string;
  global: GlobalTheme;
  onClose: () => void;
  onSetAtmosphere: (id: string) => void;
  onUpdateGlobal: (patch: Partial<GlobalTheme>) => void;
}

export function WorkspaceAppearancePanel({
  open,
  tokens,
  atmosphereId,
  global,
  onClose,
  onUpdateGlobal,
}: Props) {
  const activeBackgroundId = resolveBackgroundPresetId(global);

  // Unmount when closed — no invisible backdrop left in the tree.
  if (!open) return null;

  return (
    <>
      {/* z-[400]/[410] stay below SectionPage WorkspaceSectionChrome (z-index 600). */}
      <div
        className="fixed inset-0 z-[400]"
        style={{ backgroundColor: 'rgba(4,6,10,0.38)', pointerEvents: 'auto' }}
        onMouseDown={onClose}
        aria-hidden
      />
      <aside
        className="fixed top-0 right-0 z-[410] h-full flex flex-col"
        style={{
          width: 'min(440px, 100vw)',
          backgroundColor: tokens.cardBg,
          borderLeft: `1px solid ${tokens.cardBorder}`,
          color: tokens.textPrimary,
          boxShadow: '-24px 0 64px rgba(0,0,0,0.35)',
        }}
        role="dialog"
        aria-modal="true"
        aria-label="Workspace appearance"
      >
        <header className="flex items-start justify-between px-6 pt-6 pb-4 shrink-0">
          <div>
            <p
              className="text-[10px] font-semibold uppercase tracking-[0.16em] mb-1"
              style={{ color: tokens.textGhost }}
            >
              Appearance
            </p>
            <h2 className="text-[22px] font-semibold tracking-tight leading-tight">
              Living Background
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2.5 rounded-xl transition-colors"
            style={{ color: tokens.textMuted, backgroundColor: tokens.wellBg }}
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 pb-8">
          <LivingBackgroundStudio tokens={tokens} global={global} onUpdateGlobal={onUpdateGlobal} />
        </div>

        <footer
          className="shrink-0 px-6 py-4 text-[10px]"
          style={{ color: tokens.textGhost, borderTop: `1px solid ${tokens.divider}` }}
        >
          <span style={{ color: tokens.textMuted }}>{activeBackgroundId}</span>
          <span className="mx-1.5">·</span>
          <span style={{ color: tokens.textMuted }}>{atmosphereId}</span>
        </footer>
      </aside>
    </>
  );
}
