/**
 * React hook: subscribe to saveStatus + online/offline, derive SyncUiStatus.
 */

import { useEffect, useRef, useState } from 'react';
import { getSaveStatusSnapshot, subscribeSaveStatus } from '../saveStatus';
import { deriveSyncUiStatus } from './deriveSyncUiStatus';
import { recordSyncTimelineEvent } from './syncEventTimeline';
import type { SyncUiStatus } from './syncStatusTypes';
import { isSyncStatusUiEnabled } from './syncStatusTypes';

export const SAVED_LOCAL_DWELL_MS = 2500;

function readOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine;
}

export function useSyncUiStatus(): SyncUiStatus {
  const [status, setStatus] = useState<SyncUiStatus>(() =>
    deriveSyncUiStatus(getSaveStatusSnapshot(), { online: readOnline(), showSavedLocal: false }),
  );
  const showSavedRef = useRef(false);
  const wasPendingRef = useRef(false);
  const dwellRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastOnlineRef = useRef(readOnline());

  useEffect(() => {
    if (!isSyncStatusUiEnabled()) return;

    const apply = () => {
      const snap = getSaveStatusSnapshot();
      const online = readOnline();

      if (online !== lastOnlineRef.current) {
        recordSyncTimelineEvent(online ? 'online_detected' : 'offline_detected');
        lastOnlineRef.current = online;
      }

      if (snap.anyPending) {
        wasPendingRef.current = true;
        showSavedRef.current = false;
        if (dwellRef.current) {
          clearTimeout(dwellRef.current);
          dwellRef.current = null;
        }
      } else if (wasPendingRef.current && !snap.anyError && online) {
        wasPendingRef.current = false;
        showSavedRef.current = true;
        if (dwellRef.current) clearTimeout(dwellRef.current);
        dwellRef.current = setTimeout(() => {
          showSavedRef.current = false;
          dwellRef.current = null;
          setStatus(
            deriveSyncUiStatus(getSaveStatusSnapshot(), {
              online: readOnline(),
              showSavedLocal: false,
            }),
          );
        }, SAVED_LOCAL_DWELL_MS);
      }

      setStatus(
        deriveSyncUiStatus(snap, {
          online,
          showSavedLocal: showSavedRef.current && !snap.anyPending && !snap.anyError && online,
        }),
      );
    };

    const unsub = subscribeSaveStatus(apply);
    window.addEventListener('online', apply);
    window.addEventListener('offline', apply);
    apply();

    return () => {
      unsub();
      window.removeEventListener('online', apply);
      window.removeEventListener('offline', apply);
      if (dwellRef.current) clearTimeout(dwellRef.current);
    };
  }, []);

  return status;
}
