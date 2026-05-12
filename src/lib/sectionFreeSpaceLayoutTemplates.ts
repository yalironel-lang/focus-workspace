/**
 * Spatial layout templates for section Free Space — repositions existing objects only.
 * No persistence format changes; output is merged into the positions map by the caller.
 */

import type { BlockPos, PositionMap } from '../hooks/useBlockPositions';
import type { ProjectObjectType, ProjectSpaceObject } from '../hooks/useSectionFreeSpaceObjects';

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
  { id: 'study-board', label: 'Study Board', description: 'Reading left, writing center, actions right.' },
  { id: 'exam-prep', label: 'Exam Prep', description: 'Vertical flow — top to bottom, exam focus.' },
  { id: 'research-map', label: 'Research Map', description: 'Loose radial clusters by material type.' },
  { id: 'course-workspace', label: 'Course Workspace', description: 'Large surfaces up, tools below.' },
  { id: 'weekly-planning', label: 'Weekly Planning', description: 'Wide horizontal strip for the week.' },
  { id: 'brainstorm-canvas', label: 'Brainstorm Canvas', description: 'Organic spiral from a calm center.' },
];

/** Inter-object breathing room (relax pass + stacks). Slightly generous for large canvases. */
const GUTTER = 34;

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
};

function effDims(type: ProjectObjectType, p: BlockPos | undefined): { w: number; h: number } {
  const base = p ?? { x: 0, y: 0, w: 0, h: 0 };
  const w = base.w > 0 ? base.w : DEFAULT_W[type];
  const h = base.h > 0 ? base.h : DEFAULT_H[type];
  return { w, h };
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
  g: number,
): boolean {
  return !(ax + aw + g <= bx || bx + bw + g <= ax || ay + ah + g <= by || by + bh + g <= ay);
}

/** Light nudge pass so templates stay calm but non-overlapping after rounding. */
function relaxOverlaps(
  layout: Record<string, BlockPos>,
  objects: ProjectSpaceObject[],
  iterations = 28,
): Record<string, BlockPos> {
  const out: Record<string, BlockPos> = { ...layout };
  const list = [...objects].sort((a, b) => a.createdAt - b.createdAt);
  for (let k = 0; k < iterations; k++) {
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
        if (!overlaps(pa.x, pa.y, da.w, da.h, pb.x, pb.y, db.w, db.h, GUTTER)) continue;
        // Prefer nudging the younger object downward (j) for stable feel
        const ny = pa.y + da.h + GUTTER;
        out[b.id] = { ...pb, y: Math.max(pb.y, ny) };
        moved = true;
      }
    }
    if (!moved) break;
  }
  return out;
}

function place(
  id: string,
  type: ProjectObjectType,
  x: number,
  y: number,
  prev: PositionMap,
): BlockPos {
  const p = prev[id];
  const { w, h } = effDims(type, p);
  return { x: Math.round(x), y: Math.round(y), w, h };
}

function columnForType(t: ProjectObjectType): 0 | 1 | 2 {
  if (t === 'notebook' || t === 'note' || t === 'mistake' || t === 'pdf') return 0;
  if (t === 'link') return 1;
  return 2;
}

export function computeFreeSpaceTemplateLayout(
  templateId: FreeSpaceTemplateId,
  objects: ProjectSpaceObject[] | null | undefined,
  positions: PositionMap | null | undefined,
): Record<string, BlockPos> {
  if (!objects || objects.length === 0) return {};

  const posMap: PositionMap = positions && typeof positions === 'object' ? positions : {};
  const sorted = [...objects].sort((a, b) => a.createdAt - b.createdAt);
  const out: Record<string, BlockPos> = {};

  switch (templateId) {
    case 'study-board': {
      const colX: [number, number, number] = [88, 548, 1028];
      const bottoms: [number, number, number] = [112, 112, 112];
      for (const o of sorted) {
        const c = columnForType(o.type);
        const x = colX[c];
        const y = bottoms[c];
        out[o.id] = place(o.id, o.type, x, y, posMap);
        const { h } = effDims(o.type, out[o.id]);
        bottoms[c] = y + h + GUTTER;
      }
      break;
    }
    case 'exam-prep': {
      let y = 100;
      const x = 420;
      for (const o of sorted) {
        out[o.id] = place(o.id, o.type, x, y, posMap);
        const { h } = effDims(o.type, out[o.id]);
        y += h + GUTTER + 8;
      }
      break;
    }
    case 'research-map': {
      const cx = 860;
      const cy = 440;
      const buckets: Record<ProjectObjectType, ProjectSpaceObject[]> = {
        notebook: [],
        note: [],
        mistake: [],
        link: [],
        checklist: [],
        image: [],
        calculator: [],
        graph: [],
        pdf: [],
      };
      for (const o of sorted) buckets[o.type].push(o);
      const typeOrder: ProjectObjectType[] = [
        'notebook',
        'note',
        'mistake',
        'pdf',
        'link',
        'checklist',
        'image',
        'calculator',
        'graph',
      ];
      let ring = 0;
      for (const type of typeOrder) {
        const group = buckets[type];
        if (group.length === 0) continue;
        const baseAngle = ring * 1.12;
        ring += 1;
        group.forEach((o, idx) => {
          const angle = baseAngle + idx * 0.55;
          const r = 168 + idx * 78 + ring * 28;
          const x = cx + Math.cos(angle) * r - DEFAULT_W[o.type] * 0.35;
          const y = cy + Math.sin(angle) * r * 0.82 - DEFAULT_H[o.type] * 0.25;
          out[o.id] = place(o.id, o.type, x, y, posMap);
        });
      }
      break;
    }
    case 'course-workspace': {
      const notebooks = sorted.filter((o) => o.type === 'notebook');
      const rest = sorted.filter((o) => o.type !== 'notebook');
      let x = 108;
      const yTop = 88;
      for (const o of notebooks) {
        out[o.id] = place(o.id, o.type, x, yTop, posMap);
        const { w } = effDims(o.type, out[o.id]);
        x += w + GUTTER + 20;
      }
      let x2 = 108;
      let y2 = 608;
      let rowH = 0;
      for (const o of rest) {
        out[o.id] = place(o.id, o.type, x2, y2, posMap);
        const { w, h } = effDims(o.type, out[o.id]);
        rowH = Math.max(rowH, h);
        x2 += w + GUTTER;
        if (x2 > 1700) {
          x2 = 120;
          y2 += rowH + GUTTER + 14;
          rowH = 0;
        }
      }
      break;
    }
    case 'weekly-planning': {
      let x = 128;
      const y = 228;
      for (const o of sorted) {
        out[o.id] = place(o.id, o.type, x, y, posMap);
        const { w } = effDims(o.type, out[o.id]);
        x += w + GUTTER + 18;
      }
      break;
    }
    case 'brainstorm-canvas': {
      const cx = 760;
      const cy = 400;
      const golden = 2.39996322972865332;
      sorted.forEach((o, i) => {
        const angle = i * golden;
        const r = 108 + Math.sqrt(i + 1) * 64;
        const x = cx + Math.cos(angle) * r - DEFAULT_W[o.type] * 0.4;
        const y = cy + Math.sin(angle) * r * 0.88 - DEFAULT_H[o.type] * 0.3;
        out[o.id] = place(o.id, o.type, x, y, posMap);
      });
      break;
    }
    default:
      return {};
  }

  return relaxOverlaps(out, sorted);
}

export const FREE_SPACE_TEMPLATE_CONFIRM_MIN = 4;
