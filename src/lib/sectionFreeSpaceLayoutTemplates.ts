/**
 * Semantic layout templates for section Free Space.
 * Repositions existing objects only; persistence and object models stay unchanged.
 */

import type { BlockPos, PositionMap } from '../hooks/useBlockPositions';
import type { ProjectObjectType, ProjectSpaceObject } from '../hooks/useSectionFreeSpaceObjects';
import {
  buildSemanticClusters,
  getSemanticProfile,
  type SemanticCluster,
  type SemanticHierarchy,
  type SemanticLane,
} from './freeSpaceSemanticClusters';

export type FreeSpaceTemplateId =
  | 'study-board'
  | 'exam-prep'
  | 'research-map'
  | 'course-workspace'
  | 'weekly-planning'
  | 'brainstorm-canvas';

export interface FreeSpaceTemplateMeta {
  id: FreeSpaceTemplateId;
  label: string;
  description: string;
}

export const FREE_SPACE_TEMPLATES: FreeSpaceTemplateMeta[] = [
  { id: 'study-board', label: 'Study Board', description: 'Sources left, thinking center, tools and review orbit by role.' },
  { id: 'exam-prep', label: 'Exam Prep', description: 'Connected clusters flow down a clear study sequence.' },
  { id: 'research-map', label: 'Research Map', description: 'Semantic hubs with loose radial gravity and variable density.' },
  { id: 'course-workspace', label: 'Course Workspace', description: 'Large notebook anchors with naturally grouped references and tools.' },
  { id: 'weekly-planning', label: 'Weekly Planning', description: 'A horizontal strip with cleaner semantic rhythm and spacing.' },
  { id: 'brainstorm-canvas', label: 'Brainstorm Canvas', description: 'Asymmetric idea clusters that feel exploratory instead of gridded.' },
];

const INNER_GAP = 26;
const OUTER_GAP = 132;

const DEFAULT_W: Record<ProjectObjectType, number> = {
  notebook: 560,
  note: 360,
  mistake: 360,
  link: 360,
  companion: 460,
  checklist: 360,
  image: 460,
  calculator: 300,
  graph: 380,
  pdf: 500,
};

const DEFAULT_H: Record<ProjectObjectType, number> = {
  notebook: 440,
  note: 280,
  mistake: 280,
  link: 240,
  companion: 320,
  checklist: 300,
  image: 360,
  calculator: 360,
  graph: 320,
  pdf: 420,
};

const MIN_W: Record<ProjectObjectType, number> = {
  notebook: 440,
  note: 300,
  mistake: 320,
  link: 300,
  companion: 360,
  checklist: 300,
  image: 340,
  calculator: 280,
  graph: 340,
  pdf: 420,
};

const MAX_W: Record<ProjectObjectType, number> = {
  notebook: 620,
  note: 420,
  mistake: 420,
  link: 420,
  companion: 520,
  checklist: 420,
  image: 520,
  calculator: 340,
  graph: 460,
  pdf: 560,
};

const MIN_H: Record<ProjectObjectType, number> = {
  notebook: 340,
  note: 220,
  mistake: 240,
  link: 200,
  companion: 260,
  checklist: 240,
  image: 280,
  calculator: 300,
  graph: 280,
  pdf: 340,
};

const MAX_H: Record<ProjectObjectType, number> = {
  notebook: 520,
  note: 340,
  mistake: 360,
  link: 300,
  companion: 380,
  checklist: 360,
  image: 420,
  calculator: 420,
  graph: 380,
  pdf: 480,
};

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

type LocalClusterLayout = {
  cluster: SemanticCluster<ProjectSpaceObject>;
  positions: Record<string, BlockPos>;
  width: number;
  height: number;
  zone: SemanticLane;
};

function effDims(type: ProjectObjectType, p: BlockPos | undefined): { w: number; h: number } {
  const base = p ?? { x: 0, y: 0, w: 0, h: 0 };
  const w = clamp(base.w > 0 ? base.w : DEFAULT_W[type], MIN_W[type], MAX_W[type]);
  const h = clamp(base.h > 0 ? base.h : DEFAULT_H[type], MIN_H[type], MAX_H[type]);
  return { w, h };
}

