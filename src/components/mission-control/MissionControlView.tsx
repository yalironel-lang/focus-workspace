/**
 * Mission Control V2 Phase 2 — Everything explorer host.
 * Legacy Next/Active/Fading discovery UI removed from presentation.
 */

import type { ReactNode } from 'react';
import type { MissionControlItem } from '../../lib/missionControl/types';
import type { MissionControlIndexCompleteness } from '../../lib/missionControl/types';
import { MissionControlEverything } from './MissionControlEverything';

export type MissionControlViewProps = {
  sectionTitle: string;
  sectionIcon?: string | null;
  items: MissionControlItem[];
  completeness: MissionControlIndexCompleteness;
  status: 'loading' | 'ready' | 'error';
  onOpenItem: (item: MissionControlItem) => void;
  onShowInWorkspace: (item: MissionControlItem) => void;
  onOpenWorkspace: () => void;
  setupSlot?: ReactNode;
  customizeButton?: ReactNode;
};

export function MissionControlView({
  sectionTitle,
  sectionIcon,
  items,
  completeness,
  status,
  onOpenItem,
  onShowInWorkspace,
  onOpenWorkspace,
  setupSlot,
  customizeButton,
}: MissionControlViewProps) {
  return (
    <MissionControlEverything
      sectionTitle={sectionTitle}
      sectionIcon={sectionIcon}
      items={items}
      completeness={completeness}
      status={status}
      onOpenItem={onOpenItem}
      onShowInWorkspace={onShowInWorkspace}
      onOpenWorkspace={onOpenWorkspace}
      setupSlot={setupSlot}
      customizeButton={customizeButton}
    />
  );
}
