import { useState } from 'react';
import { X, Check } from 'lucide-react';
import { WorkspaceCustomization, ACCENT_PRESETS } from '../hooks/useWorkspaceCustomization';

const QUICK_ICONS = ['📚', '🧮', '⚗️', '💻', '🎯', '🏛️', '📐', '🔬', '📝', '🌍'];

const COVER_OPTIONS: { key: WorkspaceCustomization['cover']; label: string; desc: string }[] = [
  { key: 'minimal', label: 'Minimal', desc: 'Clean accent line at top' },
  { key: 'focus',   label: 'Focus',   desc: 'Accent left border emphasis' },
  { key: 'urgent',  label: 'Urgent',  desc: 'Warm tinted background' },
];

interface Props {
  sectionTitle: string;
  value: WorkspaceCustomization;
  onChange: (next: WorkspaceCustomization) => void;
  onClose: () => void;
}

export function CustomizeModal({ sectionTitle, value, onChange, onClose }: Props) {
  const [local, setLocal] = useState<WorkspaceCustomization>({ ...value });

  const update = (patch: Partial<WorkspaceCustomization>) => {
    const next = { ...local, ...patch };
    setLocal(next);
    onChange(next); // save immediately — no Save button needed
  };

  const currentAccentColor = ACCENT_PRESETS.find(p => p.color === local.accent)?.color ?? '';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-sm overflow-hidden"
        style={{
          backgroundColor: '#0d111a',
          border: '1px solid #263043',
          borderRadius: '16px',
          boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4"
             style={{ borderBottom: '1px solid #1a2230' }}>
          <div className="flex items-center gap-2.5 min-w-0">
            {local.icon && (
              <span className="text-lg leading-none flex-shrink-0">{local.icon}</span>
            )}
            <h3 className="font-semibold text-sm truncate" style={{ color: '#f8fafc' }}>
              {sectionTitle}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg transition-colors flex-shrink-0"
            style={{ color: '#4b5563' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#94a3b8')}
            onMouseLeave={e => (e.currentTarget.style.color = '#4b5563')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">

          {/* Icon / Emoji */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest mb-2.5"
                   style={{ color: '#374151' }}>
              Icon
            </label>
            <div className="flex items-center gap-2 flex-wrap mb-2.5">
              {QUICK_ICONS.map(emoji => (
                <button
                  key={emoji}
                  onClick={() => update({ icon: local.icon === emoji ? '' : emoji })}
                  className="w-9 h-9 rounded-lg flex items-center justify-center text-lg transition-all"
                  style={{
                    backgroundColor: local.icon === emoji ? `${currentAccentColor || '#f59e0b'}20` : '#111827',
                    border: local.icon === emoji
                      ? `1px solid ${currentAccentColor || '#f59e0b'}`
                      : '1px solid #263043',
                  }}
                >
                  {emoji}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={local.icon}
                onChange={e => update({ icon: e.target.value.slice(0, 4) })}
                placeholder="Or type any emoji…"
                className="flex-1 text-sm px-3 py-2 rounded-xl focus:outline-none transition-all"
                style={{
                  backgroundColor: '#05070b', border: '1px solid #263043',
                  color: '#f8fafc',
                }}
                onFocus={e => (e.currentTarget.style.borderColor = '#f59e0b')}
                onBlur={e => (e.currentTarget.style.borderColor = '#263043')}
              />
              {local.icon && (
                <button
                  onClick={() => update({ icon: '' })}
                  className="text-xs px-2.5 py-2 rounded-xl transition-colors"
                  style={{ border: '1px solid #263043', color: '#4b5563' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#94a3b8')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#4b5563')}
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Accent color */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest mb-2.5"
                   style={{ color: '#374151' }}>
              Accent
            </label>
            <div className="flex items-center gap-2 flex-wrap">
              {/* Clear/auto option */}
              <button
                onClick={() => update({ accent: '' })}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all"
                style={{
                  backgroundColor: !local.accent ? '#111827' : 'transparent',
                  border: !local.accent ? '1px solid #374151' : '1px solid #263043',
                  color: !local.accent ? '#f8fafc' : '#4b5563',
                }}
              >
                {!local.accent && <Check className="w-3 h-3" />}
                Auto
              </button>
              {ACCENT_PRESETS.map(preset => (
                <button
                  key={preset.key}
                  onClick={() => update({ accent: preset.color })}
                  title={preset.label}
                  className="w-7 h-7 rounded-full transition-all flex items-center justify-center"
                  style={{
                    backgroundColor: preset.color,
                    boxShadow: local.accent === preset.color
                      ? `0 0 0 2px #0d111a, 0 0 0 4px ${preset.color}`
                      : 'none',
                    transform: local.accent === preset.color ? 'scale(1.15)' : 'scale(1)',
                  }}
                >
                  {local.accent === preset.color && (
                    <Check className="w-3 h-3" style={{ color: preset.key === 'slate' ? '#fff' : '#000' }} />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Cover style */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest mb-2.5"
                   style={{ color: '#374151' }}>
              Cover style
            </label>
            <div className="space-y-1.5">
              {/* Default/none */}
              <button
                onClick={() => update({ cover: '' })}
                className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm transition-all"
                style={{
                  backgroundColor: !local.cover ? '#111827' : 'transparent',
                  border: !local.cover ? '1px solid #374151' : '1px solid #1a2230',
                }}
              >
                <span style={{ color: !local.cover ? '#f8fafc' : '#4b5563' }}>Default</span>
                {!local.cover && <Check className="w-3.5 h-3.5" style={{ color: '#10b981' }} />}
              </button>
              {COVER_OPTIONS.map(opt => (
                <button
                  key={opt.key}
                  onClick={() => update({ cover: opt.key })}
                  className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm transition-all"
                  style={{
                    backgroundColor: local.cover === opt.key ? '#111827' : 'transparent',
                    border: local.cover === opt.key ? '1px solid #374151' : '1px solid #1a2230',
                  }}
                >
                  <div className="text-left">
                    <span className="block text-sm" style={{ color: local.cover === opt.key ? '#f8fafc' : '#94a3b8' }}>
                      {opt.label}
                    </span>
                    <span className="block text-[11px] mt-0.5" style={{ color: '#374151' }}>
                      {opt.desc}
                    </span>
                  </div>
                  {local.cover === opt.key && (
                    <Check className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#10b981' }} />
                  )}
                </button>
              ))}
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 flex justify-end"
             style={{ borderTop: '1px solid #1a2230' }}>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-semibold transition-all"
            style={{ backgroundColor: '#f59e0b', color: '#000' }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#fbbf24')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#f59e0b')}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
