import type { FocusMode } from './focusModeTypes';
import type { ProjectObjectType } from '../hooks/useSectionFreeSpaceObjects';
import { coerceFreeSpaceConnectionIds } from '../hooks/useSectionFreeSpaceObjects';

export type FocusTier = 1 | 2 | 3 | 4;

export interface FreeSpaceBlockLite {
  id: string;
  type?: ProjectObjectType | string;
  connections?: string[];
}

function asType(b: FreeSpaceBlockLite): string {
  return typeof b.type === 'string' ? b.type : '';
}

function touchesMistake(block: FreeSpaceBlockLite, mistakeIds: Set<string>): boolean {
  for (const tid of coerceFreeSpaceConnectionIds(block.connections)) {
    if (mistakeIds.has(tid)) return true;
  }
  return false;
}

function connectionDegree(block: FreeSpaceBlockLite): number {
  return coerceFreeSpaceConnectionIds(block.connections).length;
}

/**
 * 1 = primary emphasis … 4 = softened (presentation only).
 */
export function getFocusTier(
  mode: FocusMode,
  block: FreeSpaceBlockLite,
  blocks: FreeSpaceBlockLite[],
  selectedId: string | null,
): FocusTier {
  const t = asType(block) as ProjectObjectType | string;
  const sel = selectedId === block.id;
  const mistakeIds = new Set(blocks.filter(b => asType(b) === 'mistake').map(b => b.id));

  let tier: FocusTier = 3;

  switch (mode) {
    case 'review': {
      if (t === 'mistake') tier = 1;
      else if (touchesMistake(block, mistakeIds)) tier = 2;
      else if (t === 'notebook' || t === 'note') tier = 3;
      else tier = 4;
      break;
    }
    case 'reading': {
      if (t === 'pdf') tier = 1;
      else if (t === 'notebook') tier = 2;
      else if (t === 'note' || t === 'link') tier = 3;
      else tier = 4;
      break;
    }
    case 'solving': {
      if (t === 'calculator' || t === 'graph') tier = 1;
      else if (t === 'notebook' || t === 'note') tier = 2;
      else if (t === 'mistake' || t === 'checklist') tier = 3;
      else tier = 4;
      break;
    }
    case 'thinking': {
      const deg = connectionDegree(block);
      if (deg >= 2) tier = 1;
      else if (deg === 1) tier = 2;
      else if (t === 'notebook') tier = 3;
      else tier = 4;
      break;
    }
    default:
      tier = 3;
  }

  if (sel && tier > 2) tier = 2;
  return tier;
}

export interface FocusObjectPresentation {
  opacityMul: number;
  scale: number;
  filterExtra: string;
  zIndexBoost: number;
}

export function tierToPresentation(tier: FocusTier): FocusObjectPresentation {
  switch (tier) {
    case 1:
      return { opacityMul: 1, scale: 1.006, filterExtra: 'saturate(1.03) brightness(1.02)', zIndexBoost: 1 };
    case 2:
      return { opacityMul: 0.96, scale: 1.002, filterExtra: 'saturate(0.99) brightness(0.99)', zIndexBoost: 0 };
    case 3:
      return { opacityMul: 0.82, scale: 0.998, filterExtra: 'saturate(0.9) brightness(0.93)', zIndexBoost: 0 };
    default:
      return { opacityMul: 0.62, scale: 0.994, filterExtra: 'saturate(0.78) brightness(0.87)', zIndexBoost: 0 };
  }
}
