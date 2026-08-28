/**
 * PR C: field-level Free Space geometry LWW, independent of object.updatedAt.
 *
 * Content/object LWW (shouldAcceptCloudObject) is unchanged:
 *   unprotected AND cloud.updatedAt > local.updatedAt.
 *
 * Geometry LWW (shouldAcceptCloudGeometry):
 *   remote geometry is valid AND (local geometry absent
 *   OR remote.geometry.updatedAt > local.geometry.updatedAt).
 * Tie: equal geometry.updatedAt → keep local (no PositionMap patch).
 * That avoids duplicate/equal Realtime churn.
 *
 * Partial merge: content fields from the content winner, geometry from the
 * geometry winner. A cloud row may have newer content and older geometry
 * (or the inverse); those are handled independently.
 *
 * Local geometry for LWW is this window's React geometry, not shared durable
 * localStorage (see overlayBestLocalGeometry).
 */

import type { ProjectSpaceObject } from '../../hooks/useSectionFreeSpaceObjects';
import type { FreeSpaceObjectGeometry } from '../freeSpaceObjectGeometry';
import { normalizeFreeSpaceObjectGeometry } from '../freeSpaceObjectGeometry';
import { sanitizeBlockPos } from '../freeSpacePersistence';

export type GeometryPositionPatch = { x: number; y: number; w: number; h: number };

export type IncomingFreeSpaceMerge = {
  nextObject: ProjectSpaceObject;
  contentAccepted: boolean;
  geometryAccepted: boolean;
  positionPatch: GeometryPositionPatch | null;
};

function withGeometry(
  object: ProjectSpaceObject,
  geometry: FreeSpaceObjectGeometry | undefined,
): ProjectSpaceObject {
  if (geometry) return { ...object, geometry };
  if (object.geometry === undefined) return object;
  const { geometry: _dropped, ...rest } = object;
  return rest;
}

/**
 * PR7 content LWW. Cloud may win only when unprotected and
 * cloud.updatedAt > local.updatedAt. Equal or older → local wins.
 */
export function shouldAcceptCloudObject(input: {
  cloud: ProjectSpaceObject;
  local: ProjectSpaceObject | undefined;
  protectedEntityIds: ReadonlySet<string>;
}): boolean {
  const id = input.cloud.id;
  if (!id || input.protectedEntityIds.has(id)) return false;
  if (!input.local) return true;
  const cloudAt = input.cloud.updatedAt ?? 0;
  const localAt = input.local.updatedAt ?? 0;
  const accept = cloudAt > localAt;
  if (
    input.cloud.type === 'notebook' &&
    input.cloud.content?.type === 'notebook'
  ) {
    void import('../notebookPages/nbSyncDiag').then(({ nbSyncDiagLog, nbSyncDiagSummarizeContent }) => {
      nbSyncDiagLog('G_shouldAcceptCloud', { objectId: id, objectUpdatedAt: cloudAt }, {
        localUpdatedAt: localAt,
        cloudUpdatedAt: cloudAt,
        decision: accept ? 'accept_cloud' : 'keep_local',
        reason: accept ? 'cloud_newer' : localAt === cloudAt ? 'equal_ts' : 'local_newer',
        cloudContent: input.cloud.content.type === 'notebook'
          ? nbSyncDiagSummarizeContent(input.cloud.content)
          : null,
        localContent: input.local?.content?.type === 'notebook'
          ? nbSyncDiagSummarizeContent(input.local.content)
          : null,
      });
    });
  }
  return accept;
}

/**
 * Remote geometry may apply only when valid and strictly newer than local,
 * or when local geometry is absent. Equal timestamp keeps local.
 */
export function shouldAcceptCloudGeometry(input: {
  cloud: ProjectSpaceObject;
  local: ProjectSpaceObject | undefined;
  geometryBlockedIds?: ReadonlySet<string>;
}): boolean {
  const id = input.cloud.id;
  if (!id) return false;
  if (input.geometryBlockedIds?.has(id)) return false;
  const remote = normalizeFreeSpaceObjectGeometry(input.cloud.geometry);
  if (!remote) return false;
  const localG = normalizeFreeSpaceObjectGeometry(input.local?.geometry);
  if (!localG) return true;
  return remote.updatedAt > localG.updatedAt;
}

export function mergeIncomingFreeSpaceObject(input: {
  local: ProjectSpaceObject | undefined;
  cloud: ProjectSpaceObject;
  protectedEntityIds: ReadonlySet<string>;
  geometryBlockedIds?: ReadonlySet<string>;
}): IncomingFreeSpaceMerge {
  const contentAccepted = shouldAcceptCloudObject({
    cloud: input.cloud,
    local: input.local,
    protectedEntityIds: input.protectedEntityIds,
  });
  const geometryAccepted = shouldAcceptCloudGeometry({
    cloud: input.cloud,
    local: input.local,
    geometryBlockedIds: input.geometryBlockedIds,
  });

  const base: ProjectSpaceObject = contentAccepted
    ? input.cloud
    : (input.local ?? input.cloud);
  const geometry: FreeSpaceObjectGeometry | undefined = geometryAccepted
    ? normalizeFreeSpaceObjectGeometry(input.cloud.geometry)
    : normalizeFreeSpaceObjectGeometry(input.local?.geometry);

  const nextObject = withGeometry(base, geometry);
  const remoteGeom = geometryAccepted
    ? normalizeFreeSpaceObjectGeometry(input.cloud.geometry)
    : undefined;
  const positionPatch = remoteGeom
    ? sanitizeBlockPos({ x: remoteGeom.x, y: remoteGeom.y, w: remoteGeom.w, h: remoteGeom.h })
    : null;

  return {
    nextObject,
    contentAccepted,
    geometryAccepted,
    positionPatch,
  };
}

export function incomingHasAnyFieldWin(merged: IncomingFreeSpaceMerge): boolean {
  return merged.contentAccepted || merged.geometryAccepted;
}

/**
 * Local comparison source for field LWW.
 *
 * Content: `contentLocal` (React vs durable object.updatedAt — unchanged).
 * Geometry: this window's React geometry only. Shared durable localStorage
 * must not impersonate accepted local geometry (sibling tab write).
 */
export function overlayBestLocalGeometry(
  id: string,
  contentLocal: ProjectSpaceObject | undefined,
  reactObjects: readonly ProjectSpaceObject[],
  durableObjects: readonly ProjectSpaceObject[],
): ProjectSpaceObject | undefined {
  const react = reactObjects.find(o => o.id === id);
  const durable = durableObjects.find(o => o.id === id);
  const reactG = normalizeFreeSpaceObjectGeometry(react?.geometry);
  const base = contentLocal ?? react ?? durable;
  if (!base) return undefined;
  return withGeometry(base, reactG);
}

export function collectAcceptedGeometryPatches(
  localObjects: readonly ProjectSpaceObject[],
  cloudCandidates: readonly ProjectSpaceObject[],
  geometryBlockedIds?: ReadonlySet<string>,
): Record<string, GeometryPositionPatch> {
  const out: Record<string, GeometryPositionPatch> = {};
  const byId = new Map(localObjects.map(o => [o.id, o]));
  for (const cloud of cloudCandidates) {
    if (!cloud?.id) continue;
    const merged = mergeIncomingFreeSpaceObject({
      local: byId.get(cloud.id),
      cloud,
      protectedEntityIds: new Set(),
      geometryBlockedIds,
    });
    if (!merged.geometryAccepted || !merged.positionPatch) continue;
    out[cloud.id] = merged.positionPatch;
  }
  return out;
}
