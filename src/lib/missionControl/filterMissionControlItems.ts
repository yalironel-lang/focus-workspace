import type { MissionControlCategory, MissionControlItem } from './types';

export type MissionControlFilterCategory = 'all' | MissionControlCategory;

const CATEGORY_LABELS: Record<MissionControlCategory, string> = {
  pdf: 'PDFs',
  notebook: 'Notebooks',
  sheet: 'Sheets',
  image: 'Images',
  link: 'Links',
  other: 'Other',
};

export const MISSION_CONTROL_FILTER_ORDER: MissionControlFilterCategory[] = [
  'all',
  'pdf',
  'notebook',
  'sheet',
  'image',
  'link',
  'other',
];

export function missionControlFilterLabel(cat: MissionControlFilterCategory): string {
  if (cat === 'all') return 'All';
  return CATEGORY_LABELS[cat];
}

export function normalizeMissionControlQuery(query: string): string {
  return query.trim().replace(/\s+/g, ' ').toLowerCase();
}

function itemSearchHaystack(item: MissionControlItem): string {
  const parts: string[] = [
    item.title,
    item.subtitle ?? '',
    item.category,
    item.sourceKind.type,
    item.source,
  ];
  if (item.openAction.type === 'external-url') {
    parts.push(item.openAction.url);
    try {
      parts.push(new URL(item.openAction.url).hostname);
    } catch {
      /* ignore */
    }
  }
  return parts.join(' ').toLowerCase();
}

export function filterMissionControlItems(
  items: readonly MissionControlItem[],
  opts: { query?: string; category?: MissionControlFilterCategory },
): MissionControlItem[] {
  const q = normalizeMissionControlQuery(opts.query ?? '');
  const category = opts.category ?? 'all';

  return items.filter(item => {
    if (category !== 'all' && item.category !== category) return false;
    if (!q) return true;
    return itemSearchHaystack(item).includes(q);
  });
}

/** Counts per category for the current search query (category filter ignored). */
export function countMissionControlByCategory(
  items: readonly MissionControlItem[],
  query = '',
): Record<MissionControlFilterCategory, number> {
  const searched = filterMissionControlItems(items, { query, category: 'all' });
  const counts: Record<MissionControlFilterCategory, number> = {
    all: searched.length,
    pdf: 0,
    notebook: 0,
    sheet: 0,
    image: 0,
    link: 0,
    other: 0,
  };
  for (const item of searched) {
    counts[item.category] += 1;
  }
  return counts;
}
