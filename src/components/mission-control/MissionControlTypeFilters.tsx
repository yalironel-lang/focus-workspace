import {
  MISSION_CONTROL_FILTER_ORDER,
  missionControlFilterLabel,
  type MissionControlFilterCategory,
} from '../../lib/missionControl/filterMissionControlItems';

type Props = {
  category: MissionControlFilterCategory;
  counts: Record<MissionControlFilterCategory, number>;
  onChange: (category: MissionControlFilterCategory) => void;
};

export function MissionControlTypeFilters({ category, counts, onChange }: Props) {
  return (
    <div className="mc-filters" role="toolbar" aria-label="Filter by type">
      {MISSION_CONTROL_FILTER_ORDER.map(cat => {
        const pressed = category === cat;
        const label = missionControlFilterLabel(cat);
        const count = counts[cat] ?? 0;
        return (
          <button
            key={cat}
            type="button"
            className="mc-filter-chip"
            aria-pressed={pressed}
            onClick={() => onChange(cat)}
            data-testid={`mc-filter-${cat}`}
          >
            {label}
            <span style={{ marginLeft: 6, opacity: 0.7 }}>{count}</span>
          </button>
        );
      })}
    </div>
  );
}
