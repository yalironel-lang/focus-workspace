/**
 * Pull Desk state from cloud on mount + register auto-flush scope.
 */

import { useEffect, useState } from 'react';
import { resolveCacheNamespace } from '../focusCacheNamespace';
import {
  invalidateFreeSpaceAutoFlushScope,
  registerFreeSpaceAutoFlushScope,
  requestFreeSpacePendingFlushNow,
} from '../focusCache/freeSpaceObjectAutoFlush';
import { pullDeskStateFromCloud } from './deskPersistence';

export function useDeskCloudHydrate(userId: string | null | undefined): {
  hydrated: boolean;
  cloudApplied: boolean;
} {
  const [state, setState] = useState({ hydrated: false, cloudApplied: false });

  useEffect(() => {
    if (!userId) {
      setState({ hydrated: true, cloudApplied: false });
      return;
    }

    let cancelled = false;
    const ns = resolveCacheNamespace(userId, userId);
    if (ns.ok) {
      registerFreeSpaceAutoFlushScope(ns.namespace);
      requestFreeSpacePendingFlushNow(ns.namespace);
    }

    void (async () => {
      const result = await pullDeskStateFromCloud(userId);
      if (cancelled) return;
      setState({ hydrated: true, cloudApplied: result.applied });
      if (result.applied) {
        window.dispatchEvent(new CustomEvent('fw-desk-cloud-applied'));
      }
    })();

    const onOnline = () => {
      if (ns.ok) requestFreeSpacePendingFlushNow(ns.namespace);
    };
    window.addEventListener('online', onOnline);

    return () => {
      cancelled = true;
      window.removeEventListener('online', onOnline);
      if (ns.ok) invalidateFreeSpaceAutoFlushScope(ns.namespace);
    };
  }, [userId]);

  return state;
}
