import { useState } from 'react';
import { X } from 'lucide-react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import { parseGoogleStudyUrl } from '../../lib/studyFiles';

interface Props {
  tokens: AtmosphereTokens;
  onClose: () => void;
  onSubmit: (url: string, suggestedTitle: string) => void;
}

export function AddStudyFileUrlModal({ tokens, onClose, onSubmit }: Props) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseGoogleStudyUrl(url);
    if (!parsed) {
      setError('Paste a Google Docs, Sheets, or Slides link.');
      return;
    }
    onSubmit(parsed.url, parsed.suggestedTitle);
  };

  return (
    <div
      role="dialog"
      aria-label="Add Google study link"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 120,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(6px)',
      }}
      onClick={onClose}
    >
      <form
        onClick={e => e.stopPropagation()}
        onSubmit={handleSubmit}
        style={{
          width: 'min(440px, 100%)',
          borderRadius: 18,
          border: `1px solid ${tokens.cardBorder}`,
          background: tokens.cardBg,
          padding: 20,
          boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div>
            <p style={{ margin: 0, fontSize: 10, fontWeight: 750, letterSpacing: '0.14em', textTransform: 'uppercase', color: tokens.accent }}>
              External source
            </p>
            <h2 style={{ margin: '4px 0 0', fontSize: 18, fontWeight: 800, color: tokens.textPrimary }}>Link Google Doc or Sheet</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ border: 'none', background: 'transparent', color: tokens.textMuted, cursor: 'pointer' }}>
            <X className="w-4 h-4" />
          </button>
        </div>
        <p style={{ margin: '0 0 12px', fontSize: 12.5, color: tokens.textSecondary, lineHeight: 1.45 }}>
          Opens in your browser — stays connected to notebooks, mistakes, and review.
        </p>
        <input
          type="url"
          value={url}
          onChange={e => { setUrl(e.target.value); setError(null); }}
          placeholder="https://docs.google.com/document/d/…"
          autoFocus
          style={{
            width: '100%',
            padding: '10px 12px',
            borderRadius: 10,
            border: `1px solid ${error ? '#f87171' : tokens.cardBorder}`,
            background: tokens.wellBg,
            color: tokens.textPrimary,
            fontSize: 13,
            outline: 'none',
            marginBottom: 8,
          }}
        />
        {error ? <p style={{ margin: '0 0 10px', fontSize: 11.5, color: '#f87171' }}>{error}</p> : null}
        <button
          type="submit"
          style={{
            width: '100%',
            padding: '10px 14px',
            borderRadius: 10,
            border: 'none',
            background: tokens.accent,
            color: '#000',
            fontWeight: 750,
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          Add to workspace
        </button>
      </form>
    </div>
  );
}
