import type { NotebookPage } from './types';

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
  return { ...rest, ...projection } as T;
}
export function replaceNotebookPageBody(page: NotebookPage, body: string, codecVersion?: number): NotebookPage {
  const { documentBodyCodecVersion: _old, ...rest } = page;
  return { ...rest, documentBody: body, ...(codecVersion !== undefined ? { documentBodyCodecVersion: codecVersion } : {}) };
}
