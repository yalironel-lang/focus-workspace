import type { MissionControlItem } from '../../lib/missionControl/types';
import { MissionControlResourceRow } from './MissionControlResourceRow';

type Props = {
  items: MissionControlItem[];
  menuItemId: string | null;
  onMenuItemIdChange: (id: string | null) => void;
  onOpen: (item: MissionControlItem) => void;
  onShowInWorkspace: (item: MissionControlItem) => void;
  now?: number;
};

export function MissionControlResourceList({
  items,
  menuItemId,
  onMenuItemIdChange,
  onOpen,
  onShowInWorkspace,
  now,
}: Props) {
  return (
    <ul className="mc-list" data-testid="mc-resource-list">
      {items.map(item => (
        <MissionControlResourceRow
          key={item.id}
          item={item}
          menuOpen={menuItemId === item.id}
          onMenuOpenChange={open => onMenuItemIdChange(open ? item.id : null)}
          onOpen={onOpen}
          onShowInWorkspace={onShowInWorkspace}
          now={now}
        />
      ))}
    </ul>
  );
}
