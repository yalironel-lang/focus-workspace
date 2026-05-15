import { useCallback, useEffect, useMemo, useState } from 'react';
import type { BlockPos, PositionMap } from './useBlockPositions';
import {
  buildUniversePositionMap,
  persistUniversePortalPosition,
} from '../lib/workspaceUniverse/storage';

export function useUniversePortalPositions(sectionIds: string[]) {
  const idsKey = sectionIds.join('|');
  const [positions, setPositions] = useState<PositionMap>(() =>
    buildUniversePositionMap(sectionIds),
  );

  useEffect(() => {
    setPositions(buildUniversePositionMap(sectionIds));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rebuild when section set changes
  }, [idsKey]);

  const setPos = useCallback(
    (portalId: string, patch: Partial<BlockPos>) => {
      setPositions(() => persistUniversePortalPosition(sectionIds, portalId, patch));
    },
    [sectionIds],
  );

  const initPos = useCallback(
    (portalId: string, pos: BlockPos) => {
      setPos(portalId, pos);
    },
    [setPos],
  );

  const removePos = useCallback((_portalId: string) => {
    /* portal removed when section deleted — layout rebuilt on idsKey change */
  }, []);

  return useMemo(
    () => ({ positions, setPos, initPos, removePos, applyPositions: setPositions }),
    [positions, setPos, initPos, removePos],
  );
}
