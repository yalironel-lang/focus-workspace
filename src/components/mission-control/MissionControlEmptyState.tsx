import {
  missionControlFilterLabel,
  type MissionControlFilterCategory,
} from '../../lib/missionControl/filterMissionControlItems';

type Props = {
  kind: 'true-empty' | 'search' | 'filter' | 'offline';
  query?: string;
  category?: MissionControlFilterCategory;
  onOpenWorkspace?: () => void;
};

export function MissionControlEmptyState({ kind, query, category, onOpenWorkspace }: Props) {
  if (kind === 'true-empty') {
    return (
      <div className="mc-empty" data-testid="mc-empty-true">
        <h2>Nothing here yet.</h2>
        <p>Add something in Workspace to get started.</p>
        {onOpenWorkspace && (
          <button type="button" className="mc-empty-cta" onClick={onOpenWorkspace}>
            Open Workspace
          </button>
        )}
      </div>
    );
  }

  if (kind === 'search') {
    return (
      <div className="mc-empty" data-testid="mc-empty-search">
        <h2>{`No matches for ‘${query ?? ''}’`}</h2>
      </div>
    );
  }

  if (kind === 'offline') {
    return (
      <div className="mc-empty" data-testid="mc-empty-offline">
        <h2>No cached items available offline.</h2>
      </div>
    );
  }

  const label =
    category && category !== 'all'
      ? missionControlFilterLabel(category)
      : 'items';
  return (
    <div className="mc-empty" data-testid="mc-empty-filter">
      <h2>{`No ${label} in this section.`}</h2>
    </div>
  );
}
