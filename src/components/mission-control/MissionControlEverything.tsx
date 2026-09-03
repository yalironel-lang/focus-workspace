import { useMemo, useState, type ReactNode } from 'react';
import type { MissionControlItem } from '../../lib/missionControl/types';
import type { MissionControlIndexCompleteness } from '../../lib/missionControl/types';
import {
  countMissionControlByCategory,
  filterMissionControlItems,
  type MissionControlFilterCategory,
} from '../../lib/missionControl/filterMissionControlItems';
import { MissionControlSearch } from './MissionControlSearch';
import { MissionControlTypeFilters } from './MissionControlTypeFilters';
import { MissionControlResourceList } from './MissionControlResourceList';
import { MissionControlEmptyState } from './MissionControlEmptyState';
import './missionControlExplorer.css';

export type MissionControlEverythingProps = {
  sectionTitle: string;
  sectionIcon?: string | null;
  items: MissionControlItem[];
  completeness: MissionControlIndexCompleteness;
  status: 'loading' | 'ready' | 'error';
  onOpenItem: (item: MissionControlItem) => void;
  onShowInWorkspace: (item: MissionControlItem) => void;
  onOpenWorkspace: () => void;
  /** Secondary recessed setup (exam / capture / links / shelf add). */
  setupSlot?: ReactNode;
  customizeButton?: ReactNode;
  now?: number;
};

export function MissionControlEverything({
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
  now,
}: MissionControlEverythingProps) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<MissionControlFilterCategory>('all');
  const [menuItemId, setMenuItemId] = useState<string | null>(null);

  const counts = useMemo(
    () => countMissionControlByCategory(items, query),
    [items, query],
  );

  const filtered = useMemo(
    () => filterMissionControlItems(items, { query, category }),
    [items, query, category],
  );

  const trimmedQuery = query.trim();
  const loadingZero =
    (completeness === 'loading' || status === 'loading') && items.length === 0;
  const showUpdating =
    items.length > 0 &&
    (completeness === 'loading' || completeness === 'partial' || status === 'loading');
  const showLocalOnly =
    completeness === 'local-only' || status === 'error';

  let body: ReactNode;
  if (loadingZero) {
    body = (
      <div data-testid="mc-skeleton">
        <div className="mc-skeleton" />
        <div className="mc-skeleton" />
        <div className="mc-skeleton" />
        <div className="mc-skeleton" />
      </div>
    );
  } else if (filtered.length === 0) {
    if (items.length === 0 && showLocalOnly) {
      body = <MissionControlEmptyState kind="offline" />;
    } else if (items.length === 0) {
      body = (
        <MissionControlEmptyState kind="true-empty" onOpenWorkspace={onOpenWorkspace} />
      );
    } else if (trimmedQuery) {
      body = <MissionControlEmptyState kind="search" query={trimmedQuery} />;
    } else {
      body = <MissionControlEmptyState kind="filter" category={category} />;
    }
  } else {
    body = (
      <MissionControlResourceList
        items={filtered}
        menuItemId={menuItemId}
        onMenuItemIdChange={setMenuItemId}
        onOpen={onOpenItem}
        onShowInWorkspace={onShowInWorkspace}
        now={now}
      />
    );
  }

  return (
    <div className="mc-explorer" data-testid="mc-everything">
      <div className="mc-explorer-inner">
        <div className="mc-explorer-title-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            {sectionIcon ? (
              <span style={{ fontSize: 15, lineHeight: 1 }} role="img">
                {sectionIcon}
              </span>
            ) : null}
            <h1 className="mc-explorer-title">{sectionTitle}</h1>
          </div>
          {customizeButton}
        </div>

        <MissionControlSearch value={query} onChange={setQuery} />
        <MissionControlTypeFilters
          category={category}
          counts={counts}
          onChange={setCategory}
        />

        {showUpdating && <p className="mc-explorer-status">Updating…</p>}
        {showLocalOnly && items.length > 0 && (
          <p className="mc-explorer-status">
            Showing cached items — may be incomplete offline
          </p>
        )}

        {body}

        {setupSlot}
      </div>
    </div>
  );
}
