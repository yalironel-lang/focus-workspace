import { memo } from 'react';
import type { MissionControlItem } from '../../lib/missionControl/types';
import { formatMissionControlTime } from '../../lib/missionControl/formatMissionControlTime';
import { shouldOfferShowInWorkspace } from '../../lib/missionControl/shouldOfferShowInWorkspace';
import {
  MissionControlResourcePreview,
  contextLabelForItem,
} from './MissionControlResourcePreview';
import { MissionControlResourceMenu } from './MissionControlResourceMenu';

type Props = {
  item: MissionControlItem;
  menuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
  onOpen: (item: MissionControlItem) => void;
  onShowInWorkspace: (item: MissionControlItem) => void;
  now?: number;
};

function MissionControlResourceRowInner({
  item,
  menuOpen,
  onMenuOpenChange,
  onOpen,
  onShowInWorkspace,
  now = Date.now(),
}: Props) {
  const canOpen = item.capabilities.open && item.openAction.type !== 'unavailable';
  const offerShow = shouldOfferShowInWorkspace(item);
  const time = formatMissionControlTime(item, now);
  const metaBits = [contextLabelForItem(item), item.subtitle].filter(Boolean);

  return (
    <li>
      <div
        className="mc-row"
        data-disabled={!canOpen ? 'true' : undefined}
        role={canOpen ? 'button' : undefined}
        tabIndex={canOpen ? 0 : undefined}
        aria-disabled={!canOpen || undefined}
        title={item.title}
        onClick={() => {
          if (canOpen) onOpen(item);
        }}
        onKeyDown={e => {
          if (!canOpen) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onOpen(item);
          }
        }}
      >
        <MissionControlResourcePreview item={item} />
        <div className="mc-row-body">
          <p className="mc-row-title">{item.title}</p>
          <p className="mc-row-meta">{metaBits.join(' · ')}</p>
        </div>
        {time && <span className="mc-row-time">{time}</span>}
        {offerShow && (
          <MissionControlResourceMenu
            open={menuOpen}
            onOpenChange={onMenuOpenChange}
            onShowInWorkspace={() => onShowInWorkspace(item)}
          />
        )}
      </div>
    </li>
  );
}

export const MissionControlResourceRow = memo(MissionControlResourceRowInner);
