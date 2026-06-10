export type HandwritingPoint = {
  x: number;
  y: number;
  pressure?: number;
  t?: number;
};

export type HandwritingStroke = {
  id: string;
  tool: 'pen' | 'eraser';
  color: string;
  width: number;
  points: HandwritingPoint[];
};

export type HandwritingBlockData = {
  type: 'handwriting';
  strokes: HandwritingStroke[];
  canvas: { width: number; height: number };
  updatedAt: number;
};

export const MAX_STROKES_PER_BLOCK = 2000;
export const DEFAULT_CANVAS_MIN_HEIGHT = 360;

export function newHandwritingKey(): string {
  return `hw-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function newStrokeId(): string {
  return `st-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function sanitizePoint(raw: unknown): HandwritingPoint | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  if (typeof p.x !== 'number' || typeof p.y !== 'number') return null;
  const out: HandwritingPoint = { x: clamp01(p.x), y: clamp01(p.y) };
  if (typeof p.pressure === 'number' && Number.isFinite(p.pressure)) {
    out.pressure = Math.max(0, Math.min(1, p.pressure));
  }
  if (typeof p.t === 'number' && Number.isFinite(p.t)) out.t = p.t;
  return out;
}

function sanitizeStroke(raw: unknown): HandwritingStroke | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Record<string, unknown>;
  if (typeof s.id !== 'string' || !s.id) return null;
  const tool = s.tool === 'eraser' ? 'eraser' : 'pen';
  const color = typeof s.color === 'string' && s.color ? s.color : '#1a1a1a';
  const width = typeof s.width === 'number' && s.width > 0 ? s.width : 2.5;
  const pointsRaw = Array.isArray(s.points) ? s.points : [];
  const points = pointsRaw
    .map(sanitizePoint)
    .filter((p): p is HandwritingPoint => p !== null);
  if (points.length === 0) return null;
  return { id: s.id, tool, color, width, points };
}

export function isHandwritingBlockData(raw: unknown): raw is HandwritingBlockData {
  return sanitizeHandwritingData(raw) !== null;
}

export function sanitizeHandwritingData(raw: unknown): HandwritingBlockData | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const strokesRaw = Array.isArray(r.strokes) ? r.strokes : [];
  const strokes = strokesRaw
    .map(sanitizeStroke)
    .filter((s): s is HandwritingStroke => s !== null)
    .slice(0, MAX_STROKES_PER_BLOCK);
  const canvasRaw = r.canvas;
  let width = DEFAULT_CANVAS_MIN_HEIGHT;
  let height = DEFAULT_CANVAS_MIN_HEIGHT;
  if (canvasRaw && typeof canvasRaw === 'object') {
    const c = canvasRaw as Record<string, unknown>;
    if (typeof c.width === 'number' && c.width > 0) width = c.width;
    if (typeof c.height === 'number' && c.height > 0) height = c.height;
  }
  const updatedAt = typeof r.updatedAt === 'number' && Number.isFinite(r.updatedAt) ? r.updatedAt : Date.now();
  return { type: 'handwriting', strokes, canvas: { width, height }, updatedAt };
}

export function emptyHandwritingData(width: number, height: number): HandwritingBlockData {
  return {
    type: 'handwriting',
    strokes: [],
    canvas: {
      width: Math.max(1, width),
      height: Math.max(1, height),
    },
    updatedAt: Date.now(),
  };
}

/** Collect ::hw::keys:: referenced in notebook body lines. */
export function referencedHandwritingKeys(body: string): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const line of body.split(/\r?\n/)) {
    const m = line.trim().match(/^::hw::([a-z0-9-]+)::$/);
    if (!m?.[1] || seen.has(m[1])) continue;
    seen.add(m[1]);
    keys.push(m[1]);
  }
  return keys;
}
