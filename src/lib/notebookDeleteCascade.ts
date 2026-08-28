/**
 * Cascade-delete notebook-owned user-content assets when notebook object removed.
 */

import { collectNotebookPageInkKeys } from './notebookPages';
import type { NotebookContentWithPages } from './notebookPages';
import { referencedHandwritingKeys } from './handwritingTypes';
import { collectNotebookImageKeys } from './notebookImageRefs';
import { deleteNotebookImageAsset } from './notebookImageCloud';
import { enqueueHandwritingCloudDelete } from './notebookHandwritingCloud';
import { hwDelete, listHandwritingBlockKeysForObject } from './notebookHandwritingStore';

function isNotebookContent(content: unknown): content is NotebookContentWithPages {
  return (
    !!content &&
    typeof content === 'object' &&
    (content as { type?: string }).type === 'notebook'
  );
}

export async function cascadeDeleteNotebookAssets(input: {
  userId: string;
  sectionId: string;
  objectId: string;
  content: unknown;
}): Promise<{ handwriting: number; images: number }> {
  const { userId, sectionId, objectId } = input;
  let handwriting = 0;
  let images = 0;

  const content = isNotebookContent(input.content) ? input.content : null;
  const body = typeof (input.content as { body?: unknown })?.body === 'string'
    ? (input.content as { body: string }).body
    : content?.body ?? '';

  const hwKeys = new Set<string>(referencedHandwritingKeys(body));
  if (content?.pages) {
    for (const k of collectNotebookPageInkKeys(content.pages)) hwKeys.add(k);
  }
  for (const k of await listHandwritingBlockKeysForObject(objectId)) {
    if (!hwKeys.has(k)) hwKeys.add(k);
  }

  for (const blockKey of hwKeys) {
    await hwDelete(objectId, blockKey);
    await enqueueHandwritingCloudDelete({ userId, sectionId, objectId, blockKey });
    handwriting += 1;
  }

  const imageKeys = collectNotebookImageKeys({ body });
  for (const imageKey of imageKeys) {
    await deleteNotebookImageAsset({ userId, sectionId, objectId, imageKey });
    images += 1;
  }

  return { handwriting, images };
}
