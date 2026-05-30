import type { WorkspacePresence } from '../../lib/missionControlMaterials';

export type WorkspaceOrbSize = 'hero' | 'nearby' | 'card';

interface Props {
  accent: string;
  title: string;
  icon?: string | null;
  size?: WorkspaceOrbSize;
  presence?: WorkspacePresence;
  hovered?: boolean;
  className?: string;
}

function initials(title: string): string {
  const parts = title.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return title.slice(0, 2).toUpperCase();
}

const SIZE_PX: Record<WorkspaceOrbSize, number> = {
  hero: 72,
  nearby: 44,
  card: 36,
};

const FONT: Record<WorkspaceOrbSize, number> = {
  hero: 22,
  nearby: 14,
  card: 11,
};

/** Workspace energy core — shell + sphere, restrained glow */
export function WorkspaceOrb({
  accent,
  title,
  icon,
  size = 'card',
  presence = 'present',
  hovered = false,
  className,
}: Props) {
  const px = SIZE_PX[size];
  const dim = presence === 'fading' ? 0.78 : 1;
  const breathe = size === 'hero' || size === 'nearby';

  return (
    <div
      className={`mc-orb mc-orb--${size}${breathe ? ' mc-orb--breathe' : ''}${className ? ` ${className}` : ''}`}
      style={{
        ['--mc-orb-accent' as string]: accent,
        width: px,
        height: px,
        opacity: dim,
        transform: hovered ? 'translateY(-2px)' : undefined,
      }}
      aria-hidden
    >
      <div className="mc-orb__shell" />
      <div className="mc-orb__sphere">
        {icon ? (
          <span className="mc-orb__icon" style={{ fontSize: FONT[size] }} role="img">
            {icon}
          </span>
        ) : (
          <span className="mc-orb__initials" style={{ fontSize: FONT[size] * 0.65 }}>
            {initials(title)}
          </span>
        )}
      </div>
    </div>
  );
}
