import type { PositionMap } from '../hooks/useBlockPositions';
import {
  coerceFreeSpaceConnectionIds,
  type ProjectObjectType,
} from '../hooks/useSectionFreeSpaceObjects';

export type SemanticLane = 'source' | 'core' | 'tool' | 'review' | 'support';
export type SemanticHierarchy = 'primary' | 'secondary' | 'utility';

export interface SemanticNode {
  id: string;
  type?: ProjectObjectType | string;
  connections?: string[];
  createdAt?: number;
}

export interface SemanticProfile {
  lane: SemanticLane;
  hierarchy: SemanticHierarchy;
  weight: number;
  intimacy: number;
}

const FALLBACK_PROFILE: SemanticProfile = {
  lane: 'support',
  hierarchy: 'utility',
  weight: 48,
  intimacy: 0.75,
};

const PROFILE_BY_TYPE: Record<ProjectObjectType, SemanticProfile> = {
  notebook: { lane: 'core', hierarchy: 'primary', weight: 124, intimacy: 1.36 },
  note: { lane: 'core', hierarchy: 'secondary', weight: 94, intimacy: 1.08 },
  pdf: { lane: 'source', hierarchy: 'secondary', weight: 108, intimacy: 1.14 },
  image: { lane: 'source', hierarchy: 'secondary', weight: 82, intimacy: 0.94 },
  link: { lane: 'source', hierarchy: 'utility', weight: 66, intimacy: 0.8 },
  companion: { lane: 'source', hierarchy: 'secondary', weight: 92, intimacy: 1.02 },
  graph: { lane: 'tool', hierarchy: 'secondary', weight: 86, intimacy: 0.98 },
  calculator: { lane: 'tool', hierarchy: 'utility', weight: 74, intimacy: 0.86 },
  mistake: { lane: 'review', hierarchy: 'secondary', weight: 88, intimacy: 1.05 },
  checklist: { lane: 'support', hierarchy: 'utility', weight: 62, intimacy: 0.82 },
};

const LANE_ORDER: SemanticLane[] = ['source', 'core', 'tool', 'review', 'support'];

function createdAtOf(node: SemanticNode): number {
  return typeof node.createdAt === 'number' && Number.isFinite(node.createdAt) ? node.createdAt : 0;
}

function compareNodes(a: SemanticNode, b: SemanticNode): number {
  const byCreated = createdAtOf(a) - createdAtOf(b);
  if (byCreated !== 0) return byCreated;
  return a.id.localeCompare(b.id);
}

function neighborSetById<T extends SemanticNode>(nodes: T[]): Map<string, Set<string>> {
  const idSet = new Set(nodes.map((node) => node.id));
  const neighbors = new Map<string, Set<string>>();
  for (const node of nodes) neighbors.set(node.id, new Set<string>());
  for (const node of nodes) {
    const mine = neighbors.get(node.id);
    if (!mine) continue;
    for (const otherId of coerceFreeSpaceConnectionIds(node.connections)) {
      if (!idSet.has(otherId) || otherId === node.id) continue;
      mine.add(otherId);
      neighbors.get(otherId)?.add(node.id);
    }
  }
  return neighbors;
}

export function getSemanticProfile(type: ProjectObjectType | string | undefined): SemanticProfile {
  if (!type || typeof type !== 'string') return FALLBACK_PROFILE;
  return PROFILE_BY_TYPE[type as ProjectObjectType] ?? FALLBACK_PROFILE;
}

export interface SemanticCluster<T extends SemanticNode = SemanticNode> {
  key: string;
  members: T[];
  memberIds: string[];
  primaryId: string;
  dominantLane: SemanticLane;
  laneWeights: Record<SemanticLane, number>;
  hierarchyCounts: Record<SemanticHierarchy, number>;
  connectionCount: number;
  size: number;
  singleton: boolean;
  importance: number;
}

