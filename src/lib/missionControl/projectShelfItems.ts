/**
 * Shelf (groups/items) resource projection — tasks excluded.
 */

import type { GroupWithItems, Item } from '../../types';
import { missionControlItemId } from './identity';
import type {
  MissionControlItem,
  ShelfItemResourceType,
} from './types';

function parseIsoMs(value: unknown): number | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const t = Date.parse(value);
  return Number.isFinite(t) && t > 0 ? t : null;
}

function domainFromUrl(url: string): string | null {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return host || null;
  } catch {
    return null;
  }
}

function isResourceType(type: Item['type']): type is ShelfItemResourceType {
  return type === 'file' || type === 'link' || type === 'note';
}

export function projectShelfItem(
  sectionId: string,
  item: Item,
  groupTitle?: string,
): MissionControlItem | null {
  if (!item?.id || !isResourceType(item.type)) return null;

  const title = item.title?.trim() || (item.type === 'file' ? 'File' : item.type === 'link' ? 'Link' : 'Note');

  if (item.type === 'file') {
    const hasPath = typeof item.file_path === 'string' && item.file_path.trim().length > 0;
    return {
      id: missionControlItemId('shelf-item', item.id),
      source: 'shelf-item',
      sourceId: item.id,
      sectionId,
      sourceKind: { source: 'shelf-item', type: 'file' },
      category: 'pdf',
      title,
      subtitle: ['Shelf file', groupTitle].filter(Boolean).join(' · ') || 'Shelf file',
      createdAt: parseIsoMs(item.created_at),
      updatedAt: null,
      lastOpenedAt: null,
      preview: { kind: 'icon', icon: 'file' },
      capabilities: {
        open: hasPath,
        showInWorkspace: false,
        rename: true,
        delete: true,
        duplicate: false,
        move: false,
      },
      openAction: hasPath
        ? { type: 'shelf-file', itemId: item.id, filePath: item.file_path!.trim() }
        : { type: 'unavailable' },
      showInWorkspaceAction: { type: 'unavailable' },
      availability: {
        metadata: 'available',
        content: hasPath ? 'unknown' : 'unavailable',
      },
    };
  }

  if (item.type === 'link') {
    const url = typeof item.content === 'string' ? item.content.trim() : '';
    const host = url ? domainFromUrl(url) : null;
    return {
      id: missionControlItemId('shelf-item', item.id),
      source: 'shelf-item',
      sourceId: item.id,
      sectionId,
      sourceKind: { source: 'shelf-item', type: 'link' },
      category: 'link',
      title,
      subtitle: ['Shelf link', host, groupTitle].filter(Boolean).join(' · ') || 'Shelf link',
      createdAt: parseIsoMs(item.created_at),
      updatedAt: null,
      lastOpenedAt: null,
      preview: host
        ? {
            kind: 'favicon',
            url: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`,
          }
        : { kind: 'icon', icon: 'link' },
      capabilities: {
        open: !!url,
        showInWorkspace: false,
        rename: true,
        delete: true,
        duplicate: false,
        move: false,
      },
      openAction: url ? { type: 'external-url', url } : { type: 'unavailable' },
      showInWorkspaceAction: { type: 'unavailable' },
      availability: {
        metadata: 'available',
        content: url ? 'available' : 'unavailable',
      },
    };
  }

  // note
  return {
    id: missionControlItemId('shelf-item', item.id),
    source: 'shelf-item',
    sourceId: item.id,
    sectionId,
    sourceKind: { source: 'shelf-item', type: 'note' },
    category: 'other',
    title,
    subtitle: ['Shelf note', groupTitle].filter(Boolean).join(' · ') || 'Shelf note',
    createdAt: parseIsoMs(item.created_at),
    updatedAt: null,
    lastOpenedAt: null,
    preview: { kind: 'icon', icon: 'note' },
    capabilities: {
      open: false,
      showInWorkspace: false,
      rename: true,
      delete: true,
      duplicate: false,
      move: false,
    },
    openAction: { type: 'unavailable' },
    showInWorkspaceAction: { type: 'unavailable' },
    availability: { metadata: 'available', content: 'available' },
  };
}

export function projectShelfGroups(
  sectionId: string,
  groups: readonly GroupWithItems[],
): MissionControlItem[] {
  const out: MissionControlItem[] = [];
  for (const group of groups) {
    if (!group?.items) continue;
    // Section isolation — never project another section's lanes.
    if (group.section_id && group.section_id !== sectionId) continue;
    for (const item of group.items) {
      const projected = projectShelfItem(sectionId, item, group.title);
      if (projected) out.push(projected);
    }
  }
  return out;
}