function deterministic(id: string, salt = 1): number {
  let hash = 2166136261 ^ salt;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 10_000) / 10_000;
}

function placeLocal(
  out: Record<string, BlockPos>,
  object: ProjectSpaceObject,
  x: number,
  y: number,
  prev: PositionMap,
): void {
  const { w, h } = effDims(object.type, prev[object.id]);
  out[object.id] = { x: Math.round(x), y: Math.round(y), w, h };
}

function normalizeLocalLayout(
  layout: Record<string, BlockPos>,
): { positions: Record<string, BlockPos>; width: number; height: number } {
  const entries = Object.entries(layout);
  if (!entries.length) return { positions: {}, width: 0, height: 0 };

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const [, pos] of entries) {
    minX = Math.min(minX, pos.x);
    minY = Math.min(minY, pos.y);
    maxX = Math.max(maxX, pos.x + pos.w);
    maxY = Math.max(maxY, pos.y + pos.h);
  }

  const shifted: Record<string, BlockPos> = {};
  for (const [id, pos] of entries) {
    shifted[id] = {
      ...pos,
      x: Math.round(pos.x - minX),
      y: Math.round(pos.y - minY),
    };
  }

  return {
    positions: shifted,
    width: Math.round(maxX - minX),
    height: Math.round(maxY - minY),
  };
}

function stackVertical(
  out: Record<string, BlockPos>,
  items: ProjectSpaceObject[],
  startX: number,
  startY: number,
  prev: PositionMap,
  gapY: number,
  driftX = 0,
): void {
  let y = startY;
  for (const item of items) {
    const jitter = (deterministic(item.id, 17) - 0.5) * driftX;
    placeLocal(out, item, startX + jitter, y, prev);
    y += effDims(item.type, prev[item.id]).h + gapY;
  }
}

function placeWrappedRows(
  out: Record<string, BlockPos>,
  items: ProjectSpaceObject[],
  startX: number,
  startY: number,
  prev: PositionMap,
  columns: number,
  gapX: number,
  gapY: number,
): void {
  if (!items.length) return;
  let x = startX;
  let y = startY;
  let col = 0;
  let rowH = 0;
  for (const item of items) {
    const { w, h } = effDims(item.type, prev[item.id]);
    placeLocal(out, item, x, y, prev);
    x += w + gapX;
    rowH = Math.max(rowH, h);
    col += 1;
    if (col >= columns) {
      col = 0;
      x = startX;
      y += rowH + gapY;
      rowH = 0;
    }
  }
}

function placeCenteredRows(
  out: Record<string, BlockPos>,
  items: ProjectSpaceObject[],
  centerX: number,
  startY: number,
  prev: PositionMap,
  columns: number,
  gapX: number,
  gapY: number,
): number {
  let y = startY;
  for (let i = 0; i < items.length; i += columns) {
    const row = items.slice(i, i + columns);
    const rowWidth = row.reduce((sum, item, idx) => {
      const { w } = effDims(item.type, prev[item.id]);
      return sum + w + (idx > 0 ? gapX : 0);
    }, 0);
    let x = centerX - rowWidth / 2;
    let rowH = 0;
    for (const item of row) {
      const { w, h } = effDims(item.type, prev[item.id]);
      placeLocal(out, item, x, y, prev);
      x += w + gapX;
      rowH = Math.max(rowH, h);
    }
    y += rowH + gapY;
  }
  return y;
}

function groupLaneMembers(cluster: SemanticCluster<ProjectSpaceObject>): Record<SemanticLane, ProjectSpaceObject[]> {
  const groups: Record<SemanticLane, ProjectSpaceObject[]> = {
    source: [],
    core: [],
    tool: [],
    review: [],
    support: [],
  };
  for (const member of cluster.members) {
    if (member.id === cluster.primaryId) continue;
    groups[getSemanticProfile(member.type).lane].push(member);
  }
  return groups;
}

