import { useCallback, useState } from 'react';
import { X } from 'lucide-react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import { ATMOSPHERES } from '../../hooks/useAtmosphere';
import type { GlobalTheme } from '../../hooks/useWorkspaceTheme';
import { atmosphereSelectionPatch } from '../../lib/atmospherePreview';
import { AtmospherePresetCard } from './AtmospherePresetCard';
import { LivingBackgroundStudio } from './LivingBackgroundStudio';

type AppearanceScope = 'global' | 'workspace';

interface Props {
  open: boolean;
  tokens: AtmosphereTokens;
  atmosphereId: string;
  global: GlobalTheme;
  scope?: AppearanceScope;
  workspaceTitle?: string;
  onClose: () => void;
  onSetAtmosphere: (id: string) => void;
  onUpdateGlobal: (patch: Partial<GlobalTheme>) => void;
}

const INTENSITY_OPTIONS: { label: string; value: number }[] = [
  { label: 'Still',     value: 0 },
  { label: 'Active',    value: 0.45 },
  { label: 'Immersive', value: 1.0 },
];

function getIntensityLabel(val: number | undefined): string {
  if (val === undefined || val === null) return 'Active';
  if (val <= 0.1) return 'Still';
  if (val >= 0.8) return 'Immersive';
  return 'Active';
}

export function WorkspaceAppearancePanel({
  open, tokens, atmosphereId, global, onClose, onSetAtmosphere, onUpdateGlobal,
}: Props) {
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const selectAtmosphere = useCallback(
    (id: string) => {
      onSetAtmosphere(id);
      onUpdateGlobal(atmosphereSelectionPatch(id));
    },
    [onSetAtmosphere, onUpdateGlobal],
  );

  if (!open) return null;

  const activeIntensityLabel = getIntensityLabel(global.environmentIntensity);

  return (
    <>
      <div
        className="fixed inset-0 z-[400]"
        style={{ backgroundColor: 'rgba(4,6,10,0.38)', pointerEvents: 'auto' }}
        onMouseDown={onClose}
        aria-hidden
      />
      <aside
        className="fixed top-0 right-0 z-[410] h-full flex flex-col"
        style={{
          width: 'min(400px, 100vw)',
          backgroundColor: tokens.cardBg,
          borderLeft: `1px solid ${tokens.cardBorder}`,
          color: tokens.textPrimary,
          boxShadow: '-24px 0 64px rgba(0,0,0,0.35)',
        }}
        role="dialog"
        aria-modal="true"
        aria-label="Workspace environment"
      >
        {/* Header */}
        <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '24px 24px 16px' }}>
          <div>
            <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: tokens.textGhost, marginBottom: 4 }}>
              Environment
            </p>
            <h2 style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.02em', margin: 0, lineHeight: 1.2 }}>
              Atmosphere
            </h2>
            <p style={{ fontSize: 11, marginTop: 6, color: tokens.textMuted, lineHeight: 1.5 }}>
              Your workspace, your feeling.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: 8, borderRadius: 10, border: 'none', cursor: 'pointer',
              color: tokens.textMuted, background: tokens.wellBg, transition: 'opacity 0.15s',
            }}
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </header>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 32px' }}>

          {/* Atmosphere preset cards */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr',
            gap: 8, marginBottom: 24,
          }}>
            {ATMOSPHERES.map(a => (
              <AtmospherePresetCard
                key={a.id}
                atmosphere={a}
                active={atmosphereId === a.id}
                onClick={() => selectAtmosphere(a.id)}
              />
            ))}
          </div>

          {/* Intensity control */}
          <div style={{ marginBottom: 24 }}>
            <p style={{
              fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase',
              color: tokens.textGhost, marginBottom: 10,
            }}>
              Intensity
            </p>
            <div style={{ display: 'flex', gap: 6 }}>
              {INTENSITY_OPTIONS.map(opt => (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => onUpdateGlobal({ environmentIntensity: opt.value })}
                  style={{
                    flex: 1, padding: '7px 4px', borderRadius: 8, border: 'none',
                    cursor: 'pointer', fontSize: 12, fontWeight: 500,
                    background: activeIntensityLabel === opt.label
                      ? `${tokens.accentSubtle}`
                      : tokens.wellBg,
                    color: activeIntensityLabel === opt.label
                      ? tokens.accent
                      : tokens.textMuted,
                    transition: 'background 0.15s, color 0.15s',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Advanced toggle */}
          <button
            type="button"
            onClick={() => setAdvancedOpen(v => !v)}
            style={{
              width: '100%', padding: '8px 0', background: 'none', border: 'none',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              fontSize: 11, color: tokens.textGhost, letterSpacing: '0.06em', marginBottom: 8,
              borderTop: `1px solid ${tokens.divider}`,
            }}
          >
            <span>Advanced</span>
            <span>{advancedOpen ? '↑' : '↓'}</span>
          </button>

          {advancedOpen && (
            <LivingBackgroundStudio tokens={tokens} global={global} onUpdateGlobal={onUpdateGlobal} />
          )}
        </div>
      </aside>
    </>
  );
}
