/**
 * Canonical Free Space PDF storage path — must match migration 011 + client builder.
 * {userId}/{sectionId}/{objectId}/pdf/{objectId}
 */

export function buildFreeSpacePdfStoragePath(input: {
  userId: string;
  sectionId: string;
  sourceObjectId: string;
}): string {
  const { userId, sectionId, sourceObjectId } = input;
  return `${userId}/${sectionId}/${sourceObjectId}/pdf/${sourceObjectId}`;
}
