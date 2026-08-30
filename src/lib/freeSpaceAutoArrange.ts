import type { BlockPos, PositionMap } from '../hooks/useBlockPositions';
import type { ProjectObjectType, ProjectSpaceObject } from '../hooks/useSectionFreeSpaceObjects';
import { coerceFreeSpaceConnectionIds } from '../hooks/useSectionFreeSpaceObjects';
import {
  computeFreeSpaceTemplateLayout,
  type FreeSpaceTemplateId,
} from './sectionFreeSpaceLayoutTemplates';

export type ArrangeGoalId =
  | 'exam-study'
  | 'research-map'
  | 'project-planning'
  | 'clean-presentation';

export interface ArrangeStats {
  clusterCount: number;
  overlapsResolved: number;
  isolatedCount: number;
}

export interface ArrangeResult {
  patches: Record<string, BlockPos>;
  stats: ArrangeStats;
}

interface ArrangeLayoutTuning {
  compactMode: boolean;
  neighborBaseRadius: number;
  neighborRingStep: number;
  clusterBaseRadius: number;
  clusterRingStep: number;
  overlapPasses: number;
  overlapNudge: number;
}

const CATEGORY_PRIORITY: Record<string, number> = {
  core: 10,
  note: 8,
  source: 7,
  task: 6,
  image: 5,
  tool: 4,
  unknown: 3,
};

const DEFAULT_W: Record<ProjectObjectType, number> = {
  notebook: 620,
  note: 360,
  mistake: 380,
  link: 360,
  checklist: 360,
  image: 460,
  calculator: 300,
  graph: 400,
  pdf: 520,
  studyfile: 520,
  companion: 460,
  sheet: 720,
};

const DEFAULT_H: Record<ProjectObjectType, number> = {
  notebook: 520,
  note: 280,
  mistake: 320,
  link: 240,
  checklist: 300,
  image: 360,
  calculator: 420,
  graph: 360,
  pdf: 460,
  studyfile: 460,
  companion: 320,
  sheet: 480,
};

function classifyCategory(o: ProjectSpaceObject): 'core' | 'source' | 'note' | 'task' | 'image' | 'tool' | 'unknown' {
  if (o.type === 'notebook') return 'core';
  if (o.type === 'pdf' || o.type === 'studyfile' || o.type === 'link') return 'source';
  if (o.type === 'note') return 'note';
  if (o.type === 'checklist') return 'task';
  if (o.type === 'image') return 'image';
  if (o.type === 'calculator' || o.type === 'graph' || o.type === 'companion' || o.type === 'mistake' || o.type === 'sheet') return 'tool';
  return 'unknown';
}

function dims(id: string, type: ProjectObjectType, prev: PositionMap): { w: number; h: number } {
  const p = prev[id];
  return {
    w: p?.w && p.w > 0 ? p.w : DEFAULT_W[type],
    h: p?.h && p.h > 0 ? p.h : DEFAULT_H[type],
  };
}

function avgCenter(ids: string[], objectsById: Map<string, ProjectSpaceObject>, prev: PositionMap): { x: number; y: number } {
  if (!ids.length) return { x: 560, y: 420 };
  let sx = 0;
  let sy = 0;
  for (const id of ids) {
    const o = objectsById.get(id);
    if (!o) continue;
    const p = prev[id];
    const d = dims(id, o.type, prev);
    sx += (p?.x ?? 140) + d.w / 2;
    sy += (p?.y ?? 140) + d.h / 2;
  }
  return { x: sx / ids.length, y: sy / ids.length };
}

function buildAdjacency(targetIds: Set<string>, objectsById: Map<string, ProjectSpaceObject>): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>();
  for (const id of targetIds) adj.set(id, new Set<string>());

  for (const id of targetIds) {
    const o = objectsById.get(id);
    if (!o) continue;
    const conns = coerceFreeSpaceConnectionIds(o.connections);
    for (const other of conns) {
      if (!targetIds.has(other) || other === id) continue;
      adj.get(id)?.add(other);
      adj.get(other)?.add(id);
    }
  }
  return adj;
}

