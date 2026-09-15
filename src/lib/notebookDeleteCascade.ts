/**
 * Cascade-delete notebook-owned user-content assets.
 * M7.0: call ONLY on permanent delete / tombstone expiry — never on soft-delete.
 */

import { collectNotebookPageInkKeys } from './notebookPages';
import type { NotebookContentWithPages } from './notebookPages';
import { referencedHandwritingKeys } from './handwritingTypes';
import { collectNotebookImageKeys, referencedNotebookImageKeys } from './notebookImageRefs';
import { deleteNotebookImageAsset } from './notebookImageCloud';
import { enqueueHandwritingCloudDelete } from './notebookHandwritingCloud';
import { hwDelete, listHandwritingBlockKeysForObject } from './notebookHandwritingStore';
import { nbImageDelete } from './notebookImageStore';

function isNotebookContent(content: unknown): content is NotebookContentWithPages {
  return (
    !!content &&
    typeof content === 'object' &&
    (content as { type?: string }).type === 'notebook'
  );
}

/**
 * Destroy notebook-owned handwriting + inline images.
 * When userId is missing, local assets are still removed; cloud enqueue is skipped.
 */
export async function cascadeDeleteNotebookAssets(input: {
  userId?: string | null;
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
    if (userId) {
      await enqueueHandwritingCloudDelete({ userId, sectionId, objectId, blockKey });
    }
    handwriting += 1;
  }

  const imageKeySet = new Set(collectNotebookImageKeys({ body }));
  if (content?.pages) {
    for (const page of content.pages) {
      if (page.kind === 'document' && typeof page.documentBody === 'string') {
        for (const k of referencedNotebookImageKeys(page.documentBody)) imageKeySet.add(k);
      }
    }
  }
  for (const imageKey of imageKeySet) {
    if (userId) {
      await deleteNotebookImageAsset({ userId, sectionId, objectId, imageKey });
    } else {
      await nbImageDelete(imageKey);
    }
    images += 1;
  }

  return { handwriting, images };
}
