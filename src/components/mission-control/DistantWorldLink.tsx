import type { SectionWithProgress } from '../../types';
import { presenceFromOpenedAt } from '../../lib/missionControlMaterials';

interface Props {
  section: SectionWithProgress;
  openedAt?: string;
  onOpen: () => void;
}

/** Small distant world — typographic link, not a card */
export function DistantWorldLink({ section, openedAt, onOpen }: Props) {
  const presence = presenceFromOpenedAt(openedAt);

  return (
    <button
      type="button"
      className={`mc-distant-world mc-distant-world--${presence}`}
      onClick={onOpen}
    >
      {section.title}
    </button>
  );
}
