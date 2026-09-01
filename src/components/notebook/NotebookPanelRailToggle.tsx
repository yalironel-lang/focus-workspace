import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';

/** Slim visual rail; interactive target is square at this size. */
export const NOTEBOOK_PANEL_RAIL_WIDTH_PX = 36;

const HIT_PX = NOTEBOOK_PANEL_RAIL_WIDTH_PX;

interface Props {
  tokens: AtmosphereTokens;
  edge: 'left' | 'right';
  /** True when the adjacent panel is expanded. */
  panelOpen: boolean;
  onToggle: () => void;
  expandLabel: string;
  collapseLabel: string;
  /** Seam = centered on panel edge; rail = full-height collapsed column. */
  variant?: 'seam' | 'rail';
}

export function NotebookPanelRailToggle({
  tokens,
  edge,
  panelOpen,
  onToggle,
  expandLabel,
  collapseLabel,
  variant = 'seam',
}: Props) {
  const [hovered, setHovered] = useState(false);
  const label = panelOpen ? collapseLabel : expandLabel;
  const Icon =
    edge === 'left'
      ? panelOpen
        ? ChevronLeft
        : ChevronRight
      : panelOpen
        ? ChevronRight
        : ChevronLeft;

  const isRail = variant === 'rail';

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-expanded={panelOpen}
      onClick={onToggle}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      style={{
        flexShrink: 0,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: HIT_PX,
        minWidth: HIT_PX,
        height: isRail ? undefined : HIT_PX,
        minHeight: isRail ? 56 : HIT_PX,
        alignSelf: isRail ? 'stretch' : undefined,
        padding: 0,
        margin: 0,
        border: `1px solid ${hovered ? `${tokens.accent}55` : tokens.cardBorder}`,
        borderRadius: 10,
        background: hovered ? tokens.wellBg : tokens.cardBg,
        color: hovered ? tokens.textSecondary : tokens.textMuted,
        cursor: 'pointer',
        touchAction: 'manipulation',
        boxShadow: hovered ? '0 2px 10px rgba(0,0,0,0.14)' : '0 1px 4px rgba(0,0,0,0.08)',
        pointerEvents: 'auto',
        transition: 'background 0.15s ease, border-color 0.15s ease, color 0.15s ease, box-shadow 0.15s ease',
      }}
    >
      <Icon size={16} strokeWidth={2.25} />
    </button>
  );
}
