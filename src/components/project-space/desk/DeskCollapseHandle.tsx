import type { AtmosphereTokens } from '../../../hooks/useAtmosphere';

export type DeskHandleKind = 'formula' | 'graph' | 'compute' | 'scratch';

const LABELS: Record<DeskHandleKind, string> = {
  formula: 'Refs',
  graph: 'Plot',
  compute: 'Calc',
  scratch: 'Scrap',
};

const TITLES: Record<DeskHandleKind, string> = {
  formula: 'Formula references',
  graph: 'Graph',
  compute: 'Side calculator',
  scratch: 'Scratch pad',
};

interface Props {
  tokens: AtmosphereTokens;
  kind: DeskHandleKind;
  collapsed: boolean;
  onToggle: () => void;
  edge: 'left' | 'right' | 'bottom';
  badge?: number;
  variant?: 'primary' | 'peripheral';
}

export function DeskCollapseHandle({
  tokens,
  kind,
  collapsed,
  onToggle,
  edge,
  badge,
  variant: _variant = 'primary',
}: Props) {
  const label = LABELS[kind];
  const title = TITLES[kind];
  const openVerb = collapsed ? 'Open' : 'Close';

  const chevron =
    edge === 'left'
      ? collapsed
        ? '›'
        : '‹'
      : edge === 'right'
        ? collapsed
          ? '‹'
          : '›'
        : collapsed
          ? '▾'
          : '▴';

  const showChevronFirst = edge === 'left' || edge === 'bottom';

  return (
    <button
      type="button"
      className={`desk-edge-handle${edge === 'bottom' ? ' desk-edge-handle--bottom' : ''}`}
      onClick={onToggle}
      title={`${openVerb} ${title}`}
      aria-expanded={!collapsed}
      aria-label={`${openVerb} ${label}`}
      style={{
        flexShrink: 0,
        display: 'inline-flex',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {showChevronFirst ? <span className="desk-edge-handle__chevron">{chevron}</span> : null}
      <span>{label}</span>
      {!showChevronFirst ? <span className="desk-edge-handle__chevron">{chevron}</span> : null}
      {badge !== undefined && badge > 0 ? (
        <span
          style={{
            fontSize: 9,
            minWidth: 16,
            height: 16,
            lineHeight: '16px',
            textAlign: 'center',
            borderRadius: 8,
            background: `${tokens.accent}44`,
            color: tokens.accent,
            padding: '0 4px',
            fontWeight: 700,
            marginLeft: 2,
          }}
        >
          {badge}
        </span>
      ) : null}
    </button>
  );
}