function connectedComponents(adj: Map<string, Set<string>>): string[][] {
  const seen = new Set<string>();
  const comps: string[][] = [];

  for (const id of adj.keys()) {
    if (seen.has(id)) continue;
    const q: string[] = [id];
    const comp: string[] = [];
    seen.add(id);
    while (q.length) {
      const cur = q.shift()!;
      comp.push(cur);
      for (const n of adj.get(cur) ?? []) {
        if (seen.has(n)) continue;
        seen.add(n);
        q.push(n);
      }
    }
    comps.push(comp);
  }
  return comps;
}

function chooseHub(ids: string[], adj: Map<string, Set<string>>, objectsById: Map<string, ProjectSpaceObject>): string {
  let best = ids[0];
  let bestScore = -Infinity;
  for (const id of ids) {
    const o = objectsById.get(id);
    if (!o) continue;
    const cat = classifyCategory(o);
    const degree = (adj.get(id)?.size ?? 0) * 3;
    const score = degree + CATEGORY_PRIORITY[cat] + (o.updatedAt / 1e13);
    if (score > bestScore) {
      bestScore = score;
      best = id;
    }
  }
  return best;
}

function preferredAngle(cat: ReturnType<typeof classifyCategory>): number {
  switch (cat) {
    case 'source':
      return -2.25;
    case 'task':
      return 0.35;
    case 'note':
      return -0.25;
    case 'tool':
      return 1.25;
    case 'image':
      return 1.95;
    case 'unknown':
      return 2.45;
    case 'core':
      return 0;
    default:
      return 0;
  }
}

function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

function layoutTuningForTargetCount(targetCount: number): ArrangeLayoutTuning {
  if (targetCount < 8) {
    return {
      compactMode: true,
      neighborBaseRadius: 184,
      neighborRingStep: 118,
      clusterBaseRadius: 320,
      clusterRingStep: 168,
      overlapPasses: 10,
      overlapNudge: 6,
    };
  }
  return {
    compactMode: false,
    neighborBaseRadius: 236,
    neighborRingStep: 148,
    clusterBaseRadius: 460,
    clusterRingStep: 204,
    overlapPasses: 14,
    overlapNudge: 8,
  };
}

function layoutComponent(
  ids: string[],
  anchor: { x: number; y: number },
  adj: Map<string, Set<string>>,
  objectsById: Map<string, ProjectSpaceObject>,
  prev: PositionMap,
  out: Record<string, BlockPos>,
  tuning: ArrangeLayoutTuning,
  hubIds: Set<string>,
) {
  if (!ids.length) return;
  const hub = chooseHub(ids, adj, objectsById);
  hubIds.add(hub);
  const hubObj = objectsById.get(hub);
  if (!hubObj) return;
  const hubDims = dims(hub, hubObj.type, prev);
  out[hub] = {
    x: Math.round(anchor.x - hubDims.w / 2),
    y: Math.round(anchor.y - hubDims.h / 2),
    ...hubDims,
  };

  const neighbors = ids.filter((id) => id !== hub);
  neighbors.sort((a, b) => (adj.get(b)?.size ?? 0) - (adj.get(a)?.size ?? 0));

  let ring = 0;
  let placedInRing = 0;
  let ringCapacity = 6;
  const hubNeighbors = adj.get(hub) ?? new Set<string>();
  for (const id of neighbors) {
    const o = objectsById.get(id);
    if (!o) continue;
    if (placedInRing >= ringCapacity) {
      ring += 1;
      placedInRing = 0;
      ringCapacity += 4;
    }

    const angle =
      preferredAngle(classifyCategory(o)) +
      (placedInRing / ringCapacity) * Math.PI * 2 +
      (hash01(id) - 0.5) * 0.32;
    const directlyConnectedToHub = hubNeighbors.has(id);
    const connectionWeight = directlyConnectedToHub ? 0.78 : 1.04;
    const degreeWeight = Math.max(0.82, 1 - (adj.get(id)?.size ?? 0) * 0.03);
    const radius = Math.round((tuning.neighborBaseRadius + ring * tuning.neighborRingStep) * connectionWeight * degreeWeight);
    const d = dims(id, o.type, prev);
    out[id] = {
      x: Math.round(anchor.x + Math.cos(angle) * radius - d.w / 2),
      y: Math.round(anchor.y + Math.sin(angle) * radius * (tuning.compactMode ? 0.66 : 0.7) - d.h / 2),
      ...d,
    };
    placedInRing += 1;
  }
}

