import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import { getNotebookPreviewMeta, type NotebookContentWithPages } from '../../lib/notebookPages';
import { TOUCH_TARGET_MIN_PX } from '../../lib/ui/touchTarget';

interface Props {
  content: NotebookContentWithPages;
  objectTitle?: string;
  tokens: AtmosphereTokens;
  onOpen: () => void;
}

export function NotebookCardPreview({ content, objectTitle, tokens, onOpen }: Props) {
  const meta = getNotebookPreviewMeta(content);
  const title = objectTitle && objectTitle !== 'Notebook' ? objectTitle : 'Notebook';

  return (
    <div
      data-nb-card-preview="1"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        padding: '14px 16px 16px',
        boxSizing: 'border-box',
        gap: 12,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: tokens.textPrimary,
            letterSpacing: '0.01em',
            marginBottom: 4,
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: tokens.textMuted,
            letterSpacing: '0.02em',
          }}
        >
          {meta.sectionTitle} · {meta.pageTitle}
        </div>
        <div style={{ fontSize: 10, color: tokens.textGhost, marginTop: 4 }}>
          Page {meta.pageIndexInSection} of {meta.pagesInSection}
          {meta.totalSections > 1 ? ` · ${meta.totalSections} topics` : ''}
        </div>
      </div>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
          borderRadius: 10,
          border: `1px solid ${tokens.cardBorder}`,
          background: 'rgba(255,255,255,0.03)',
          padding: '10px 12px',
        }}
      >
        <div
          style={{
            fontSize: 11,
            lineHeight: 1.55,
            color: tokens.textSecondary,
            display: '-webkit-box',
            WebkitLineClamp: 5,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            whiteSpace: 'pre-wrap',
          }}
        >
          {meta.snippet || 'Empty page — open to start writing.'}
        </div>
      </div>

      <button
        type="button"
        onClick={e => {
          e.stopPropagation();
          onOpen();
        }}
        style={{
          minHeight: TOUCH_TARGET_MIN_PX,
          border: `1px solid ${tokens.accent}55`,
          background: `${tokens.accent}20`,
          color: tokens.accent,
          borderRadius: 10,
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: '0.03em',
          cursor: 'pointer',
          touchAction: 'manipulation',
          flexShrink: 0,
        }}
      >
        Open notebook
      </button>
    </div>
  );
}
