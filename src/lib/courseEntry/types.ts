export type CourseEntryProfile = 'new' | 'empty' | 'cold' | 'exam';

export type CourseEntryAction = 'restore_session' | 'focus' | 'begin' | 'enter';

export type CourseEntryDecision =
  | { kind: 'none' }
  | { kind: 'warm_restore'; sourceId: string }
  | {
      kind: 'strip';
      profile: CourseEntryProfile;
      primaryLabel: string;
      secondaryLabel?: string;
      buttonLabel: string;
      action: CourseEntryAction;
      focusObjectId?: string;
      sessionSourceId?: string;
    };
