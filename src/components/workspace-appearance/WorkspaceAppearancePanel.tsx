import { useMemo } from 'react';
import { X } from 'lucide-react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import {
  ACCENT_LABELS,
  ACCENT_PALETTE,
  SURFACE_LABELS,
  type AccentPreset,
  type GlobalTheme,
  type SurfaceStyle,
} from '../../hooks/useWorkspaceTheme';
import { resolveBackgroundPresetId } from '../../lib/workspaceBackgroundStudio';
import { WORKSPACE_APPEARANCE_PRESETS } from '../../lib/workspaceAppearancePresets';
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

function PresetPreview({ preview }: { preview: { page: string; card: string; accent: string } }) {
  return (
    <div
      className="h-14 relative"
      style={{ background: `linear-gradient(145deg, ${preview.page} 0%, ${preview.card} 100%)` }}
    >
      <div
        className="absolute left-2 top-2 w-8 h-1 rounded-full"
        style={{ backgroundColor: preview.accent, boxShadow: `0 0 10px ${preview.accent}66` }}
      />
      <div
        className="absolute right-2 bottom-2 w-12 h-7 rounded-md"
        style={{
          backgroundColor: preview.card,
          border: '1px solid rgba(255,255,255,0.12)',
          boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
        }}
      />
    </div>
  );
}

function PresetCard({
  active,
  name,
  emoji,
  description,
  preview,
  tokens,
  onClick,
}: {
  active: boolean;
  name: string;
  emoji: string;
  description: string;
  preview: { page: string; card: string; accent: string };
  tokens: AtmosphereTokens;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left rounded-xl overflow-hidden transition-all"
      style={{
        border: `1px solid ${active ? `${tokens.accent}55` : tokens.cardBorder}`,
        backgroundColor: active ? tokens.accentSubtle : tokens.wellBg,
        boxShadow: active ? `0 0 0 1px ${tokens.accent}22` : 'none',
      }}
    >
      <PresetPreview preview={preview} />
      <div className="px-2.5 py-2">
        <div className="flex items-center gap-1.5">
          <span className="text-sm">{emoji}</span>
          <span className="text-[12px] font-semibold truncate" style={{ color: tokens.textPrimary }}>
            {name}
          </span>
        </div>
        <p className="text-[10px] leading-snug mt-0.5 line-clamp-2" style={{ color: tokens.textMuted }}>
          {description}
        </p>
      </div>
    </button>
  );
}

export function WorkspaceAppearancePanel({
  open,
  tokens,
  atmosphereId,
  global,
  onClose,
  onSetAtmosphere,
  onUpdateGlobal,
}: Props) {
  const activePresetId = global.activePreset ?? null;

  const applyPreset = (presetId: string) => {
    const preset = WORKSPACE_APPEARANCE_PRESETS.find(p => p.id === presetId);
    if (!preset) return;
    onSetAtmosphere(preset.atmosphereId);
    onUpdateGlobal({ ...preset.theme, activePreset: presetId });
  };

  const accentOptions = useMemo(
    () => (Object.keys(ACCENT_PALETTE) as AccentPreset[]).filter(k => k !== 'custom'),
    [],
  );

  const activeBackgroundId = resolveBackgroundPresetId(global);

  if (!open) return null;

  const surfaces: SurfaceStyle[] = ['solid', 'soft-card', 'glass'];

  return (
    <>
      <div
        className="fixed inset-0 z-[115]"
        style={{ backgroundColor: 'rgba(4,6,10,0.45)' }}
        onMouseDown={onClose}
        aria-hidden
      />
      <aside
        className="fixed top-0 right-0 z-[120] h-full flex flex-col shadow-2xl"
        style={{
          width: 'min(420px, 100vw)',
          backgroundColor: tokens.cardBg,
          borderLeft: `1px solid ${tokens.cardBorder}`,
          color: tokens.textPrimary,
        }}
        role="dialog"
        aria-modal="true"
        aria-label="Workspace appearance"
      >
        <header
          className="flex items-center justify-between px-5 py-4 shrink-0"
          style={{ borderBottom: `1px solid ${tokens.divider}` }}
        >
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: tokens.textGhost }}>
              Appearance
            </p>
            <h2 className="text-lg font-semibold mt-0.5">Living Background Studio</h2>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg" style={{ color: tokens.textMuted }} aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          <LivingBackgroundStudio tokens={tokens} global={global} onUpdateGlobal={onUpdateGlobal} />

          <section className="mb-6">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] mb-3" style={{ color: tokens.textGhost }}>
              Atmosphere
            </p>
            <div className="grid grid-cols-2 gap-2">
              {WORKSPACE_APPEARANCE_PRESETS.map(p => (
                <PresetCard
                  key={p.id}
                  active={activePresetId === p.id}
                  name={p.name}
                  emoji={p.emoji}
                  description={p.description}
                  preview={p.preview}
                  tokens={tokens}
                  onClick={() => applyPreset(p.id)}
                />
              ))}
            </div>
          </section>

          <section className="mb-6">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] mb-3" style={{ color: tokens.textGhost }}>
              Object depth
            </p>
            <div
              className="flex flex-col gap-4 rounded-xl p-3"
              style={{ backgroundColor: tokens.wellBg, border: `1px solid ${tokens.cardBorder}` }}
            >
              <div>
                <p className="text-[12px] font-medium mb-2" style={{ color: tokens.textPrimary }}>
                  Surface depth
                </p>
                <div className="flex gap-1">
                  {surfaces.map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => onUpdateGlobal({ surfaceStyle: s, activePreset: null })}
                      className="flex-1 py-1.5 rounded-lg text-[10px] font-semibold"
                      style={{
                        backgroundColor: global.surfaceStyle === s ? tokens.accentSubtle : 'transparent',
                        color: global.surfaceStyle === s ? tokens.accent : tokens.textMuted,
                        border: `1px solid ${global.surfaceStyle === s ? `${tokens.accent}44` : tokens.cardBorder}`,
                      }}
                    >
                      {SURFACE_LABELS[s]}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-[12px] font-medium mb-2" style={{ color: tokens.textPrimary }}>
                  Accent
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {accentOptions.map(key => {
                    const active = global.accentPreset === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        title={ACCENT_LABELS[key]}
                        onClick={() =>
                          onUpdateGlobal({
                            accentPreset: key,
                            accentCustom: ACCENT_PALETTE[key].color,
                            activePreset: null,
                          })
                        }
                        className="w-7 h-7 rounded-full border-2"
                        style={{
                          backgroundColor: ACCENT_PALETTE[key].color,
                          borderColor: active ? tokens.textPrimary : 'transparent',
                          transform: active ? 'scale(1.08)' : 'scale(1)',
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          </section>

          <p className="text-[10px] leading-relaxed pb-6" style={{ color: tokens.textGhost }}>
            Live preview — background <span style={{ color: tokens.textMuted }}>{activeBackgroundId}</span> · atmosphere <span style={{ color: tokens.textMuted }}>{atmosphereId}</span>. Applies to Free Space immediately.
          </p>
        </div>
      </aside>
    </>
  );
}
