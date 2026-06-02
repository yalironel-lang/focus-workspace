import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import type { StudyLayoutMode } from '../../lib/mathDesk/studyLayout';
import { studyLayoutLabel } from '../../lib/mathDesk/studyLayout';
import { LayoutPanelLeft, LayoutPanelTop } from 'lucide-react';

interface Props {
  tokens: AtmosphereTokens;
  title: string;
  layout: StudyLayoutMode;
  onReturnToCanvas: () => void;
  onSelect?: () => void;
}

export function StudyLayoutDockedPlaceholder({
  tokens,
  title,
  layout,
  onReturnToCanvas,
  onSelect,
}: Props) {
  return (
    <div
      className="study-layout-placeholder"
      onClick={onSelect}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect?.();
        }
      }}
      role={onSelect ? 'button' : undefined}
      tabIndex={onSelect ? 0 : undefined}
      style={{
        width: '100%',
        height: '100%',
        minHeight: 88,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 8,
        padding: '14px 16px',
        borderRadius: 10,
        background: `linear-gradient(145deg, ${tokens.wellBg} 0%, ${tokens.cardBg} 100%)`,
        border: `1px dashed ${tokens.cardBorder}`,
        cursor: onSelect ? 'pointer' : 'default',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <LayoutPanelTop size={14} strokeWidth={2} color={tokens.accent} aria-hidden />
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: tokens.textGhost,
          }}
        >
          Math Desk · {studyLayoutLabel(layout)}
        </span>
      </div>
      <p
        style={{
          margin: 0,
          fontSize: 13,
          fontWeight: 600,
          color: tokens.textPrimary,
          lineHeight: 1.35,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {title || 'Notebook'}
      </p>
      <p style={{ margin: 0, fontSize: 11, color: tokens.textMuted, lineHeight: 1.45 }}>
        Working in study layout. PDF and other objects stay on the canvas.
      </p>
      <button
        type="button"
        onClick={e => {
          e.stopPropagation();
          onReturnToCanvas();
        }}
        style={{
          alignSelf: 'flex-start',
          marginTop: 4,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '5px 10px',
          borderRadius: 6,
          border: `1px solid ${tokens.cardBorder}`,
          background: tokens.cardBg,
          color: tokens.textMuted,
          fontSize: 11,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        <LayoutPanelLeft size={12} strokeWidth={2} aria-hidden />
        Return to canvas
      </button>
    </div>
  );
}