function maxLaneWidth(items: ProjectSpaceObject[], prev: PositionMap): number {
  return items.reduce((max, item) => Math.max(max, effDims(item.type, prev[item.id]).w), 0);
}

function primaryMember(cluster: SemanticCluster<ProjectSpaceObject>): ProjectSpaceObject {
  return cluster.members.find((member) => member.id === cluster.primaryId) ?? cluster.members[0]!;
}

function layoutLinearCluster(
  cluster: SemanticCluster<ProjectSpaceObject>,
  prev: PositionMap,
  variant: 'study-board' | 'course-workspace' | 'weekly-planning',
): LocalClusterLayout {
  const out: Record<string, BlockPos> = {};
  const primary = primaryMember(cluster);
  const primaryDims = effDims(primary.type, prev[primary.id]);
  const groups = groupLaneMembers(cluster);
  const sourceWidth = maxLaneWidth(groups.source, prev);
  const sideGap = variant === 'course-workspace' ? 72 : variant === 'weekly-planning' ? 44 : 56;
  const reviewDetach = variant === 'study-board' ? 78 : variant === 'course-workspace' ? 64 : 48;
  const supportOffset = variant === 'course-workspace' ? 72 : variant === 'weekly-planning' ? 44 : 58;
  const anchorX = Math.max(48, sourceWidth > 0 ? sourceWidth + sideGap : 56);
  const anchorY = variant === 'course-workspace' ? 24 : 18;

  placeLocal(out, primary, anchorX, anchorY, prev);

  stackVertical(out, groups.source, 0, anchorY + 8, prev, INNER_GAP + 6, 10);
  stackVertical(
    out,
    groups.tool,
    anchorX + primaryDims.w + sideGap,
    anchorY + 6,
    prev,
    INNER_GAP + 4,
    8,
  );
  stackVertical(
    out,
    groups.review,
    anchorX + primaryDims.w + sideGap + reviewDetach,
    anchorY + primaryDims.h * 0.7 + 34,
    prev,
    INNER_GAP + 6,
    8,
  );
  placeWrappedRows(
    out,
    groups.core,
    anchorX + Math.min(102, primaryDims.w * 0.18),
    anchorY + primaryDims.h + 30,
    prev,
    variant === 'weekly-planning' ? 3 : 2,
    INNER_GAP + 2,
    INNER_GAP,
  );
  placeWrappedRows(
    out,
    groups.support,
    anchorX - 8,
    anchorY + primaryDims.h + supportOffset,
    prev,
    variant === 'weekly-planning' ? 3 : 2,
    INNER_GAP,
    INNER_GAP - 2,
  );

  const normalized = normalizeLocalLayout(out);
  return {
    cluster,
    positions: normalized.positions,
    width: normalized.width,
    height: normalized.height,
    zone: zoneForTemplate(cluster, variant),
  };
}

function layoutVerticalCluster(
  cluster: SemanticCluster<ProjectSpaceObject>,
  prev: PositionMap,
): LocalClusterLayout {
  const out: Record<string, BlockPos> = {};
  const buckets: Record<SemanticLane, ProjectSpaceObject[]> = {
    source: [],
    core: [],
    tool: [],
    review: [],
    support: [],
  };
  for (const member of cluster.members) buckets[getSemanticProfile(member.type).lane].push(member);

  const centerX = 280;
  let y = 0;
  const stageOrder: SemanticLane[] = ['source', 'core', 'tool', 'review', 'support'];
  for (const lane of stageOrder) {
    const items = buckets[lane];
    if (!items.length) continue;
    y = placeCenteredRows(out, items, centerX, y, prev, items.length > 2 ? 2 : items.length, 36, 34);
    y += 14;
  }

  const normalized = normalizeLocalLayout(out);
  return {
    cluster,
    positions: normalized.positions,
    width: normalized.width,
    height: normalized.height,
    zone: zoneForTemplate(cluster, 'exam-prep'),
  };
}

