import { describe, expect, it } from 'vitest';
import type { CourseLink } from '../../types';
import { projectCourseLink, projectCourseLinks } from './projectCourseLinks';

function link(partial: Partial<CourseLink> & Pick<CourseLink, 'id'>): CourseLink {
  return {
    user_id: 'u',
    section_id: 'sec',
    label: 'Moodle',
    url: 'https://moodle.example',
    type: 'moodle',
    scope: 'course',
    order_index: 0,
    created_at: '2024-06-01T00:00:00.000Z',
    ...partial,
  };
}

describe('projectCourseLinks', () => {
  it('H: section-scoped course links projected as link', () => {
    const item = projectCourseLink('sec', link({ id: 'cl1' }));
    expect(item?.category).toBe('link');
    expect(item?.sourceKind).toEqual({ source: 'course-link', type: 'moodle' });
    expect(item?.capabilities.showInWorkspace).toBe(false);
    expect(item?.openAction).toEqual({
      type: 'external-url',
      url: 'https://moodle.example',
    });
    expect(item?.updatedAt).toBeNull();
    expect(item?.lastOpenedAt).toBeNull();
  });

  it('skips global and other-section links', () => {
    expect(
      projectCourseLink(
        'sec',
        link({ id: 'g', scope: 'global', section_id: null }),
      ),
    ).toBeNull();
    expect(
      projectCourseLink('sec', link({ id: 'o', section_id: 'other' })),
    ).toBeNull();
  });

  it('batch projects section links only', () => {
    const links: CourseLink[] = [
      link({ id: 'a' }),
      link({ id: 'b', section_id: 'other' }),
    ];
    expect(projectCourseLinks('sec', links)).toHaveLength(1);
  });
});
