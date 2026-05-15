const PREFIX = 'universe-portal-';

export function portalIdForSection(sectionId: string): string {
  return `${PREFIX}${sectionId}`;
}

export function sectionIdFromPortalId(portalId: string): string | null {
  if (!portalId.startsWith(PREFIX)) return null;
  const id = portalId.slice(PREFIX.length);
  return id.length > 0 ? id : null;
}

export function isUniversePortalId(id: string): boolean {
  return id.startsWith(PREFIX);
}