function layoutOrbitalCluster(
  cluster: SemanticCluster<ProjectSpaceObject>,
  prev: PositionMap,
): LocalClusterLayout {
  const out: Record<string, BlockPos> = {};
  const primary = primaryMember(cluster);
  const primaryDims = effDims(primary.type, prev[primary.id]);
  const centerX = 280 + deterministic(primary.id, 3) * 40;
  const centerY = 220 + deterministic(primary.id, 5) * 26;
  placeLocal(out, primary, centerX - primaryDims.w / 2, centerY - primaryDims.h / 2, prev);

  const groups = groupLaneMembers(cluster);
  const angleBase: Record<SemanticLane, number> = {
    source: 3.95,
    core: 5.18,
    tool: 0.34,
    review: 1.18,
    support: 2.35,
  };
  const radiusBase: Record<SemanticLane, number> = {
    source: Math.max(primaryDims.w, primaryDims.h) * 0.42 + 210,
    core: Math.max(primaryDims.w, primaryDims.h) * 0.32 + 168,
    tool: Math.max(primaryDims.w, primaryDims.h) * 0.45 + 224,
    review: Math.max(primaryDims.w, primaryDims.h) * 0.48 + 252,
    support: Math.max(primaryDims.w, primaryDims.h) * 0.4 + 214,
  };

  (Object.keys(groups) as SemanticLane[]).forEach((lane, laneIndex) => {
    const items = groups[lane];
    const spread = lane === 'core' ? 0.42 : 0.6;
    const baseAngle = angleBase[lane] + (deterministic(cluster.primaryId, 30 + laneIndex) - 0.5) * 0.24;
    items.forEach((item, index) => {
      const offset = index - (items.length - 1) / 2;
      const angle = baseAngle + offset * spread + (deterministic(item.id, 51) - 0.5) * 0.14;
      const { w, h } = effDims(item.type, prev[item.id]);
      const radius = radiusBase[lane] + index * 82 + (deterministic(item.id, 53) - 0.5) * 20;
      const x = centerX + Math.cos(angle) * radius - w / 2;
      const y = centerY + Math.sin(angle) * radius * 0.84 - h / 2;
      placeLocal(out, item, x, y, prev);
    });
  });

  const normalized = normalizeLocalLayout(out);
  return {
    cluster,
    positions: normalized.positions,
    width: normalized.width,
    height: normalized.height,
    zone: zoneForTemplate(cluster, 'research-map'),
  };
}

function layoutFlowCluster(
  cluster: SemanticCluster<ProjectSpaceObject>,
  prev: PositionMap,
): LocalClusterLayout {
  const out: Record<string, BlockPos> = {};
  const primary = primaryMember(cluster);
  const primaryDims = effDims(primary.type, prev[primary.id]);
  const centerX = 250 + deterministic(primary.id, 61) * 70;
  const centerY = 200 + deterministic(primary.id, 67) * 64;
  const baseAngle = deterministic(cluster.key, 71) * Math.PI * 2;

  placeLocal(out, primary, centerX - primaryDims.w / 2, centerY - primaryDims.h / 2, prev);

  const others = cluster.members.filter((member) => member.id !== primary.id);
  const angleBias: Record<SemanticLane, number> = {
    source: -0.92,
    core: -0.18,
    tool: 0.35,
    review: 0.98,
    support: 1.54,
  };

  others.forEach((item, index) => {
    const profile = getSemanticProfile(item.type);
    const angle =
      baseAngle +
      index * 0.92 +
      angleBias[profile.lane] +
      (deterministic(item.id, 73) - 0.5) * 0.36;
    const radius =
      172 +
      Math.pow(index + 1, 0.94) * 102 +
      (profile.lane === 'review' ? 52 : 0) +
      (profile.lane === 'source' ? 28 : 0);
    const wave = Math.sin(index * 0.82 + baseAngle) * 58;
    const sweep = Math.cos(index * 0.64 + baseAngle * 0.7) * 46;
    const { w, h } = effDims(item.type, prev[item.id]);
    const x = centerX + Math.cos(angle) * radius * 1.14 + wave - w / 2;
    const y = centerY + Math.sin(angle) * radius * 0.72 + sweep - h / 2;
    placeLocal(out, item, x, y, prev);
  });

  const normalized = normalizeLocalLayout(out);
  return {
    cluster,
    positions: normalized.positions,
    width: normalized.width,
    height: normalized.height,
    zone: zoneForTemplate(cluster, 'brainstorm-canvas'),
  };
}