function overlapWithPadding(a: BlockPos, b: BlockPos, pad = 18): { ox: number; oy: number } | null {
  const x1 = a.x - pad;
  const y1 = a.y - pad;
  const x2 = a.x + a.w + pad;
  const y2 = a.y + a.h + pad;

  const xx1 = b.x - pad;
  const yy1 = b.y - pad;
  const xx2 = b.x + b.w + pad;
  const yy2 = b.y + b.h + pad;

  const ox = Math.min(x2, xx2) - Math.max(x1, xx1);
  const oy = Math.min(y2, yy2) - Math.max(y1, yy1);
  if (ox <= 0 || oy <= 0) return null;
  return { ox, oy };
}

function resolveOverlaps(
  patches: Record<string, BlockPos>,
  movableIds: Set<string>,
  fixedPositions: PositionMap,
  hubIds: Set<string>,
  tuning: ArrangeLayoutTuning,
): number {
  const allIds = Object.keys(patches);
  let resolved = 0;

  for (let pass = 0; pass < tuning.overlapPasses; pass += 1) {
    let moved = false;

    for (let i = 0; i < allIds.length; i += 1) {
      for (let j = i + 1; j < allIds.length; j += 1) {
        const aId = allIds[i];
        const bId = allIds[j];
        const a = patches[aId];
        const b = patches[bId];
        const ov = overlapWithPadding(a, b);
        if (!ov) continue;

        const moveA = movableIds.has(aId);
        const moveB = movableIds.has(bId);
        if (!moveA && !moveB) continue;
        const aIsHub = hubIds.has(aId);
        const bIsHub = hubIds.has(bId);

        if (ov.ox <= ov.oy) {
          const dir = (b.x + b.w / 2) >= (a.x + a.w / 2) ? 1 : -1;
          const delta = Math.round(ov.ox + tuning.overlapNudge);
          if (moveB && (!bIsHub || aIsHub)) b.x = Math.max(24, Math.round(b.x + dir * delta));
          else if (moveA) a.x = Math.max(24, Math.round(a.x - dir * delta));
        } else {
          const dir = (b.y + b.h / 2) >= (a.y + a.h / 2) ? 1 : -1;
          const delta = Math.round(ov.oy + tuning.overlapNudge);
          if (moveB && (!bIsHub || aIsHub)) b.y = Math.max(24, Math.round(b.y + dir * delta));
          else if (moveA) a.y = Math.max(24, Math.round(a.y - dir * delta));
        }
        moved = true;
        resolved += 1;
      }
    }

    for (const id of allIds) {
      if (!movableIds.has(id)) continue;
      const p = patches[id];
      for (const f of Object.values(fixedPositions)) {
        const ov = overlapWithPadding(p, f);
        if (!ov) continue;
        if (ov.ox <= ov.oy) {
          p.x = Math.max(24, Math.round(p.x + ov.ox + tuning.overlapNudge + 4));
        } else {
          p.y = Math.max(24, Math.round(p.y + ov.oy + tuning.overlapNudge + 4));
        }
        moved = true;
        resolved += 1;
      }
    }

    if (!moved) break;
  }

  return resolved;
}

