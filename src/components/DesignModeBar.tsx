import { Check, Sliders, RotateCcw } from 'lucide-react';
import { WorkspaceCustomization, ACCENT_PRESETS } from '../hooks/useWorkspaceCustomization';

const QUICK_ICONS = ['📚', '🧮', '⚗️', '💻', '🎯', '🏛️', '📐', '🔬', '📝', '🌍'];

const DENSITY_OPTIONS = [
  { value: 'compact',     label: 'Compact'     },
  { value: 'comfortable', label: 'Comfortable' },
  { value: 'spacious',    label: 'Spacious'    },
] as const;

interface Props {
  customization: WorkspaceCustomization;
  onChange: (next: WorkspaceCustomization) => void;
  onDone:  () => void;
  onReset: () => void;
}

export function DesignModeBar({ customization, onChange, onDone, onReset }: Props) {
  const update = (patch: Partial<WorkspaceCustomization>) =>
    onChange({ ...customization, ...patch });

  const effectiveDensity = customization.density || 'comfortable';

  return (
    <div
      className="rounded-2xl mb-5 overflow-hidden"
      style={{ backgroundColor: '#0d1424', border: '2px solid rgba(245,158,11,0.6)' }}
    >
      {/* ── Top bar ── */}
      <div
        className="flex items-center justify-between px-5 py-3"
        style={{ borderBottom: '1px solid rgba(245,158,11,0.15)', backgroundColor: 'rgba(245,158,11,0.04)' }}
      >
        <div className="flex items-center gap-2.5">
          <Sliders className="w-4 h-4 flex-shrink-0" style={{ color: '#f59e0b' }} />
          <span className="text-sm font-bold" style={{ color: '#f59e0b' }}>
            Design Mode
          </span>
          <span className="hidden sm:block text-xs" style={{ color: '#334155' }}>
            Drag handles to reorder · eye icon to hide lanes
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onReset}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl transition-all"
            style={{ color: '#64748b', border: '1px solid #1a2638' }}
            onMouseEnter={e => {
              e.currentTarget.style.color = '#f87171';
              e.currentTarget.style.borderColor = 'rgba(248,113,113,0.3)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.color = '#64748b';
              e.currentTarget.style.borderColor = '#1a2638';
            }}
          >
            <RotateCcw className="w-3 h-3" /> Reset
          </button>
          <button
            onClick={onDone}
            className="flex items-center gap-1.5 text-xs font-bold px-4 py-1.5 rounded-xl transition-all"
            style={{ backgroundColor: '#f59e0b', color: '#000' }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#fbbf24')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#f59e0b')}
          >
            <Check className="w-3 h-3" /> Done
          </button>
        </div>
      </div>

      {/* ── Controls ── */}
      <div className="px-5 py-4 flex flex-wrap gap-x-8 gap-y-4">

        {/* Icon picker */}
        <div>
          <p
            className="text-[10px] font-bold uppercase tracking-widest mb-2.5"
            style={{ color: '#334155' }}
          >
            Icon
          </p>
          <div className="flex items-center gap-1.5 flex-wrap">
            {QUICK_ICONS.map(emoji => (
              <button
                key={emoji}
                onClick={() => update({ icon: customization.icon === emoji ? '' : emoji })}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-base transition-all"
                style={{
                  backgroundColor: customization.icon === emoji
                    ? 'rgba(245,158,11,0.15)' : '#111d2e',
                  border: customization.icon === emoji
                    ? '1px solid #f59e0b' : '1px solid #1a2638',
                }}
                title={emoji}
              >
                {emoji}
              </button>
            ))}
            {customization.icon && !QUICK_ICONS.includes(customization.icon) && (
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center text-base"
                style={{ backgroundColor: 'rgba(245,158,11,0.15)', border: '1px solid #f59e0b' }}
              >
                {customization.icon}
              </div>
            )}
            {customization.icon && (
              <button
                onClick={() => update({ icon: '' })}
                className="text-xs px-2 py-1 rounded-lg transition-all"
                style={{ color: '#475569', border: '1px solid #1a2638' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#94a3b8')}
                onMouseLeave={e => (e.currentTarget.style.color = '#475569')}
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Accent color */}
        <div>
          <p
            className="text-[10px] font-bold uppercase tracking-widest mb-2.5"
            style={{ color: '#334155' }}
          >
            Accent
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => update({ accent: '' })}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={{
                backgroundColor: !customization.accent ? '#1a2638' : 'transparent',
                border: !customization.accent ? '1px solid #2a3a54' : '1px solid #1a2638',
                color: !customization.accent ? '#f1f5f9' : '#475569',
              }}
            >
              {!customization.accent && <Check className="w-3 h-3" />}
              Auto
            </button>
            {ACCENT_PRESETS.map(preset => (
              <button
                key={preset.key}
                onClick={() => update({ accent: preset.color })}
                title={preset.label}
                className="w-6 h-6 rounded-full flex items-center justify-center transition-all"
                style={{
                  backgroundColor: preset.color,
                  boxShadow: customization.accent === preset.color
                    ? `0 0 0 2px #0d1424, 0 0 0 4px ${preset.color}`
                    : 'none',
                  transform: customization.accent === preset.color ? 'scale(1.2)' : 'scale(1)',
                }}
              >
                {customization.accent === preset.color && (
                  <Check
                    className="w-3 h-3"
                    style={{ color: preset.key === 'slate' ? '#fff' : '#000' }}
                  />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Density */}
        <div>
          <p
            className="text-[10px] font-bold uppercase tracking-widest mb-2.5"
            style={{ color: '#334155' }}
          >
            Density
          </p>
          <div className="flex items-center gap-1.5">
            {DENSITY_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => update({ density: opt.value })}
                className="text-xs font-semibold px-3 py-1.5 rounded-xl transition-all"
                style={{
                  backgroundColor: effectiveDensity === opt.value ? '#1a2638' : 'transparent',
                  border: effectiveDensity === opt.value ? '1px solid #2a3a54' : '1px solid #1a2638',
                  color: effectiveDensity === opt.value ? '#f1f5f9' : '#475569',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
