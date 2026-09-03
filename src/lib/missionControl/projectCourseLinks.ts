/**
 * Section-scoped course_links → MissionControlItem (category link).
 */

import type { CourseLink, CourseLinkType } from '../../types';
import { missionControlItemId } from './identity';
import type { MissionControlItem } from './types';

const COURSE_LINK_TYPES = new Set<CourseLinkType>([
  'moodle',
  'netpa',
  'drive',
  'chatgpt',
  'whatsapp',
  'email',
  'zoom',
  'teams',
  'github',
  'custom',
]);

function parseIsoMs(value: unknown): number | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const t = Date.parse(value);
  return Number.isFinite(t) && t > 0 ? t : null;
}

function domainFromUrl(url: string): string | null {
  try {
    if (url.startsWith('mailto:')) return url.slice('mailto:'.length) || null;
    const host = new URL(url).hostname.replace(/^www\./, '');
    return host || null;
  } catch {
    return null;
  }
}

function coerceLinkType(raw: unknown): CourseLinkType {
  if (typeof raw === 'string' && COURSE_LINK_TYPES.has(raw as CourseLinkType)) {
    return raw as CourseLinkType;
  }
  return 'custom';
}

export function projectCourseLink(
  sectionId: string,
  link: CourseLink,
): MissionControlItem | null {
  if (!link?.id) return null;
  // Section-scoped only for this Section's Everything index.
  if (link.section_id !== sectionId) return null;
  if (link.scope === 'global') return null;

  const url = typeof link.url === 'string' ? link.url.trim() : '';
  const title = link.label?.trim() || url || 'Link';
  const kind = coerceLinkType(link.type);
  const host = url ? domainFromUrl(url) : null;

  return {
    id: missionControlItemId('course-link', link.id),
    source: 'course-link',
    sourceId: link.id,
    sectionId,
    sourceKind: { source: 'course-link', type: kind },
    category: 'link',
    title,
    subtitle: ['Course link', kind, host].filter(Boolean).join(' · '),
    createdAt: parseIsoMs(link.created_at),
    updatedAt: null,
    lastOpenedAt: null,
    preview: host && !url.startsWith('mailto:')
      ? {
          kind: 'favicon',
          url: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`,
        }
      : { kind: 'icon', icon: kind },
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

export function projectCourseLinks(
  sectionId: string,
  links: readonly CourseLink[],
): MissionControlItem[] {
  const out: MissionControlItem[] = [];
  for (const link of links) {
    const item = projectCourseLink(sectionId, link);
    if (item) out.push(item);
  }
  return out;
}