function zoneForTemplate(
  cluster: SemanticCluster<ProjectSpaceObject>,
  templateId: FreeSpaceTemplateId,
): SemanticLane {
  const hasCoreAnchor = cluster.laneWeights.core >= 90 || cluster.hierarchyCounts.primary > 0;

  switch (templateId) {
    case 'study-board':
      if (hasCoreAnchor) return 'core';
      if (cluster.dominantLane === 'review') return 'review';
      if (cluster.dominantLane === 'tool') return 'tool';
      if (cluster.dominantLane === 'source') return 'source';
      return 'support';
    case 'course-workspace':
      if (hasCoreAnchor) return 'core';
      return cluster.dominantLane;
    case 'exam-prep':
    case 'weekly-planning':
      return hasCoreAnchor && cluster.dominantLane === 'source' ? 'core' : cluster.dominantLane;
    case 'research-map':
    case 'brainstorm-canvas':
    default:
      return cluster.dominantLane;
  }
}

function buildLocalClusterLayout(
  templateId: FreeSpaceTemplateId,
  cluster: SemanticCluster<ProjectSpaceObject>,
  prev: PositionMap,
): LocalClusterLayout {
  switch (templateId) {
    case 'study-board':
      return layoutLinearCluster(cluster, prev, 'study-board');
    case 'course-workspace':
      return layoutLinearCluster(cluster, prev, 'course-workspace');
    case 'weekly-planning':
      return layoutLinearCluster(cluster, prev, 'weekly-planning');
    case 'exam-prep':
      return layoutVerticalCluster(cluster, prev);
    case 'research-map':
      return layoutOrbitalCluster(cluster, prev);
    case 'brainstorm-canvas':
      return layoutFlowCluster(cluster, prev);
    default:
      return layoutLinearCluster(cluster, prev, 'study-board');
  }
}

function placeClustersInColumns(
  layouts: LocalClusterLayout[],
  startX: number,
  startY: number,
  maxHeight: number,
  gapX: number,
  gapY: number,
): Record<string, { x: number; y: number }> {
  const out: Record<string, { x: number; y: number }> = {};
  let x = startX;
  let y = startY;
  let columnW = 0;
  const bottom = startY + maxHeight;
  for (const layout of layouts) {
    const extraGap = layout.cluster.singleton ? 38 : 0;
    if (y !== startY && y + layout.height > bottom) {
      x += columnW + gapX;
      y = startY;
      columnW = 0;
    }
    out[layout.cluster.key] = { x, y };
    y += layout.height + gapY + extraGap;
    columnW = Math.max(columnW, layout.width);
  }
  return out;
}

function placeClustersInRows(
  layouts: LocalClusterLayout[],
  startX: number,
  startY: number,
  maxWidth: number,
  gapX: number,
  gapY: number,
): Record<string, { x: number; y: number }> {
  const out: Record<string, { x: number; y: number }> = {};
  let x = startX;
  let y = startY;
  let rowH = 0;
  const right = startX + maxWidth;
  for (const layout of layouts) {
    const extraGap = layout.cluster.singleton ? 32 : 0;
    if (x !== startX && x + layout.width > right) {
      x = startX;
      y += rowH + gapY;
      rowH = 0;
    }
    out[layout.cluster.key] = { x, y };
    x += layout.width + gapX + extraGap;
    rowH = Math.max(rowH, layout.height);
  }
  return out;
}

