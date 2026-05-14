import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Globe, Sparkles, X } from 'lucide-react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import {
  buildCompanionContent,
  getCompanionKind,
  getCompanionHostname,
  getSuggestedCompanionTitle,
  normalizeCompanionUrl,
  type CompanionDraftInput,
  type CompanionEmbedMode,
  type CompanionPanelContentFields,
} from '../../lib/companionPanels';

interface Props {
  open: boolean;
  tokens: AtmosphereTokens;
  onClose: () => void;
  onCreate: (content: CompanionPanelContentFields) => void;
}

const MODE_OPTIONS: Array<{ id: CompanionEmbedMode; label: string; hint: string }> = [
  { id: 'auto', label: 'Auto', hint: 'Try inline first, then fall back quietly.' },
  { id: 'embedded', label: 'Embedded', hint: 'Always prefer an inline companion view.' },
  { id: 'external-only', label: 'External only', hint: 'Treat it as a pinned launcher card.' },
];

export function CompanionComposerModal({
  open,
  tokens,
  onClose,
  onCreate,
}: Props) {
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [embedMode, setEmbedMode] = useState<CompanionEmbedMode>('auto');
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    if (!open) return;
    setUrl('');
    setTitle('');
    setDescription('');
    setEmbedMode('auto');
    setError(null);
  }, [open]);

  const preview = useMemo(() => {
    const trimmed = url.trim();
    if (!trimmed) return null;
    try {
      const normalized = normalizeCompanionUrl(trimmed);
      const suggestedTitle = getSuggestedCompanionTitle(normalized, title);
      return {
        normalized,
        host: getCompanionHostname(normalized),
        title: suggestedTitle,
        kind: getCompanionKind(normalized, suggestedTitle, description),
      };
    } catch {
      return null;
    }
  }, [url, title, description]);

  if (!open) return null;

  const inputStyle: CSSProperties = {
    width: '100%',
    borderRadius: 14,
    border: `1px solid ${tokens.cardBorder}`,
    backgroundColor: tokens.wellBg,
    color: tokens.textPrimary,
    padding: '11px 12px',
    fontSize: 13,
    outline: 'none',
  };

  const handleCreate = () => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      setError('Add a URL first.');
      return;
    }
    try {
      const normalized = normalizeCompanionUrl(trimmedUrl);
      const content = buildCompanionContent({
        url: normalized,
        title,
        description,
        embedMode,
      } satisfies CompanionDraftInput);
      onCreate(content);
    } catch {
      setError('Enter a valid website URL.');
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-[90]"
        style={{ backgroundColor: 'rgba(0,0,0,0.56)', backdropFilter: 'blur(6px)' }}
        onClick={onClose}
      />
      <div
        className="fixed inset-0 z-[91] flex items-center justify-center p-4"
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="fw-companion-composer-title"
          className="w-full max-w-[560px] rounded-[24px] overflow-hidden"
          style={{
            background: `linear-gradient(180deg, ${tokens.cardBg}fa 0%, ${tokens.wellBg}f6 100%)`,
            border: `1px solid ${tokens.cardBorderHover}`,
            boxShadow: `0 36px 120px rgba(0,0,0,0.5), 0 0 0 1px ${tokens.accentGlow}`,
            backdropFilter: 'blur(28px) saturate(1.2)',
          }}
          onClick={event => event.stopPropagation()}
        >
          <div
            className="flex items-start justify-between gap-4 px-6 py-5"
            style={{ borderBottom: `1px solid ${tokens.divider}` }}
          >
            <div className="min-w-0">
              <div
                className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full"
                style={{
                  backgroundColor: `${tokens.accent}18`,
                  border: `1px solid ${tokens.accent}24`,
                  color: tokens.accent,
                }}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em]">
                  Companion Panel
                </span>
              </div>
              <h2 id="fw-companion-composer-title" className="mt-3 text-lg font-semibold" style={{ color: tokens.textPrimary }}>
                Pin an external tool into the workspace
              </h2>
              <p className="mt-1 text-sm leading-relaxed" style={{ color: tokens.textMuted }}>
                Calm, contextual, and spatial. If a site refuses embedding, it quietly becomes a
                premium launcher card instead.
              </p>
            </div>
            <button
              type="button"
              aria-label="Close companion composer"
              onClick={onClose}
              className="shrink-0 rounded-xl p-2 transition-colors cursor-pointer"
              style={{ color: tokens.textGhost, border: `1px solid transparent` }}
              onMouseEnter={event => {
                event.currentTarget.style.backgroundColor = tokens.wellBg;
                event.currentTarget.style.color = tokens.textPrimary;
                event.currentTarget.style.borderColor = tokens.cardBorder;
              }}
              onMouseLeave={event => {
                event.currentTarget.style.backgroundColor = 'transparent';
                event.currentTarget.style.color = tokens.textGhost;
                event.currentTarget.style.borderColor = 'transparent';
              }}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="px-6 py-5 space-y-4">
            <label className="block">
              <span
                className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.12em]"
                style={{ color: tokens.textGhost }}
              >
                URL
              </span>
              <input
                autoFocus
                value={url}
                onChange={event => {
                  setUrl(event.target.value);
                  if (error) setError(null);
                }}
                placeholder="claude.ai, chatgpt.com, desmos.com, youtube.com"
                className="focus:outline-none focus:ring-2 focus:ring-white/10"
                style={inputStyle}
              />
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span
                  className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.12em]"
                  style={{ color: tokens.textGhost }}
                >
                  Title
                </span>
                <input
                  value={title}
                  onChange={event => setTitle(event.target.value)}
                  placeholder="Optional label"
                  className="focus:outline-none focus:ring-2 focus:ring-white/10"
                  style={inputStyle}
                />
              </label>

              <label className="block">
                <span
                  className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.12em]"
                  style={{ color: tokens.textGhost }}
                >
                  Mode
                </span>
                <select
                  value={embedMode}
                  onChange={event => setEmbedMode(event.target.value as CompanionEmbedMode)}
                  className="focus:outline-none focus:ring-2 focus:ring-white/10"
                  style={inputStyle}
                >
                  {MODE_OPTIONS.map(option => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="block">
              <span
                className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.12em]"
                style={{ color: tokens.textGhost }}
              >
                Why it belongs here
              </span>
              <textarea
                value={description}
                onChange={event => setDescription(event.target.value)}
                placeholder="Macro study assistant, graph sandbox, lecture companion, source context..."
                rows={3}
                className="focus:outline-none focus:ring-2 focus:ring-white/10"
                style={{ ...inputStyle, resize: 'none', lineHeight: 1.5 }}
              />
            </label>

            <div
              className="rounded-[18px] p-4"
              style={{
                background: `linear-gradient(180deg, ${tokens.wellBg} 0%, ${tokens.cardBg} 100%)`,
                border: `1px solid ${tokens.cardBorder}`,
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
              }}
            >
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4" style={{ color: tokens.accent }} />
                <span className="text-sm font-semibold" style={{ color: tokens.textPrimary }}>
                  Preview
                </span>
              </div>
              {preview ? (
                <div className="mt-3 space-y-1.5">
                  <div className="text-sm font-medium" style={{ color: tokens.textPrimary }}>
                    {preview.title}
                  </div>
                  <div className="text-xs" style={{ color: tokens.textMuted }}>
                    {preview.host}
                  </div>
                  <div className="text-[11px]" style={{ color: tokens.textGhost }}>
                    {MODE_OPTIONS.find(option => option.id === embedMode)?.hint}
                  </div>
                  <div
                    className="inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]"
                    style={{
                      backgroundColor: `${tokens.accent}14`,
                      border: `1px solid ${tokens.accent}20`,
                      color: tokens.accent,
                    }}
                  >
                    {preview.kind}
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-xs leading-relaxed" style={{ color: tokens.textGhost }}>
                  Add a URL and the workspace will normalize it automatically before the panel is
                  created.
                </p>
              )}
            </div>

            {error && (
              <div
                className="rounded-xl px-3 py-2 text-sm"
                style={{
                  backgroundColor: 'rgba(248,113,113,0.08)',
                  border: '1px solid rgba(248,113,113,0.18)',
                  color: '#fca5a5',
                }}
              >
                {error}
              </div>
            )}
          </div>

          <div
            className="flex items-center justify-end gap-3 px-6 py-5"
            style={{ borderTop: `1px solid ${tokens.divider}` }}
          >
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2 text-sm font-medium cursor-pointer"
              style={{
                border: `1px solid ${tokens.cardBorder}`,
                color: tokens.textMuted,
                backgroundColor: 'transparent',
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCreate}
              className="rounded-xl px-4 py-2 text-sm font-semibold cursor-pointer"
              style={{
                backgroundColor: tokens.accent,
                color: '#000',
                boxShadow: `0 0 24px ${tokens.accentGlow}`,
              }}
            >
              Create companion
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
