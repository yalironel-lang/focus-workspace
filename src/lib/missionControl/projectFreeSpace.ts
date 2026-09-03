/**
 * Free Space → MissionControlItem projection.
 */

import type {
  ProjectObjectType,
  ProjectSpaceObject,
} from '../../hooks/useSectionFreeSpaceObjects';
import { missionControlItemId } from './identity';
import type { FreeSpaceIndexEntry } from './loadSectionFreeSpaceIndexSource';
import type {
  MissionControlAvailability,
  MissionControlCapabilities,
  MissionControlCategory,
  MissionControlItem,
  MissionControlOpenAction,
  MissionControlPreview,
  MissionControlRelatedRef,
  MissionControlShowInWorkspaceAction,
} from './types';

const HIDDEN_TYPES = new Set<ProjectObjectType>([
  'calculator',
  'graph',
  'companion',
]);

function safeMs(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return value;
}

function domainFromUrl(url: string): string | null {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return host || null;
  } catch {
    return null;
  }
}

function categoryForFreeSpace(object: ProjectSpaceObject): MissionControlCategory | null {
  switch (object.type) {
    case 'pdf':
      return 'pdf';
    case 'notebook':
      return 'notebook';
    case 'sheet':
      return 'sheet';
    case 'image':
      return 'image';
    case 'link':
      return 'link';
    case 'studyfile':
      if (object.content.type === 'studyfile' && object.content.fileKind === 'pdf') {
        return 'pdf';
      }
      if (
        object.content.type === 'studyfile' &&
        (object.content.fileKind === 'web' ||
          object.content.fileKind === 'google-doc' ||
          object.content.fileKind === 'google-sheet' ||
          object.content.fileKind === 'google-slides') &&
        object.content.externalUrl
      ) {
        return 'link';
      }
      return 'other';
    case 'note':
    case 'mistake':
    case 'checklist':
      return 'other';
    case 'calculator':
    case 'graph':
    case 'companion':
      return null;
    default:
      return null;
  }
}

function titleFor(object: ProjectSpaceObject): string {
  const t = object.title?.trim();
  if (t) return t;
  const c = object.content;
  if (c.type === 'pdf') return c.documentTitle?.trim() || c.fileName?.trim() || 'PDF';
  if (c.type === 'studyfile') return c.fileName?.trim() || 'Study file';
  if (c.type === 'link') return c.title?.trim() || c.url || 'Link';
  if (c.type === 'image') return c.fileName?.trim() || c.alt?.trim() || 'Image';
  return object.type;
}

function subtitleFor(object: ProjectSpaceObject, category: MissionControlCategory): string | null {
  const c = object.content;
  const parts: string[] = [];
  if (category === 'pdf' && c.type === 'pdf') {
    parts.push('PDF');
    if (c.page > 1) parts.push(`page ${c.page}`);
    if (c.fileName && c.fileName !== object.title) parts.push(c.fileName);
  } else if (c.type === 'notebook') {
    parts.push('Notebook');
    if (c.subtitle?.trim()) parts.push(c.subtitle.trim());
  } else if (c.type === 'sheet') {
    parts.push('Sheet');
  } else if (c.type === 'image') {
    parts.push('Image');
  } else if (c.type === 'link') {
    parts.push('Link');
    const host = domainFromUrl(c.url);
    if (host) parts.push(host);
  } else if (c.type === 'note') {
    parts.push('Note');
  } else if (c.type === 'mistake') {
    parts.push(c.variant === 'recall' ? 'Recall' : 'Mistake');
  } else if (c.type === 'checklist') {
    parts.push('Checklist');
  } else if (c.type === 'studyfile') {
    parts.push('Study file');
    if (c.fileName) parts.push(c.fileName);
  }
  return parts.length ? parts.join(' · ') : null;
}

function lastOpenedAtFor(object: ProjectSpaceObject): number | null {
  const c = object.content;
  if (c.type === 'pdf' || c.type === 'studyfile' || c.type === 'companion') {
    return safeMs(c.lastOpenedAt);
  }
  return null;
}

