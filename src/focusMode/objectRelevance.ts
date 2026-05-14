import type { FocusMode } from './focusModeTypes';
import type { ProjectObjectType } from '../hooks/useSectionFreeSpaceObjects';
import { coerceFreeSpaceConnectionIds } from '../hooks/useSectionFreeSpaceObjects';
import { getCompanionKind } from '../lib/companionPanels';

export type FocusTier = 1 | 2 | 3 | 4;

export interface FreeSpaceBlockLite {
  id: string;
  type?: ProjectObjectType | string;
  title?: string;
  content?: unknown;
  connections?: string[];
}

function asType(b: FreeSpaceBlockLite): string {
  return typeof b.type === 'string' ? b.type : '';
}

function undirectedNeighborIds(block: FreeSpaceBlockLite, blocks: FreeSpaceBlockLite[]): Set<string> {
  const out = new Set<string>(coerceFreeSpaceConnectionIds(block.connections));
  for (const other of blocks) {
    if (other.id === block.id) continue;
    if (coerceFreeSpaceConnectionIds(other.connections).includes(block.id)) out.add(other.id);
  }
  return out;
}

function touchesMistake(block: FreeSpaceBlockLite, blocks: FreeSpaceBlockLite[], mistakeIds: Set<string>): boolean {
  for (const tid of undirectedNeighborIds(block, blocks)) {
    if (mistakeIds.has(tid)) return true;
  }
  return false;
}

function connectionDegree(block: FreeSpaceBlockLite, blocks: FreeSpaceBlockLite[]): number {
  return undirectedNeighborIds(block, blocks).size;
}

function companionKind(block: FreeSpaceBlockLite) {
  if (asType(block) !== 'companion') return null;
  const raw = block.content;
  const content = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
  const url = typeof content?.url === 'string' ? content.url : '';
  const title = typeof content?.title === 'string' ? content.title : block.title;
  const description = typeof content?.description === 'string' ? content.description : '';
  return getCompanionKind(url, title, description);
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
      else if (touchesMistake(block, blocks, mistakeIds)) tier = 2;
      else if (t === 'notebook' || t === 'note') tier = 3;
      else tier = 4;
      break;
    }
    case 'reading': {
      if (t === 'pdf') tier = 1;
      else if (t === 'notebook') tier = 2;
      else if (t === 'companion') {
        const kind = companionKind(block);
        tier = kind === 'research' || kind === 'video' || kind === 'docs' ? 2 : 4;
      } else if (t === 'note' || t === 'link') tier = 3;
      else tier = 4;
      break;
    }
    case 'solving': {
      if (t === 'calculator' || t === 'graph') tier = 1;
      else if (t === 'companion' && companionKind(block) === 'math') tier = 1;
      else if (t === 'notebook' || t === 'note') tier = 2;
      else if (t === 'mistake' || t === 'checklist') tier = 3;
      else tier = 4;
      break;
    }
    case 'thinking': {
      const deg = connectionDegree(block, blocks);
      if (deg >= 2) tier = 1;
      else if (deg === 1) tier = 2;
      else if (t === 'companion') {
        const kind = companionKind(block);
        tier = kind === 'ai' || kind === 'research' || kind === 'docs' ? 2 : 4;
      }
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
      return { opacityMul: 1, scale: 1.005, filterExtra: 'saturate(1.03) brightness(1.025)', zIndexBoost: 1 };
    case 2:
      return { opacityMul: 0.98, scale: 1.002, filterExtra: 'saturate(1) brightness(1)', zIndexBoost: 0 };
    case 3:
      return { opacityMul: 0.9, scale: 0.999, filterExtra: 'saturate(0.95) brightness(0.97)', zIndexBoost: 0 };
    default:
      return { opacityMul: 0.78, scale: 0.997, filterExtra: 'saturate(0.88) brightness(0.94)', zIndexBoost: 0 };
  }
}
