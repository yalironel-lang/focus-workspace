import { useState } from 'react';
import type { AtmosphereTokens } from '../../../hooks/useAtmosphere';
import type { BlockContent } from '../../../hooks/useCustomBlocks';

type Content = Extract<BlockContent, { type: 'image' }>;

interface Props {
  content:  Content;
  tokens:   AtmosphereTokens;
  onChange: (c: Content) => void;
}

export function ImageBlock({ content, tokens, onChange }: Props) {
  const [draft,     setDraft]     = useState(content.url);
  const [editMode,  setEditMode]  = useState(!content.url);
  const [imgError,  setImgError]  = useState(false);

  const submit = () => {
    const url = draft.trim();
    if (!url) return;
    onChange({ ...content, url });
    setEditMode(false);
    setImgError(false);
  };

  // ── URL input form ──────────────────────────────────────────────────────────
  if (editMode || !content.url) {
    return (
      <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '10px', minHeight: '120px', justifyContent: 'center' }}>
        <div style={{ fontSize: '28px', textAlign: 'center', opacity: 0.4 }}>🖼️</div>
        <input
          type="url"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit(); }}
          placeholder="Paste image URL…"
          autoFocus
          style={{
            width:        '100%',
            padding:      '8px 12px',
            borderRadius: '10px',
            border:       `1px solid ${tokens.cardBorder}`,
            background:   tokens.wellBg,
            color:        tokens.textPrimary,
            fontSize:     '13px',
            outline:      'none',
            fontFamily:   'inherit',
          }}
          onFocus={e => (e.currentTarget.style.borderColor = tokens.focusBorder)}
          onBlur={e  => (e.currentTarget.style.borderColor = tokens.cardBorder)}
        />
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            onClick={submit}
            disabled={!draft.trim()}
            style={{
              flex:            1,
              padding:         '7px 12px',
              borderRadius:    '9px',
              border:          'none',
              background:      tokens.accent,
              color:           '#000',
              fontWeight:      700,
              fontSize:        '12px',
              cursor:          draft.trim() ? 'pointer' : 'not-allowed',
              opacity:         draft.trim() ? 1 : 0.4,
            }}
          >
            Set image
          </button>
          {content.url && (
            <button
              onClick={() => setEditMode(false)}
              style={{
                padding:      '7px 12px',
                borderRadius: '9px',
                border:       `1px solid ${tokens.cardBorder}`,
                background:   'transparent',
                color:        tokens.textGhost,
                fontSize:     '12px',
                cursor:       'pointer',
              }}
            >
              Cancel
            </button>
          )}
        </div>
        <p style={{ fontSize: '10px', color: tokens.textGhost, textAlign: 'center' }}>
          File upload coming soon
        </p>
      </div>
    );
  }

  // ── Loaded image ────────────────────────────────────────────────────────────
  return (
    <div style={{ position: 'relative', overflow: 'hidden' }}>
      {imgError ? (
        <div
          style={{
            padding:    '24px',
            textAlign:  'center',
            color:      tokens.textGhost,
            fontSize:   '13px',
          }}
        >
          <div style={{ fontSize: '24px', marginBottom: '6px' }}>⚠️</div>
          Could not load image
          <br />
          <button
            onClick={() => { setEditMode(true); setImgError(false); }}
            style={{ marginTop: '8px', fontSize: '12px', color: tokens.accent, background: 'none', border: 'none', cursor: 'pointer' }}
          >
            Change URL
          </button>
        </div>
      ) : (
        <>
          <img
            src={content.url}
            alt={content.alt ?? ''}
            onError={() => setImgError(true)}
            style={{
              width:       '100%',
              display:     'block',
              maxHeight:   '320px',
              objectFit:   'cover',
              borderRadius: '0',
            }}
          />
          {/* Edit overlay on hover */}
          <button
            onClick={() => setEditMode(true)}
            style={{
              position:    'absolute',
              top:         '8px',
              right:       '8px',
              padding:     '4px 10px',
              borderRadius: '8px',
              border:       'none',
              background:   'rgba(0,0,0,0.6)',
              color:        '#fff',
              fontSize:     '11px',
              cursor:       'pointer',
              opacity:      0,
              transition:   'opacity 0.15s',
            }}
            className="img-edit-btn"
          >
            Change
          </button>
        </>
      )}

      {content.caption && (
        <p
          style={{
            padding:  '8px 12px',
            fontSize: '11px',
            color:    tokens.textGhost,
            textAlign: 'center',
            borderTop: `1px solid ${tokens.cardBorder}`,
          }}
        >
          {content.caption}
        </p>
      )}
    </div>
  );
}