function placeStageClusters(
  layouts: LocalClusterLayout[],
  centerX: number,
  startY: number,
  drift = 96,
  gapY = 138,
): Record<string, { x: number; y: number }> {
  const out: Record<string, { x: number; y: number }> = {};
  let y = startY;
  layouts.forEach((layout, index) => {
    const laneBias = layout.zone === 'source' ? -86 : layout.zone === 'tool' ? 64 : layout.zone === 'review' ? 86 : 0;
    const stagger = index === 0 ? 0 : ((index % 2 === 0 ? -1 : 1) * Math.min(drift, index * 26));
    const x = centerX - layout.width / 2 + laneBias + stagger;
    out[layout.cluster.key] = { x: Math.round(x), y };
    y += layout.height + gapY + (layout.cluster.singleton ? 26 : 0);
  });
  return out;
}

function placeResearchClusters(layouts: LocalClusterLayout[]): Record<string, { x: number; y: number }> {
  const out: Record<string, { x: number; y: number }> = {};
  if (!layouts.length) return out;

  const centerX = 1360;
  const centerY = 780;
  const laneAngles: Record<SemanticLane, number> = {
    source: 3.72,
    core: 4.95,
    tool: 0.22,
    review: 1.12,
    support: 2.28,
  };
  const laneCounts: Record<SemanticLane, number> = {
    source: 0,
    core: 0,
    tool: 0,
    review: 0,
    support: 0,
  };

  layouts.forEach((layout, index) => {
    if (index === 0) {
      out[layout.cluster.key] = {
        x: Math.round(centerX - layout.width / 2),
        y: Math.round(centerY - layout.height / 2),
      };
      return;
    }
    const count = laneCounts[layout.zone]++;
    const ring = 1 + Math.floor(count / 2);
    const offset = count % 2 === 0 ? -0.36 : 0.36;
    const angle = laneAngles[layout.zone] + offset + (deterministic(layout.cluster.key, 103) - 0.5) * 0.26;
    const radius = 560 + ring * 380 + (layout.cluster.singleton ? 120 : 0) + count * 42;
    out[layout.cluster.key] = {
      x: Math.round(centerX + Math.cos(angle) * radius - layout.width / 2),
      y: Math.round(centerY + Math.sin(angle) * radius * 0.82 - layout.height / 2),
    };
  });

  return out;
}

function placeBrainstormClusters(layouts: LocalClusterLayout[]): Record<string, { x: number; y: number }> {
  const out: Record<string, { x: number; y: number }> = {};
  if (!layouts.length) return out;

  const centerX = 1220;
  const centerY = 760;
  const laneBase: Record<SemanticLane, number> = {
    source: 3.58,
    core: 4.86,
    tool: 0.28,
    review: 1.24,
    support: 2.06,
  };

  layouts.forEach((layout, index) => {
    if (index === 0) {
      out[layout.cluster.key] = {
        x: Math.round(centerX - layout.width / 2 - 40),
        y: Math.round(centerY - layout.height / 2),
      };
      return;
    }
    const angle =
      laneBase[layout.zone] +
      index * 1.02 +
      (deterministic(layout.cluster.key, 131) - 0.5) * 0.42;
    const radius = 320 + Math.pow(index, 0.9) * 286 + (layout.cluster.singleton ? 120 : 0);
    const waveY = Math.sin(index * 0.84 + deterministic(layout.cluster.key, 133) * Math.PI) * 142;
    out[layout.cluster.key] = {
      x: Math.round(centerX + Math.cos(angle) * radius * 1.12 - layout.width / 2),
      y: Math.round(centerY + Math.sin(angle) * radius * 0.7 + waveY - layout.height / 2),
    };
  });

  return out;
}

