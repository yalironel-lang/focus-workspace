import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import toast from 'react-hot-toast';
import { Copy, ExternalLink, Globe, PencilLine } from 'lucide-react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import type { ProjectObjectContent } from '../../hooks/useSectionFreeSpaceObjects';
import { ensureProjectObjectContent } from '../../hooks/useSectionFreeSpaceObjects';
import {
  buildCompanionContent,
  getCompanionHostname,
  getCompanionKind,
  isLikelyExternalOnlyCompanion,
  normalizeCompanionUrl,
  type CompanionEmbedMode,
} from '../../lib/companionPanels';

interface Props {
  content: ProjectObjectContent;
  tokens: AtmosphereTokens;
  onChange: (next: ProjectObjectContent) => void;
  onTitleChange?: (title: string) => void;
}

type EmbedViewState = 'idle' | 'probing' | 'embedded' | 'fallback';

const PROBE_TIMEOUT_MS = 3600;

export function FreeSpaceCompanionCard({
  content: rawContent,
  tokens,
  onChange,
  onTitleChange,
}: Props) {
  const content = ensureProjectObjectContent('companion', rawContent);
  if (content.type !== 'companion') return null;

  const [editing, setEditing] = useState(!content.url);
  const [draftUrl, setDraftUrl] = useState(content.url);
  const [draftTitle, setDraftTitle] = useState(content.title);
  const [draftDescription, setDraftDescription] = useState(content.description ?? '');
  const [draftMode, setDraftMode] = useState<CompanionEmbedMode>(content.embedMode);
  const [embedState, setEmbedState] = useState<EmbedViewState>('idle');

  useEffect(() => {
    setDraftUrl(content.url);
    setDraftTitle(content.title);
    setDraftDescription(content.description ?? '');
    setDraftMode(content.embedMode);
    if (!content.url) setEditing(true);
  }, [content.url, content.title, content.description, content.embedMode]);

  const host = useMemo(() => getCompanionHostname(content.url), [content.url]);
  const companionKind = useMemo(
    () => getCompanionKind(content.url, content.title, content.description),
    [content.url, content.title, content.description],
  );
  const autoExternalOnly = useMemo(
    () => content.embedMode === 'auto' && isLikelyExternalOnlyCompanion(content.url),
    [content.embedMode, content.url],
  );
  const shouldProbe =
    !!content.url &&
    !editing &&
    (content.embedMode === 'embedded' || (content.embedMode === 'auto' && !autoExternalOnly));

  const lastProbeUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!content.url || editing) {
      setEmbedState('idle');
      lastProbeUrlRef.current = null;
      return;
    }
    if (!shouldProbe) {
      setEmbedState('fallback');
      lastProbeUrlRef.current = content.url;
      return;
    }
    if (lastProbeUrlRef.current === content.url) return;
    lastProbeUrlRef.current = content.url;
    setEmbedState('probing');
    const timer = window.setTimeout(() => {
      setEmbedState(current => (current === 'embedded' ? current : 'fallback'));
    }, PROBE_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [content.url, shouldProbe, editing]);

  const saveEdits = () => {
    const trimmed = draftUrl.trim();
    if (!trimmed) {
      toast.error('Add a website URL first.');
      return;
    }

    try {
      const normalized = normalizeCompanionUrl(trimmed);
      const next = buildCompanionContent({
        url: normalized,
        title: draftTitle,
        description: draftDescription,
        embedMode: draftMode,
        lastOpenedAt: content.lastOpenedAt,
        preferredSize: content.preferredSize,
      });
      onChange({ type: 'companion', ...next });
      onTitleChange?.(next.title);
      setEditing(false);
    } catch {
      toast.error('Enter a valid website URL.');
    }
  };

  const openCompanion = () => {
    if (!content.url) return;
    window.open(content.url, '_blank', 'noopener,noreferrer');
    onChange({
      ...content,
      lastOpenedAt: Date.now(),
    });
  };

  const copyUrl = async () => {
    if (!content.url) return;
    try {
      await navigator.clipboard.writeText(content.url);
      toast.success('Companion URL copied');
    } catch {
      toast.error('Could not copy the URL.');
    }
  };

  const actionButton = (active = false): CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 10,
    padding: '8px 10px',
    border: active ? `1px solid ${tokens.accent}28` : `1px solid ${tokens.cardBorder}`,
    backgroundColor: active ? `${tokens.accent}18` : 'rgba(255,255,255,0.03)',
    color: active ? tokens.accent : tokens.textMuted,
    cursor: 'pointer',
    transition: 'all 0.18s ease',
  });

  if (editing) {
    return (
      <div
        className="flex h-full flex-col rounded-2xl overflow-hidden"
        style={{
          background: `linear-gradient(180deg, ${tokens.cardBg} 0%, ${tokens.wellBg} 100%)`,
          border: `1px solid ${tokens.cardBorderHover}`,
          boxShadow: `inset 0 1px 0 rgba(255,255,255,0.06), 0 0 28px ${tokens.accentGlow}`,
        }}
      >
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: `1px solid ${tokens.divider}` }}
        >
          <div>
            <div
              className="text-[10px] font-semibold uppercase tracking-[0.14em]"
              style={{ color: tokens.textGhost }}
            >
              Companion
            </div>
            <div className="mt-1 text-sm font-medium" style={{ color: tokens.textPrimary }}>
              Configure the panel
            </div>
          </div>
          {content.url && (
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-lg px-3 py-1.5 text-xs font-medium cursor-pointer"
              style={{
                border: `1px solid ${tokens.cardBorder}`,
                backgroundColor: 'transparent',
                color: tokens.textMuted,
              }}
            >
              Cancel
            </button>
          )}
        </div>

        <div className="flex-1 space-y-3 p-4 overflow-auto">
          <label className="block">
            <span
              className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.12em]"
              style={{ color: tokens.textGhost }}
            >
              URL
            </span>
            <input
              autoFocus={!content.url}
              value={draftUrl}
              onChange={event => setDraftUrl(event.target.value)}
              placeholder="https://example.com"
              className="w-full rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-white/10"
              style={{
                border: `1px solid ${tokens.cardBorder}`,
                backgroundColor: tokens.wellBg,
                color: tokens.textPrimary,
              }}
            />
          </label>

          <label className="block">
            <span
              className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.12em]"
              style={{ color: tokens.textGhost }}
            >
              Title
            </span>
            <input
              value={draftTitle}
              onChange={event => setDraftTitle(event.target.value)}
              placeholder="Optional label"
              className="w-full rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-white/10"
              style={{
                border: `1px solid ${tokens.cardBorder}`,
                backgroundColor: tokens.wellBg,
                color: tokens.textPrimary,
              }}
            />
          </label>

          <label className="block">
            <span
              className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.12em]"
              style={{ color: tokens.textGhost }}
            >
              Notes
            </span>
            <textarea
              rows={3}
              value={draftDescription}
              onChange={event => setDraftDescription(event.target.value)}
              placeholder="Why this companion belongs in the room"
              className="w-full rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-white/10"
              style={{
                border: `1px solid ${tokens.cardBorder}`,
                backgroundColor: tokens.wellBg,
                color: tokens.textPrimary,
                lineHeight: 1.45,
              }}
            />
          </label>

          <label className="block">
            <span
              className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.12em]"
              style={{ color: tokens.textGhost }}
            >
              Mode
            </span>
            <select
              value={draftMode}
              onChange={event => setDraftMode(event.target.value as CompanionEmbedMode)}
              className="w-full rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-white/10"
              style={{
                border: `1px solid ${tokens.cardBorder}`,
                backgroundColor: tokens.wellBg,
                color: tokens.textPrimary,
              }}
            >
              <option value="auto">Auto</option>
              <option value="embedded">Embedded</option>
              <option value="external-only">External only</option>
            </select>
          </label>
        </div>

        <div
          className="flex items-center justify-end gap-2 px-4 py-3"
          style={{ borderTop: `1px solid ${tokens.divider}` }}
        >
          <button
            type="button"
            onClick={saveEdits}
            className="rounded-xl px-4 py-2 text-sm font-semibold cursor-pointer"
            style={{
              backgroundColor: tokens.accent,
              color: '#000',
              boxShadow: `0 0 18px ${tokens.accentGlow}`,
            }}
          >
            Save companion
          </button>
        </div>
      </div>
    );
  }

  const fallbackTitle =
    content.embedMode === 'external-only' || autoExternalOnly
      ? 'This companion opens externally.'
      : "This site can't be embedded.";
  const fallbackBody =
    content.embedMode === 'external-only' || autoExternalOnly
      ? 'The workspace still remembers what it is, why it belongs here, and where it fits.'
      : 'Browser security rules blocked the inline view, so the panel stays useful as a calm launcher.';

  return (
    <div
      className="flex h-full min-h-[220px] flex-col rounded-2xl overflow-hidden"
      style={{
        background: `linear-gradient(180deg, ${tokens.cardBg} 0%, ${tokens.wellBg} 100%)`,
        border: `1px solid ${tokens.cardBorderHover}`,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.06), 0 0 24px ${tokens.accentGlow}`,
      }}
    >
      <div
        className="flex items-center gap-3 px-4 py-3"
        style={{ borderBottom: `1px solid ${tokens.divider}` }}
      >
        {content.favicon ? (
          <img
            src={content.favicon}
            alt=""
            width={18}
            height={18}
            className="rounded-[5px] shrink-0"
            onError={event => {
              (event.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <div
            className="flex h-[18px] w-[18px] items-center justify-center rounded-[5px] shrink-0"
            style={{ backgroundColor: `${tokens.accent}16`, color: tokens.accent }}
          >
            <Globe className="w-3.5 h-3.5" />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold" style={{ color: tokens.textPrimary }}>
            {content.title}
          </div>
          <div className="mt-0.5 flex items-center gap-2">
            <span className="truncate text-[11px]" style={{ color: tokens.textGhost }}>
              {host || 'External companion'}
            </span>
            <span
              className="shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em]"
              style={{
                backgroundColor: `${tokens.accent}14`,
                border: `1px solid ${tokens.accent}1e`,
                color: tokens.accent,
              }}
            >
              {content.embedMode}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            title="Open companion"
            aria-label="Open companion"
            onClick={openCompanion}
            style={actionButton(true)}
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            title="Edit companion"
            aria-label="Edit companion"
            onClick={() => setEditing(true)}
            style={actionButton()}
          >
            <PencilLine className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {shouldProbe && (embedState === 'probing' || embedState === 'embedded') ? (
        <div
          className="relative min-h-0 flex-1"
          style={{ backgroundColor: tokens.wellBg, contain: 'layout paint', isolation: 'isolate' }}
        >
          <iframe
            title={content.title}
            src={content.url}
            className="h-full w-full border-0"
            sandbox="allow-forms allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts"
            referrerPolicy="strict-origin-when-cross-origin"
            allow="fullscreen; picture-in-picture"
            style={{
              visibility: embedState === 'embedded' ? 'visible' : 'hidden',
              backgroundColor: tokens.wellBg,
            }}
            onLoad={() => setEmbedState('embedded')}
            onError={() => setEmbedState('fallback')}
          />

          {embedState !== 'embedded' && (
            <div
              className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center"
              style={{
                background: `linear-gradient(180deg, ${tokens.cardBg}d8 0%, ${tokens.wellBg}f0 100%)`,
              }}
            >
              <div
                className="h-10 w-10 animate-pulse rounded-full"
                style={{
                  background: `radial-gradient(circle, ${tokens.accentGlow} 0%, transparent 72%)`,
                  filter: 'blur(1px)',
                }}
              />
              <p className="text-sm font-medium" style={{ color: tokens.textPrimary }}>
                Trying inline view…
              </p>
              <p className="max-w-[280px] text-xs leading-relaxed" style={{ color: tokens.textMuted }}>
                If the site blocks embedding, this quietly becomes an external companion card.
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-1 flex-col justify-between gap-5 p-5">
          <div>
            <div
              className="inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]"
              style={{
                backgroundColor: `${tokens.accent}12`,
                border: `1px solid ${tokens.accent}1e`,
                color: tokens.accent,
              }}
            >
              {companionKind}
            </div>

            <h3 className="mt-4 text-base font-semibold" style={{ color: tokens.textPrimary }}>
              {fallbackTitle}
            </h3>
            <p className="mt-2 max-w-[420px] text-sm leading-relaxed" style={{ color: tokens.textMuted }}>
              {fallbackBody}
            </p>

            {content.description && (
              <div
                className="mt-4 rounded-2xl p-3 text-sm leading-relaxed"
                style={{
                  backgroundColor: 'rgba(255,255,255,0.03)',
                  border: `1px solid ${tokens.cardBorder}`,
                  color: tokens.textSecondary,
                }}
              >
                {content.description}
              </div>
            )}

            {content.lastOpenedAt && (
              <p className="mt-3 text-[11px]" style={{ color: tokens.textGhost }}>
                Last opened {new Date(content.lastOpenedAt).toLocaleString()}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={openCompanion}
              className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold cursor-pointer"
              style={{
                backgroundColor: `${tokens.accent}18`,
                border: `1px solid ${tokens.accent}28`,
                color: tokens.accent,
              }}
            >
              <ExternalLink className="w-4 h-4" />
              Open companion
            </button>
            <button
              type="button"
              onClick={copyUrl}
              className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium cursor-pointer"
              style={{
                backgroundColor: 'rgba(255,255,255,0.03)',
                border: `1px solid ${tokens.cardBorder}`,
                color: tokens.textMuted,
              }}
            >
              <Copy className="w-4 h-4" />
              Copy URL
            </button>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium cursor-pointer"
              style={{
                backgroundColor: 'rgba(255,255,255,0.03)',
                border: `1px solid ${tokens.cardBorder}`,
                color: tokens.textMuted,
              }}
            >
              <PencilLine className="w-4 h-4" />
              Edit URL
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
