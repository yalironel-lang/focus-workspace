import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import type { AtmosphereTokens } from '../../../hooks/useAtmosphere';
import type { BlockContent } from '../../../hooks/useCustomBlocks';

type Content = Extract<BlockContent, { type: 'link' }>;

interface Props {
  content:  Content;
  tokens:   AtmosphereTokens;
  onChange: (c: Content) => void;
}

function getDomain(url: string) {
  try { return new URL(url.startsWith('http') ? url : `https://${url}`).hostname; }
  catch { return url; }
}

function getFaviconUrl(url: string) {
  const domain = getDomain(url);
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
}

export function LinkBlock({ content, tokens, onChange }: Props) {
  const [editing, setEditing] = useState(!content.url);
  const [draftTitle, setDraftTitle] = useState(content.title);
  const [draftUrl,   setDraftUrl]   = useState(content.url);
  const [draftDesc,  setDraftDesc]  = useState(content.description ?? '');

  const save = () => {
    const url = draftUrl.trim();
    if (!url) return;
    const normalized = url.startsWith('http') ? url : `https://${url}`;
    onChange({
      ...content,
      title:       draftTitle.trim() || getDomain(normalized),
      url:         normalized,
      description: draftDesc.trim() || undefined,
    });
    setEditing(false);
  };

  const open = () => {
    if (content.url) window.open(content.url, '_blank', 'noopener,noreferrer');
  };

  // ── Edit form ───────────────────────────────────────────────────────────────
  if (editing || !content.url) {
    return (
      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <p style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: tokens.textGhost, marginBottom: '2px' }}>
          Link Card
        </p>
        {[
          { placeholder: 'URL (required)',     value: draftUrl,   set: setDraftUrl,   type: 'url'  },
          { placeholder: 'Title',              value: draftTitle, set: setDraftTitle, type: 'text' },
          { placeholder: 'Short description', value: draftDesc,  set: setDraftDesc,  type: 'text' },
        ].map(({ placeholder, value, set, type }) => (
          <input
            key={placeholder}
            type={type}
            value={value}
            onChange={e => set(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') save(); }}
            placeholder={placeholder}
            style={{
              width: '100%', padding: '7px 10px', borderRadius: '9px',
              border: `1px solid ${tokens.cardBorder}`, background: tokens.wellBg,
              color: tokens.textPrimary, fontSize: '12px', outline: 'none', fontFamily: 'inherit',
            }}
            onFocus={e => (e.currentTarget.style.borderColor = tokens.focusBorder)}
            onBlur={e  => (e.currentTarget.style.borderColor = tokens.cardBorder)}
          />
        ))}
        <div style={{ display: 'flex', gap: '6px', marginTop: '2px' }}>
          <button
            onClick={save}
            disabled={!draftUrl.trim()}
            style={{
              flex: 1, padding: '7px', borderRadius: '9px', border: 'none',
              background: tokens.accent, color: '#000', fontWeight: 700, fontSize: '12px',
              cursor: draftUrl.trim() ? 'pointer' : 'not-allowed', opacity: draftUrl.trim() ? 1 : 0.4,
            }}
          >
            Save
          </button>
          {content.url && (
            <button
              onClick={() => setEditing(false)}
              style={{
                padding: '7px 12px', borderRadius: '9px',
                border: `1px solid ${tokens.cardBorder}`, background: 'transparent',
                color: tokens.textGhost, fontSize: '12px', cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Display card ────────────────────────────────────────────────────────────
  const domain = getDomain(content.url);

  return (
    <div
      style={{ padding: '14px 16px', cursor: 'pointer' }}
      onClick={open}
      onDoubleClick={e => { e.stopPropagation(); setEditing(true); }}
      title="Click to open · double-click to edit"
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
        {/* Favicon */}
        <img
          src={getFaviconUrl(content.url)}
          alt=""
          width={20} height={20}
          style={{ borderRadius: '4px', marginTop: '2px', flexShrink: 0, opacity: 0.85 }}
          onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: '13px', fontWeight: 600, color: tokens.textPrimary, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {content.title}
          </p>
          {content.description && (
            <p style={{ fontSize: '11px', color: tokens.textMuted, margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {content.description}
            </p>
          )}
          <p style={{ fontSize: '10px', color: tokens.textGhost, margin: '3px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {domain}
          </p>
        </div>
        <ExternalLink className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: tokens.accent }} />
      </div>
    </div>
  );
}