export function buildSemanticClusters<T extends SemanticNode>(nodes: T[]): SemanticCluster<T>[] {
  if (!nodes.length) return [];

  const ordered = [...nodes].sort(compareNodes);
  const byId = new Map(ordered.map((node) => [node.id, node]));
  const neighbors = neighborSetById(ordered);
  const visited = new Set<string>();
  const clusters: SemanticCluster<T>[] = [];

  for (const node of ordered) {
    if (visited.has(node.id)) continue;
    const queue = [node.id];
    const memberIds: string[] = [];
    visited.add(node.id);
    while (queue.length) {
      const currentId = queue.shift();
      if (!currentId) continue;
      memberIds.push(currentId);
      const nearby = neighbors.get(currentId);
      if (!nearby) continue;
      for (const nextId of nearby) {
        if (visited.has(nextId)) continue;
        visited.add(nextId);
        queue.push(nextId);
      }
    }

    const members = memberIds
      .map((id) => byId.get(id))
      .filter((candidate): candidate is T => !!candidate)
      .sort(compareNodes);

    const laneWeights: Record<SemanticLane, number> = {
      source: 0,
      core: 0,
      tool: 0,
      review: 0,
      support: 0,
    };
    const hierarchyCounts: Record<SemanticHierarchy, number> = {
      primary: 0,
      secondary: 0,
      utility: 0,
    };

    let connectionCount = 0;
    let primaryId = members[0]?.id ?? node.id;
    let primaryScore = Number.NEGATIVE_INFINITY;

    for (const member of members) {
      const profile = getSemanticProfile(member.type);
      const degree = neighbors.get(member.id)?.size ?? 0;
      const hierarchyBoost = profile.hierarchy === 'primary' ? 24 : profile.hierarchy === 'secondary' ? 10 : 0;
      const score = profile.weight + degree * 16 + hierarchyBoost;
      laneWeights[profile.lane] += profile.weight;
      hierarchyCounts[profile.hierarchy] += 1;
      connectionCount += degree;
      if (score > primaryScore || (score === primaryScore && compareNodes(member, byId.get(primaryId) ?? member) < 0)) {
        primaryScore = score;
        primaryId = member.id;
      }
    }

    connectionCount = Math.floor(connectionCount / 2);

    const dominantLane = [...LANE_ORDER].sort((a, b) => {
      const diff = laneWeights[b] - laneWeights[a];
      if (diff !== 0) return diff;
      return LANE_ORDER.indexOf(a) - LANE_ORDER.indexOf(b);
    })[0] ?? 'support';

    const importance =
      members.reduce((sum, member) => sum + getSemanticProfile(member.type).weight, 0) +
      connectionCount * 18 +
      members.length * 22 +
      (dominantLane === 'core' ? 18 : 0) +
      (hierarchyCounts.primary > 0 ? 18 : 0);

    clusters.push({
      key: primaryId,
      members,
      memberIds: members.map((member) => member.id),
      primaryId,
      dominantLane,
      laneWeights,
      hierarchyCounts,
      connectionCount,
      size: members.length,
      singleton: members.length <= 1,
      importance,
    });
  }

  return clusters.sort((a, b) => {
    const diff = b.importance - a.importance;
    if (diff !== 0) return diff;
    const sizeDiff = b.size - a.size;
    if (sizeDiff !== 0) return sizeDiff;
    return compareNodes(a.members[0] ?? { id: a.key }, b.members[0] ?? { id: b.key });
  });
}

export interface SemanticClusterRegion {
  key: string;
  memberIds: string[];
  primaryId: string;
  dominantLane: SemanticLane;
  x: number;
  y: number;
  w: number;
  h: number;
  density: number;
}

export function buildSemanticClusterRegions<T extends SemanticNode>(
  clusters: SemanticCluster<T>[],
  positions: PositionMap,
): SemanticClusterRegion[] {
  const out: SemanticClusterRegion[] = [];

  for (const cluster of clusters) {
    if (cluster.size < 2) continue;
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    let seen = 0;

    for (const id of cluster.memberIds) {
      const pos = positions[id];
      if (!pos) continue;
      const w = pos.w > 0 ? pos.w : 340;
      const h = pos.h > 0 ? pos.h : 220;
      minX = Math.min(minX, pos.x);
      minY = Math.min(minY, pos.y);
      maxX = Math.max(maxX, pos.x + w);
      maxY = Math.max(maxY, pos.y + h);
      seen += 1;
    }

    if (seen < 2 || !Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
      continue;
    }

    const padding = 56 + Math.min(92, cluster.size * 14 + cluster.connectionCount * 10);
    const density = Math.max(0.72, Math.min(1.34, 0.84 + cluster.connectionCount / Math.max(1, cluster.size * 1.7)));

    out.push({
      key: cluster.key,
      memberIds: cluster.memberIds,
      primaryId: cluster.primaryId,
      dominantLane: cluster.dominantLane,
      x: minX - padding,
      y: minY - padding,
      w: maxX - minX + padding * 2,
      h: maxY - minY + padding * 2,
      density,
    });
  }

  return out;
}
