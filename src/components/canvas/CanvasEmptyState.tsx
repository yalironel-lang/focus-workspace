import { AtmosphereTokens } from '../../hooks/useAtmosphere';
import { WorkspacePreset } from '../../hooks/useWorkspaceLayout';
import { Plus } from 'lucide-react';

interface Props {
  tokens:        AtmosphereTokens;
  presets:       WorkspacePreset[];
  onOpenAdd:     () => void;
  onApplyPreset: (id: string) => void;
}

const META: React.CSSProperties = {
  fontFamily: "'Space Grotesk', sans-serif",
  letterSpacing: '0.12em',
  textTransform: 'uppercase' as const,
  fontWeight: 600,
};

export function CanvasEmptyState({ tokens, presets, onOpenAdd, onApplyPreset }: Props) {
  return (
    <div
      className="flex flex-col items-center justify-center text-center"
      style={{ minHeight: '60vh', padding: '40px 24px' }}
    >
      {/* Ambient ring */}
      <div
        className="relative flex items-center justify-center mb-10"
        style={{ width: '120px', height: '120px' }}
      >
        <div
          className="absolute inset-0 rounded-full"
          style={{
            border: `1px solid ${tokens.cardBorder}`,
            boxShadow: `0 0 40px ${tokens.accentGlow}`,
          }}
        />
        <div
          className="absolute rounded-full"
          style={{
            inset: '16px',
            border: `1px solid ${tokens.accent}30`,
          }}
        />
        <span style={{ fontSize: '36px', lineHeight: 1 }}>✦</span>
      </div>

      <h2
        className="text-3xl font-bold tracking-tight mb-3"
        style={{ color: tokens.textPrimary, letterSpacing: '-0.02em' }}
      >
        Start shaping your workspace.
      </h2>
      <p
        className="text-sm mb-10 max-w-sm leading-relaxed"
        style={{ color: tokens.textMuted }}
      >
        This is your personal focus environment.
        Add modules, choose a layout, and make it yours.
      </p>

      {/* Primary CTA */}
      <button
        onClick={onOpenAdd}
        className="flex items-center gap-2 font-bold text-sm px-6 py-3 rounded-xl mb-8 transition-all"
        style={{
          backgroundColor: tokens.accent,
          color: '#000',
          boxShadow: `0 4px 20px ${tokens.accentGlow}`,
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLButtonElement).style.backgroundColor = tokens.accentHover;
          (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)';
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLButtonElement).style.backgroundColor = tokens.accent;
          (e.currentTarget as HTMLButtonElement).style.transform = 'none';
        }}
      >
        <Plus className="w-4 h-4" /> Add first module
      </button>

      {/* Preset quick-starts */}
      <div className="flex flex-col items-center gap-3">
        <p style={{ ...META, fontSize: '9px', color: tokens.textGhost }}>
          Or start from a preset
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          {presets.map(p => (
            <button
              key={p.id}
              onClick={() => onApplyPreset(p.id)}
              className="flex items-center gap-2 text-xs font-semibold px-4 py-2.5 rounded-xl transition-all"
              style={{
                backgroundColor: tokens.cardBg,
                border: `1px solid ${tokens.cardBorder}`,
                color: tokens.textSecondary,
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.borderColor = tokens.accent + '50';
                (e.currentTarget as HTMLElement).style.backgroundColor = tokens.accentSubtle;
                (e.currentTarget as HTMLElement).style.color = tokens.accent;
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.borderColor = tokens.cardBorder;
                (e.currentTarget as HTMLElement).style.backgroundColor = tokens.cardBg;
                (e.currentTarget as HTMLElement).style.color = tokens.textSecondary;
              }}
            >
              <span>{p.emoji}</span> {p.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
