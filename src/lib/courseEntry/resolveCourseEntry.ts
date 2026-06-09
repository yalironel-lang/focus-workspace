import type { ProjectSpaceObject } from '../../hooks/useSectionFreeSpaceObjects';
import {
  deriveMissionControlSections,
  type NextItem,
} from '../deriveMissionControlSections';
import type { StudySessionRecord } from '../studySession/types';
import type { CourseEntryDecision, CourseEntryProfile } from './types';

export const COURSE_ENTRY_WARM_WINDOW_MS = 4 * 60 * 60 * 1000;

export type ResolveCourseEntryInput = {
  now: number;
  firstArrival: boolean;
  objects: ProjectSpaceObject[];
  studySessionPrimary: boolean;
  mostRecentSession: StudySessionRecord | null;
  hasActiveStudySession: boolean;
  examDays: number | null;
  restorableNextSourceId: string | null;
};

function examSuffix(examDays: number | null): string | undefined {
  if (examDays == null || examDays < 0 || examDays > 14) return undefined;
  if (examDays === 0) return 'Exam today';
  return `Exam ${examDays}d`;
}

function profileForNext(_next: NextItem, examDays: number | null): CourseEntryProfile {
  const suffix = examSuffix(examDays);
  return suffix != null ? 'exam' : 'cold';
}

function stripFromNext(
  next: NextItem,
  profile: CourseEntryProfile,
  examDays: number | null,
  restorableNextSourceId: string | null,
): CourseEntryDecision {
  const suffix = examSuffix(examDays);
  const secondary = [next.sublabel, suffix].filter(Boolean).join(' · ') || suffix;
  const isPdf = next.object.type === 'pdf';
  const canRestore = isPdf && restorableNextSourceId === next.object.id;

  return {
    kind: 'strip',
    profile,
    primaryLabel: next.label,
    secondaryLabel: secondary || undefined,
    buttonLabel: canRestore ? 'Continue studying' : 'Open',
    action: canRestore ? 'restore_session' : 'focus',
    focusObjectId: next.object.id,
    sessionSourceId: canRestore ? next.object.id : undefined,
  };
}

export function resolveCourseEntry(input: ResolveCourseEntryInput): CourseEntryDecision {
  const {
    now,
    firstArrival,
    objects,
    studySessionPrimary,
    mostRecentSession,
    hasActiveStudySession,
    examDays,
    restorableNextSourceId,
  } = input;

  if (hasActiveStudySession) return { kind: 'none' };

  if (studySessionPrimary && mostRecentSession) {
    const ts = mostRecentSession.lastActiveAt || mostRecentSession.enteredAt;
    const warm = now - ts < COURSE_ENTRY_WARM_WINDOW_MS;
    const src = objects.find(o => o.id === mostRecentSession.sourceObjectId);
    const work = objects.find(o => o.id === mostRecentSession.workObjectId);
    if (warm && src && work) {
      return { kind: 'warm_restore', sourceId: mostRecentSession.sourceObjectId };
    }
  }

  const studyObjects = objects.filter(
    o => o.type === 'pdf' || o.type === 'notebook' || o.type === 'studyfile' || o.type === 'note',
  );

  if (firstArrival && studyObjects.length === 0) {
    return {
      kind: 'strip',
      profile: 'new',
      primaryLabel: 'Set up your course workspace',
      secondaryLabel: 'Add an exam PDF or note to begin',
      buttonLabel: 'Add material',
      action: 'begin',
    };
  }

  if (studyObjects.length === 0) {
    return {
      kind: 'strip',
      profile: 'empty',
      primaryLabel: 'This course workspace is empty',
      secondaryLabel: examSuffix(examDays),
      buttonLabel: 'Add material',
      action: 'begin',
    };
  }

  const { next } = deriveMissionControlSections(objects);
  if (next) {
    return stripFromNext(
      next,
      profileForNext(next, examDays),
      examDays,
      restorableNextSourceId,
    );
  }

  return {
    kind: 'strip',
    profile: 'empty',
    primaryLabel: 'Open your course workspace',
    secondaryLabel: examSuffix(examDays),
    buttonLabel: 'Enter workspace',
    action: 'enter',
  };
}
