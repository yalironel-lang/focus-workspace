/**
 * React hook: subscribe to local saveStatus + cloudSyncStatus + online/offline.
 */

import { useEffect, useRef, useState } from 'react';
import { getSaveStatusSnapshot, subscribeSaveStatus } from '../saveStatus';
import {
  getCloudSyncSnapshot,
  subscribeCloudSyncStatus,
} from './cloudSyncStatus';
import { deriveSyncUiStatus } from './deriveSyncUiStatus';
import { recordSyncTimelineEvent } from './syncEventTimeline';
import type { SyncUiStatus } from './syncStatusTypes';
import { isSyncStatusUiEnabled } from './syncStatusTypes';

export const SAVED_DWELL_MS = 2500;

/** @deprecated Use SAVED_DWELL_MS */
export const SAVED_LOCAL_DWELL_MS = SAVED_DWELL_MS;

function readOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine;
}

export function useSyncUiStatus(): SyncUiStatus {
  const [status, setStatus] = useState<SyncUiStatus>(() =>
    deriveSyncUiStatus(getSaveStatusSnapshot(), {
      online: readOnline(),
      cloud: getCloudSyncSnapshot(),
      showSaved: false,
    }),
  );
  const showSavedRef = useRef(false);
  const wasCloudPendingRef = useRef(false);
  const dwellRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastOnlineRef = useRef(readOnline());

  useEffect(() => {
    if (!isSyncStatusUiEnabled()) return;

    const apply = () => {
      const snap = getSaveStatusSnapshot();
      const cloud = getCloudSyncSnapshot();
      const online = readOnline();

      if (online !== lastOnlineRef.current) {
        recordSyncTimelineEvent(online ? 'online_detected' : 'offline_detected');
        lastOnlineRef.current = online;
      }

      const cloudBusy = cloud.anyCloudPending;
      if (cloudBusy) {
        wasCloudPendingRef.current = true;
        showSavedRef.current = false;
        if (dwellRef.current) {
          clearTimeout(dwellRef.current);
          dwellRef.current = null;
        }
      } else if (
        wasCloudPendingRef.current &&
        !cloud.anyCloudFailure &&
        !snap.anyPending &&
        !snap.anyError &&
        online
      ) {
        wasCloudPendingRef.current = false;
        showSavedRef.current = true;
        if (dwellRef.current) clearTimeout(dwellRef.current);
        dwellRef.current = setTimeout(() => {
          showSavedRef.current = false;
          dwellRef.current = null;
          setStatus(
            deriveSyncUiStatus(getSaveStatusSnapshot(), {
              online: readOnline(),
              cloud: getCloudSyncSnapshot(),
              showSaved: false,
            }),
          );
        }, SAVED_DWELL_MS);
      }

      setStatus(
        deriveSyncUiStatus(snap, {
          online,
          cloud,
          showSaved:
            showSavedRef.current &&
            !cloud.anyCloudPending &&
            !cloud.anyCloudFailure &&
            !snap.anyPending &&
            !snap.anyError &&
            online,
        }),
      );
    };

    const unsubLocal = subscribeSaveStatus(apply);
    const unsubCloud = subscribeCloudSyncStatus(apply);
    window.addEventListener('online', apply);
    window.addEventListener('offline', apply);
    apply();

    return () => {
      unsubLocal();
      unsubCloud();
      window.removeEventListener('online', apply);
      window.removeEventListener('offline', apply);
      if (dwellRef.current) clearTimeout(dwellRef.current);
    };
  }, []);

  return status;
}