function computeClusterOrigins(
  templateId: FreeSpaceTemplateId,
  layouts: LocalClusterLayout[],
): Record<string, { x: number; y: number }> {
  const grouped: Record<SemanticLane, LocalClusterLayout[]> = {
    source: [],
    core: [],
    tool: [],
    review: [],
    support: [],
  };
  for (const layout of layouts) grouped[layout.zone].push(layout);

  if (templateId === 'study-board') {
    return {
      ...placeClustersInColumns(grouped.source, 84, 112, 1900, 180, 136),
      ...placeClustersInRows(grouped.core, 860, 112, 1980, 180, 148),
      ...placeClustersInColumns(grouped.tool, 2240, 148, 1900, 180, 134),
      ...placeClustersInColumns(grouped.review, 1960, 1040, 1800, 160, 128),
      ...placeClustersInRows(grouped.support, 1040, 1320, 1520, 144, 124),
    };
  }

  if (templateId === 'course-workspace') {
    return {
      ...placeClustersInColumns(grouped.source, 84, 180, 1900, 160, 128),
      ...placeClustersInRows(grouped.core, 700, 112, 2040, 186, 150),
      ...placeClustersInColumns(grouped.tool, 2200, 210, 1900, 164, 130),
      ...placeClustersInRows(grouped.support, 900, 1260, 1560, 150, 124),
      ...placeClustersInColumns(grouped.review, 1910, 1140, 1880, 150, 126),
    };
  }

  if (templateId === 'exam-prep') {
    return {
      ...placeStageClusters(grouped.source, 1160, 110, 72, 120),
      ...placeStageClusters(grouped.core, 1180, 760, 86, 130),
      ...placeStageClusters(grouped.tool, 1200, 1490, 92, 130),
      ...placeStageClusters(grouped.review, 1210, 2270, 102, 132),
      ...placeStageClusters(grouped.support, 1180, 3090, 104, 130),
    };
  }

  if (templateId === 'weekly-planning') {
    return {
      ...placeClustersInRows(grouped.source, 96, 180, 1100, 136, 94),
      ...placeClustersInRows(grouped.core, 1230, 120, 1520, 140, 100),
      ...placeClustersInRows(grouped.tool, 2820, 180, 1040, 136, 92),
      ...placeClustersInRows(grouped.review, 3940, 240, 980, 132, 92),
      ...placeClustersInRows(grouped.support, 1260, 980, 1560, 132, 96),
    };
  }

  if (templateId === 'research-map') {
    return placeResearchClusters(layouts);
  }

  if (templateId === 'brainstorm-canvas') {
    return placeBrainstormClusters(layouts);
  }

  return placeClustersInRows(layouts, 120, 120, 2200, 140, 120);
}

function overlaps(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
  gap: number,
): boolean {
  return !(ax + aw + gap <= bx || bx + bw + gap <= ax || ay + ah + gap <= by || by + bh + gap <= ay);
}

function relaxOverlaps(
  layout: Record<string, BlockPos>,
  objects: ProjectSpaceObject[],
  clusterById: Record<string, string>,
  hierarchyById: Record<string, SemanticHierarchy>,
  iterations = 34,
): Record<string, BlockPos> {
  const out: Record<string, BlockPos> = { ...layout };
  const list = [...objects].sort((a, b) => a.createdAt - b.createdAt);

  for (let pass = 0; pass < iterations; pass++) {
    let moved = false;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i]!;
        const b = list[j]!;
        const pa = out[a.id];
        const pb = out[b.id];
        if (!pa || !pb) continue;

        const da = effDims(a.type, pa);
        const db = effDims(b.type, pb);
        const sameCluster = clusterById[a.id] === clusterById[b.id];
        const gap = sameCluster ? INNER_GAP : OUTER_GAP;
        if (!overlaps(pa.x, pa.y, da.w, da.h, pb.x, pb.y, db.w, db.h, gap)) continue;

        const acx = pa.x + da.w / 2;
        const acy = pa.y + da.h / 2;
        const bcx = pb.x + db.w / 2;
        const bcy = pb.y + db.h / 2;
        const overlapX = (da.w + db.w) / 2 + gap - Math.abs(bcx - acx);
        const overlapY = (da.h + db.h) / 2 + gap - Math.abs(bcy - acy);
        if (overlapX <= 0 || overlapY <= 0) continue;

        const axis = overlapX < overlapY ? 'x' : 'y';
        const moveB =
          hierarchyById[b.id] !== 'primary' &&
          (hierarchyById[a.id] === 'primary' || b.createdAt >= a.createdAt);
        const magnitude = Math.round((axis === 'x' ? overlapX : overlapY) * (sameCluster ? 0.66 : 0.86));

        if (axis === 'x') {
          const dir = bcx >= acx ? 1 : -1;
          if (moveB) out[b.id] = { ...pb, x: Math.max(48, pb.x + dir * magnitude) };
          else out[a.id] = { ...pa, x: Math.max(48, pa.x - dir * magnitude) };
        } else {
          const dir = bcy >= acy ? 1 : -1;
          if (moveB) out[b.id] = { ...pb, y: Math.max(48, pb.y + dir * magnitude) };
          else out[a.id] = { ...pa, y: Math.max(48, pa.y - dir * magnitude) };
        }

        moved = true;
      }
    }
    if (!moved) break;
  }

  return out;
}

