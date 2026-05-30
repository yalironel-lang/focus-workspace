import { getWorkspaceCustomization } from '../../hooks/useWorkspaceCustomization';
import type { SectionWithProgress } from '../../types';
import { presenceFromOpenedAt } from '../../lib/missionControlMaterials';
import { useLibrarySpatial } from '../workspace-library/spatial/LibrarySpatialContext';
import { WorkspaceOrb } from './WorkspaceOrb';

const ACCENT_POOL = ['#6366f1', '#8b5cf6', '#f59e0b', '#3b82f6', '#a78bfa', '#06b6d4'];

function accentForTitle(title: string): string {
  return ACCENT_POOL[[...title].reduce((a, c) => a + c.charCodeAt(0), 0) % ACCENT_POOL.length];
}

interface Props {
  section: SectionWithProgress;
  openedAt?: string;
  onOpen: () => void;
  staggerIndex?: number;
}

/** Nearby workspace as orb + label on shared plinth */
export function NearbyWorldOrb({ section, openedAt, onOpen, staggerIndex = 0 }: Props) {
  const { setFocusRegion } = useLibrarySpatial();
  const custom = getWorkspaceCustomization(section.id);
  const accent = custom.accent || accentForTitle(section.title);
  const presence = presenceFromOpenedAt(openedAt);

  return (
    <button
      type="button"
      className={`mc-nearby mc-nearby--${presence}`}
      data-stagger={staggerIndex}
      onClick={onOpen}
      onPointerEnter={() => setFocusRegion('field')}
      onPointerLeave={() => setFocusRegion(null)}
    >
      <WorkspaceOrb
        accent={accent}
        title={section.title}
        icon={custom.icon}
        size="nearby"
        presence={presence}
      />
      <span className="mc-nearby__label">{section.title}</span>
    </button>
  );
}
