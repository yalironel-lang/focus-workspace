/**
 * Minimal flush before phone Free Space canvas unmount (Workspace → MC).
 * Reuses existing registries — no persistence architecture changes.
 */

import { commitAllInFlightDragPan } from './freeSpaceDragCommit';
import { flushAllFreeSpacePersistence } from './freeSpacePersistFlush';
import { flushAllRegisteredHandwriting } from './handwritingFlushRegistry';
import { flushAllPendingHandwritingCloudEnqueues } from './notebookHandwritingCloud';
import { flushAllRegisteredSheets } from '../sheets/components/sheetFlushRegistry';

export async function flushBeforePhoneFreeSpaceUnmount(): Promise<void> {
  commitAllInFlightDragPan();
  flushAllFreeSpacePersistence();
  flushAllRegisteredSheets();
  await flushAllRegisteredHandwriting();
  await flushAllPendingHandwritingCloudEnqueues();
}
