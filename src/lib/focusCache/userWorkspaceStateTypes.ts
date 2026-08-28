/**
 * Shared types for account/section workspace state cloud sync.
 */

export const USER_WORKSPACE_STATE_ENTITY_TYPE = 'user_workspace_state' as const;

/** Account-level MAIN/Dashboard canvas. workspaceId = userId. */
export const DESK_STATE_ENTITY_ID = 'desk' as const;

/** Section-scoped Math Zone bundle. workspaceId = sectionId. */
export const MATH_ZONE_STATE_ENTITY_ID = 'math_zone' as const;

export type UserWorkspaceStateScope = 'desk' | 'math_zone';

export type UserWorkspaceStatePayload = {
  scope: UserWorkspaceStateScope;
  state: Record<string, unknown>;
  updatedAt: number;
};
