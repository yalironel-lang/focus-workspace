import { useCallback, useEffect, useRef, useState } from 'react';
import { ZoomIn } from 'lucide-react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import type { ProjectObjectContent } from '../../hooks/useSectionFreeSpaceObjects';
import { ensureProjectObjectContent } from '../../hooks/useSectionFreeSpaceObjects';
import { loadImageBlob } from '../../lib/freeSpaceImageIdb';

interface FreeSpaceImageCardProps {
  objectId: string;
  content: ProjectObjectContent;
  tokens: AtmosphereTokens;
  sectionId: string;
  onChange: (next: ProjectObjectContent) => void;
}

export function FreeSpaceImageCard({
  objectId,
  content: rawContent,
  tokens,
  sectionId,
  onChange: _onChange,
}: FreeSpaceImageCardProps) {
  const content = ensureProjectObjectContent('image', rawContent);
  if (content.type !== 'image') return null;

  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [expanded, setExpanded] = useState(false);
  const mounted = useRef(true);

  const revokeIf = useCallback((url: string | null) => {
    if (url && url.startsWith('blob:')) URL.revokeObjectURL(url);
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;

    const run = async () => {
      if (content.url) {
        setLoadState('ready');
        setObjectUrl((prev) => {
          revokeIf(prev);
          return content.url;
        });
        return;
      }
      if (!content.fileName && !content.fileSize) {
        setLoadState('idle');
        setObjectUrl((prev) => {
          revokeIf(prev);
          return null;
        });
        return;
      }
      setLoadState('loading');
      try {
        const blob = await loadImageBlob(sectionId, objectId);
        if (cancelled || !mounted.current) return;
        if (!blob) {
          setLoadState('error');
          setObjectUrl((prev) => {
            revokeIf(prev);
            return null;
          });
          return;
        }
        url = URL.createObjectURL(blob);
        setObjectUrl((prev) => {
          revokeIf(prev);
          return url;
        });
        setLoadState('ready');
      } catch {
        if (!cancelled && mounted.current) setLoadState('error');
      }
    };

    void run();
    return () => {
      cancelled = true;
      if (url) revokeIf(url);
    };
  }, [content.url, content.fileName, content.fileSize, objectId, sectionId, revokeIf]);

  useEffect(
    () => () => {
      setObjectUrl((prev) => {
        revokeIf(prev);
        return null;
      });
    },
    [revokeIf],
  );

  if (loadState === 'idle' && !content.url) {
    return (
      <div
        style={{
          minHeight: 120,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: tokens.textGhost,
          fontSize: 12,
          padding: 16,
          textAlign: 'center',
        }}
      >
        Drop an image onto the canvas or paste a screenshot (⌘V).
      </div>
    );
  }

  if (loadState === 'loading') {
    return (
      <div style={{ minHeight: 120, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 11, color: tokens.textMuted, letterSpacing: '0.06em' }}>Loading…</span>
      </div>
    );
  }

  if (loadState === 'error' || !objectUrl) {
    return (
      <div
        style={{
          minHeight: 120,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: tokens.textMuted,
          fontSize: 12,
          padding: 16,
        }}
      >
        Image unavailable on this device.
      </div>
    );
  }

  const label = content.fileName ?? content.alt ?? 'Image';

  return (
    <>
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          minHeight: 80,
          display: 'flex',
          flexDirection: 'column',
          background: 'rgba(12,14,18,0.35)',
          borderRadius: 10,
          overflow: 'hidden',
          boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06)',
        }}
      >
        <img
          src={objectUrl}
          alt={content.alt ?? label}
          draggable={false}
          onDoubleClick={() => setExpanded(true)}
          onClick={(e) => {
            if (e.detail === 2) return;
            setExpanded(true);
          }}
          style={{
            flex: 1,
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            display: 'block',
            cursor: 'zoom-in',
            userSelect: 'none',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            display: 'flex',
            gap: 4,
            opacity: 0.85,
          }}
        >
          <button
            type="button"
            title="View larger"
            onClick={() => setExpanded(true)}
            style={{
              border: 'none',
              borderRadius: 6,
              padding: '5px 7px',
              background: 'rgba(0,0,0,0.55)',
              color: '#f8fafc',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <ZoomIn size={14} />
          </button>
        </div>
        {content.caption ? (
          <p
            style={{
              margin: 0,
              padding: '6px 10px',
              fontSize: 10,
              color: tokens.textGhost,
              borderTop: `1px solid ${tokens.cardBorder}`,
              background: 'rgba(0,0,0,0.25)',
            }}
          >
            {content.caption}
          </p>
        ) : null}
      </div>
      {expanded ? (
        <div
          role="dialog"
          aria-label="Image preview"
          onClick={() => setExpanded(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10050,
            background: 'rgba(0,0,0,0.88)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'zoom-out',
          }}
        >
          <img
            src={objectUrl}
            alt={content.alt ?? label}
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: '92vw',
              maxHeight: '92vh',
              objectFit: 'contain',
              borderRadius: 8,
              boxShadow: '0 12px 48px rgba(0,0,0,0.5)',
            }}
          />
          <button
            type="button"
            onClick={() => setExpanded(false)}
            style={{
              position: 'fixed',
              top: 20,
              right: 24,
              border: 'none',
              borderRadius: 8,
              padding: '8px 12px',
              background: 'rgba(255,255,255,0.12)',
              color: '#f8fafc',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12,
            }}
          >
            Close
          </button>
        </div>
      ) : null}
    </>
  );
}