function arrangeInternal(
  objects: ProjectSpaceObject[],
  prev: PositionMap,
  targetIds: Set<string>,
  fixedPositions: PositionMap = {},
): ArrangeResult {
  if (!objects.length || !targetIds.size) {
    return { patches: {}, stats: { clusterCount: 0, overlapsResolved: 0, isolatedCount: 0 } };
  }

  const objectsById = new Map(objects.map((o) => [o.id, o]));
  const adj = buildAdjacency(targetIds, objectsById);
  const comps = connectedComponents(adj);
  const isolatedCount = [...adj.values()].filter((s) => s.size === 0).length;

  const patches: Record<string, BlockPos> = {};
  const hubIds = new Set<string>();
  const center = avgCenter([...targetIds], objectsById, prev);
  const tuning = layoutTuningForTargetCount(targetIds.size);

  const sortedComps = [...comps].sort((a, b) => {
    const score = (ids: string[]) =>
      ids.length * 3 +
      ids.reduce((acc, id) => {
        const obj = objectsById.get(id);
        return acc + (obj ? CATEGORY_PRIORITY[classifyCategory(obj)] : 0) + ((adj.get(id)?.size ?? 0) * 2);
      }, 0);
    return score(b) - score(a);
  });

  sortedComps.forEach((comp, i) => {
    if (i === 0) {
      layoutComponent(comp, center, adj, objectsById, prev, patches, tuning, hubIds);
      return;
    }
    const angle = ((i - 1) / Math.max(1, sortedComps.length - 1)) * Math.PI * 2 - Math.PI * 0.58;
    const radius =
      tuning.clusterBaseRadius +
      Math.round(Math.sqrt(targetIds.size) * (tuning.compactMode ? 42 : 56)) +
      Math.floor((i - 1) / 3) * tuning.clusterRingStep;
    const anchor = {
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius * (tuning.compactMode ? 0.52 : 0.58),
    };
    layoutComponent(comp, anchor, adj, objectsById, prev, patches, tuning, hubIds);
  });

  const overlapsResolved = resolveOverlaps(patches, targetIds, fixedPositions, hubIds, tuning);
  return {
    patches,
    stats: {
      clusterCount: sortedComps.length,
      overlapsResolved,
      isolatedCount,
    },
  };
}

export function computeAutoArrangeLayout(objects: ProjectSpaceObject[], prev: PositionMap): ArrangeResult {
  return arrangeInternal(objects, prev, new Set(objects.map((o) => o.id)));
}

export function computeAutoArrangeSelectedLayout(
  objects: ProjectSpaceObject[],
  prev: PositionMap,
  selectedIds: string[],
): ArrangeResult {
  const selected = new Set(selectedIds.filter(Boolean));
  if (selected.size < 2) {
    return { patches: {}, stats: { clusterCount: 0, overlapsResolved: 0, isolatedCount: 0 } };
  }
  const fixed: PositionMap = {};
  for (const o of objects) {
    if (selected.has(o.id)) continue;
    if (prev[o.id]) fixed[o.id] = prev[o.id]!;
  }
  return arrangeInternal(objects, prev, selected, fixed);
}

export function computeArrangeByGoalLayout(
  goal: ArrangeGoalId,
  objects: ProjectSpaceObject[],
  prev: PositionMap,
): ArrangeResult {
  const fromTemplate = (id: FreeSpaceTemplateId): ArrangeResult => {
    const patches = computeFreeSpaceTemplateLayout(id, objects, prev);
    const targetIds = new Set(Object.keys(patches));
    const objectsById = new Map(objects.map((o) => [o.id, o]));
    const adj = buildAdjacency(targetIds, objectsById);
    const comps = connectedComponents(adj);
    const isolatedCount = [...adj.values()].filter((s) => s.size === 0).length;
    const overlapsResolved = resolveOverlaps(
      patches,
      targetIds,
      {},
      new Set<string>(),
      layoutTuningForTargetCount(targetIds.size),
    );
    return {
      patches,
      stats: { clusterCount: comps.length, overlapsResolved, isolatedCount },
    };
  };

  switch (goal) {
    case 'research-map':
      return fromTemplate('research-map');
    case 'clean-presentation':
      return fromTemplate('study-board');
    case 'exam-study':
      return fromTemplate('exam-prep');
    case 'project-planning':
    default:
      return computeAutoArrangeLayout(objects, prev);
  }
}

