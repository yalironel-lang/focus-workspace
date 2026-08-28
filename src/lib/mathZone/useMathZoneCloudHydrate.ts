/**
 * Pull Math Zone state from cloud on mount.
 */

import { useEffect, useState } from 'react';
import { resolveCacheNamespace } from '../focusCacheNamespace';
import {
  invalidateFreeSpaceAutoFlushScope,
  registerFreeSpaceAutoFlushScope,
  requestFreeSpacePendingFlushNow,
} from '../focusCache/freeSpaceObjectAutoFlush';
import { pullMathZoneFromCloud } from './mathZoneCloudSync';

export function useMathZoneCloudHydrate(
  userId: string | null | undefined,
  sectionId: string,
): { hydrated: boolean; cloudApplied: boolean } {
  const [state, setState] = useState({ hydrated: false, cloudApplied: false });

  useEffect(() => {
    if (!userId || !sectionId) {
      setState({ hydrated: true, cloudApplied: false });
      return;
    }

    let cancelled = false;
    const ns = resolveCacheNamespace(userId, sectionId);
    if (ns.ok) {
      registerFreeSpaceAutoFlushScope(ns.namespace);
      requestFreeSpacePendingFlushNow(ns.namespace);
    }

    void (async () => {
      const result = await pullMathZoneFromCloud(userId, sectionId);
      if (cancelled) return;
      setState({ hydrated: true, cloudApplied: result.applied });
      if (result.applied) {
        window.dispatchEvent(
          new CustomEvent('fw-math-zone-cloud-applied', { detail: { sectionId } }),
        );
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
  }, [userId, sectionId]);

  return state;
}
