import type { NotebookPage } from './types';

export type NotebookBodyRepresentation = {
  body: string;
  codecVersion?: number;
};

export type NotebookBodyProjection = { body: string; bodyCodecVersion?: number };

/** The version follows the selected body, including legacy (absent) versions. */
export function notebookPageBodyProjection(
  page: NotebookPage,
  fallback: NotebookBodyProjection = { body: '' },
): NotebookBodyProjection {
  if (page.kind !== 'document' || page.documentBody === undefined) return { body: fallback.body, ...(fallback.bodyCodecVersion !== undefined ? { bodyCodecVersion: fallback.bodyCodecVersion } : {}) };
  return {
    body: page.documentBody,
    ...(page.documentBodyCodecVersion !== undefined ? { bodyCodecVersion: page.documentBodyCodecVersion } : {}),
  };
}

export function replaceNotebookBodyProjection<T extends NotebookBodyProjection>(content: T, projection: NotebookBodyProjection): T {
  const { bodyCodecVersion: _old, ...rest } = content;
  if (projection.bodyCodecVersion !== undefined) {
    return { ...rest, body: projection.body, bodyCodecVersion: projection.bodyCodecVersion } as T;
  }
  return { ...rest, body: projection.body } as T;
}

/**
 * Replaces page documentBody with an explicit atomic body representation.
 * The caller must explicitly provide both body and codecVersion (or codecVersion: undefined for legacy).
 */
export function replaceNotebookPageBody(
  page: NotebookPage,
  rep: NotebookBodyRepresentation,
): NotebookPage {
  const { documentBodyCodecVersion: _old, ...rest } = page;
  return {
    ...rest,
    documentBody: rep.body,
    ...(rep.codecVersion !== undefined ? { documentBodyCodecVersion: rep.codecVersion } : {}),
  };
}
