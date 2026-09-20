/**
 * Raw / filtered retrieval hits for ask_course (server-only).
 */

export type KnowledgeSearchHit = {
  sourceObjectId: string;
  fileName: string | null;
  pageNumber: number;
  chunkIndex: number;
  text: string;
  similarity: number;
};

export type CitedCourseSource = {
  index: number;
  sourceObjectId: string;
  fileName: string | null;
  pageNumber: number;
};

export type PromptCourseChunk = {
  citationIndex: number;
  sourceObjectId: string;
  fileName: string | null;
  pageNumber: number;
  text: string;
};
