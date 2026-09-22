/**
 * ZIKUK AI Gateway client — request/response contracts + invoke only.
 * Server logic lives under supabase/functions/ (never imported here).
 */

export type {
  AskCourseRecentTurn,
  AskCourseSourceRef,
  ZikukAiAskCourseRequest,
  ZikukAiAskCourseRequestV1,
  ZikukAiAskCourseRequestV2,
  ZikukAiCapability,
  ZikukAiErrorCode,
  ZikukAiExplainSelectionRequest,
  ZikukAiRequest,
  ZikukAiResponse,
} from './types';

export { AI_GATEWAY_FUNCTION_NAME } from './types';
export { zikukAiRequest } from './client';