export function computeFreeSpaceTemplateLayout(
  templateId: FreeSpaceTemplateId,
  objects: ProjectSpaceObject[] | null | undefined,
  positions: PositionMap | null | undefined,
): Record<string, BlockPos> {
  if (!objects || objects.length === 0) return {};

  const posMap: PositionMap = positions && typeof positions === 'object' ? positions : {};
  const sorted = [...objects].sort((a, b) => a.createdAt - b.createdAt);
  const clusters = buildSemanticClusters(sorted);
  if (!clusters.length) return {};

  const localLayouts = clusters.map((cluster) => buildLocalClusterLayout(templateId, cluster, posMap));
  const origins = computeClusterOrigins(templateId, localLayouts);
  const out: Record<string, BlockPos> = {};
  const clusterById: Record<string, string> = {};
  const hierarchyById: Record<string, SemanticHierarchy> = {};

  for (const layout of localLayouts) {
    const origin = origins[layout.cluster.key] ?? { x: 96, y: 96 };
    for (const member of layout.cluster.members) {
      const local = layout.positions[member.id];
      if (!local) continue;
      out[member.id] = {
        ...local,
        x: Math.round(origin.x + local.x),
        y: Math.round(origin.y + local.y),
      };
      clusterById[member.id] = layout.cluster.key;
      hierarchyById[member.id] = getSemanticProfile(member.type).hierarchy;
    }
  }

  return relaxOverlaps(out, sorted, clusterById, hierarchyById);
}

export function computeCleanFreeSpaceLayout(
  objects: ProjectSpaceObject[] | null | undefined,
  positions: PositionMap | null | undefined,
): Record<string, BlockPos> {
  if (!objects || objects.length === 0) return {};
  const posMap: PositionMap = positions && typeof positions === 'object' ? positions : {};
  const sorted = [...objects].sort((a, b) => a.createdAt - b.createdAt);
  const byLane: Record<SemanticLane, ProjectSpaceObject[]> = {
    source: [],
    core: [],
    tool: [],
    review: [],
    support: [],
  };
  for (const object of sorted) {
    byLane[getSemanticProfile(object.type).lane].push(object);
  }

  const out: Record<string, BlockPos> = {};
  const placeStack = (
    items: ProjectSpaceObject[],
    x: number,
    y: number,
    gap = 32,
  ) => {
    let cursorY = y;
    for (const item of items) {
      const { w, h } = effDims(item.type, posMap[item.id]);
      out[item.id] = { x, y: cursorY, w, h };
      cursorY += h + gap;
    }
  };

  placeStack(byLane.source, 96, 96, 34);
  placeStack(byLane.core, byLane.source.length ? 660 : 420, 140, 34);
  placeStack(byLane.tool, 1260, 140, 34);
  placeStack(byLane.review, 1260, 560, 34);
  placeStack(byLane.support, byLane.core.length ? 660 : 420, 620, 32);

  const clusterById: Record<string, string> = {};
  const hierarchyById: Record<string, SemanticHierarchy> = {};
  for (const object of sorted) {
    const lane = getSemanticProfile(object.type).lane;
    clusterById[object.id] = lane;
    hierarchyById[object.id] = getSemanticProfile(object.type).hierarchy;
  }

  return relaxOverlaps(out, sorted, clusterById, hierarchyById, 18);
}

export const FREE_SPACE_TEMPLATE_CONFIRM_MIN = 4;
