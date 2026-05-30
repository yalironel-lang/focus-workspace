import { getWorkspaceCustomization } from '../../hooks/useWorkspaceCustomization';
import type { SectionWithProgress } from '../../types';
import { presenceFromOpenedAt, type WorkspacePresence } from '../../lib/missionControlMaterials';

const ACCENT_POOL = ['#6366f1', '#8b5cf6', '#f59e0b', '#3b82f6', '#a78bfa', '#06b6d4'];

function accentForTitle(title: string): string {
  return ACCENT_POOL[[...title].reduce((a, c) => a + c.charCodeAt(0), 0) % ACCENT_POOL.length];
}

export interface LivingWorkspaceObjectProps {
  section: SectionWithProgress;
  openedAt?: string;
  onOpen: () => void;
  settleDelay?: number;
  staggerIndex?: number;
}

/** Grounded workspace mass emerging from darkness */
export function LivingWorkspaceObject({
  section,
  openedAt,
  onOpen,
  settleDelay = 0,
  staggerIndex = 0,
}: LivingWorkspaceObjectProps) {
  const custom = getWorkspaceCustomization(section.id);
  const accent = custom.accent || accentForTitle(section.title);
  const presence: WorkspacePresence = presenceFromOpenedAt(openedAt);
  const trace = section.next_item_title?.trim() || (section.exam_date ? 'Course workspace' : 'Study space');

  return (
    <button
      type="button"
      className={`mc-world mc-settle mc-world--${presence}`}
      data-stagger={staggerIndex}
      style={{
        ['--mc-world-accent' as string]: accent,
        animationDelay: settleDelay ? `${Math.min(settleDelay, 80)}ms` : undefined,
      }}
      onClick={onOpen}
      aria-label={`Open ${section.title}`}
    >
      <div className="mc-world__pool" aria-hidden />
      <div className="mc-world__mass">
        <div className="mc-world__highlight" aria-hidden />
        {custom.icon && (
          <span className="mc-world__icon" role="img" aria-hidden>
            {custom.icon}
          </span>
        )}
        <p className="mc-world__title">{section.title}</p>
        <p className="mc-world__trace">{trace}</p>
      </div>
    </button>
  );
}
