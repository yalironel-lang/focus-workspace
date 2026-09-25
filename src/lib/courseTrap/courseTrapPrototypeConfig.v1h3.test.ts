/**
 * V1-H3 — Course Trap default-off + opt-in override.
 */

import { afterEach, describe, expect, it } from 'vitest';
import {
  isCourseTrapAutoSurfaceEnabled,
  isCourseTrapPrototypeEnabled,
  setCourseTrapPrototypeEnabledForTests,
} from './courseTrapPrototypeConfig';

afterEach(() => {
  setCourseTrapPrototypeEnabledForTests(null);
  try {
    localStorage.removeItem('fw_course_trap_auto_surface');
  } catch {
    /* ignore */
  }
});

describe('Course Trap V1-H3 flags', () => {
  it('1. default is OFF', () => {
    setCourseTrapPrototypeEnabledForTests(null);
    expect(isCourseTrapPrototypeEnabled()).toBe(false);
  });

  it('2. opt-in override fw_course_trap_prototype=1 enables', () => {
    setCourseTrapPrototypeEnabledForTests('1');
    expect(isCourseTrapPrototypeEnabled()).toBe(true);
  });

  it('explicit 0 keeps OFF', () => {
    setCourseTrapPrototypeEnabledForTests('0');
    expect(isCourseTrapPrototypeEnabled()).toBe(false);
  });

  it('auto-surface remains opt-in only', () => {
    expect(isCourseTrapAutoSurfaceEnabled()).toBe(false);
    localStorage.setItem('fw_course_trap_auto_surface', '1');
    expect(isCourseTrapAutoSurfaceEnabled()).toBe(true);
  });
});