function previewFor(
  sectionId: string,
  object: ProjectSpaceObject,
): MissionControlPreview {
  const c = object.content;
  if (c.type === 'pdf' && c.thumbnailDataUrl) {
    return {
      kind: 'thumbnail',
      source: 'freespace-pdf-thumb',
      objectId: object.id,
      sectionId,
      dataUrl: c.thumbnailDataUrl,
    };
  }
  if (c.type === 'pdf') {
    return {
      kind: 'thumbnail',
      source: 'freespace-pdf-thumb',
      objectId: object.id,
      sectionId,
    };
  }
  if (c.type === 'image') {
    return {
      kind: 'thumbnail',
      source: 'freespace-image',
      objectId: object.id,
      sectionId,
      ...(c.url ? { dataUrl: c.url } : {}),
    };
  }
  if (c.type === 'link' && c.url) {
    const host = domainFromUrl(c.url);
    if (host) {
      return {
        kind: 'favicon',
        url: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`,
      };
    }
  }
  return { kind: 'icon', icon: object.type };
}

function availabilityFor(object: ProjectSpaceObject): MissionControlAvailability {
  const c = object.content;
  if (c.type === 'pdf' || c.type === 'image') {
    return { metadata: 'available', content: 'unknown' };
  }
  if (c.type === 'studyfile') {
    if (c.externalUrl) return { metadata: 'available', content: 'available' };
    return { metadata: 'available', content: 'unknown' };
  }
  if (c.type === 'link') {
    return {
      metadata: 'available',
      content: c.url?.trim() ? 'available' : 'unavailable',
    };
  }
  return { metadata: 'available', content: 'available' };
}

function relatedRefsFor(object: ProjectSpaceObject): MissionControlRelatedRef[] | undefined {
  const refs: MissionControlRelatedRef[] = [];
  const c = object.content;
  if (c.type === 'mistake') {
    if (c.sourceObjectId) refs.push({ kind: 'freespace', id: c.sourceObjectId });
    if (c.anchorObjectId) refs.push({ kind: 'freespace', id: c.anchorObjectId });
  }
  if (c.type === 'notebook' && Array.isArray(c.pages)) {
    for (const page of c.pages) {
      if (typeof page.linkedPdfObjectId === 'string' && page.linkedPdfObjectId.trim()) {
        refs.push({ kind: 'freespace', id: page.linkedPdfObjectId.trim() });
      }
    }
  }
  return refs.length ? refs : undefined;
}

/**
 * studyfile is indexed but not openable/showable — renderer has no case.
 * All other included types support spatial focus.
 */
function capabilitiesAndActions(
  object: ProjectSpaceObject,
  boardId: string,
): {
  capabilities: MissionControlCapabilities;
  openAction: MissionControlOpenAction;
  showInWorkspaceAction: MissionControlShowInWorkspaceAction;
} {
  if (object.type === 'studyfile') {
    return {
      capabilities: {
        open: false,
        showInWorkspace: false,
        rename: true,
        delete: true,
        duplicate: true,
        move: false,
      },
      openAction: { type: 'unavailable' },
      showInWorkspaceAction: { type: 'unavailable' },
    };
  }

  const focus = {
    type: 'freespace-focus' as const,
    objectId: object.id,
    boardId,
  };

  if (object.type === 'link' && object.content.type === 'link' && object.content.url?.trim()) {
    return {
      capabilities: {
        open: true,
        showInWorkspace: true,
        rename: true,
        delete: true,
        duplicate: true,
        move: false,
      },
      openAction: { type: 'external-url', url: object.content.url.trim() },
      showInWorkspaceAction: focus,
    };
  }

  return {
    capabilities: {
      open: true,
      showInWorkspace: true,
      rename: true,
      delete: true,
      duplicate: true,
      move: false,
    },
    openAction: focus,
    showInWorkspaceAction: focus,
  };
}

export function projectFreeSpaceEntry(
  sectionId: string,
  entry: FreeSpaceIndexEntry,
): MissionControlItem | null {
  const { object, boardId } = entry;
  if (!object?.id || HIDDEN_TYPES.has(object.type)) return null;
  const category = categoryForFreeSpace(object);
  if (!category) return null;

  const { capabilities, openAction, showInWorkspaceAction } = capabilitiesAndActions(
    object,
    boardId,
  );
  const relatedRefs = relatedRefsFor(object);

  return {
    id: missionControlItemId('freespace', object.id),
    source: 'freespace',
    sourceId: object.id,
    sectionId,
    sourceKind: { source: 'freespace', type: object.type },
    category,
    title: titleFor(object),
    subtitle: subtitleFor(object, category),
    createdAt: safeMs(object.createdAt),
    updatedAt: safeMs(object.updatedAt),
    lastOpenedAt: lastOpenedAtFor(object),
    preview: previewFor(sectionId, object),
    capabilities,
    openAction,
    showInWorkspaceAction,
    availability: availabilityFor(object),
    ...(relatedRefs ? { relatedRefs } : {}),
    boardId,
  };
}

export function projectFreeSpaceEntries(
  sectionId: string,
  entries: readonly FreeSpaceIndexEntry[],
): MissionControlItem[] {
  const out: MissionControlItem[] = [];
  for (const entry of entries) {
    const item = projectFreeSpaceEntry(sectionId, entry);
    if (item) out.push(item);
  }
  return out;
}
