import type { DeskComputeHistoryEntry, DeskFormulaItem, DeskLayoutState } from './types';
import type { DeskZoneId } from './types';

const DESK_ZONES: DeskZoneId[] = ['formula', 'compute', 'graph', 'scratch'];

function trimCap(s: unknown, max: number): string | undefined {
  if (typeof s !== 'string') return undefined;
  const t = s.trim();
  if (!t) return undefined;
  return t.length > max ? t.slice(0, max) : t;
}

export function sanitizeDeskFormulas(raw: unknown): DeskFormulaItem[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: DeskFormulaItem[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const id = typeof r.id === 'string' && r.id ? r.id : '';
    const topic = trimCap(r.topic, 120);
    const formula = trimCap(r.formula, 500);
    if (!id || !topic || !formula) continue;
    const now = Date.now();
    const createdAt =
      typeof r.createdAt === 'number' && Number.isFinite(r.createdAt) ? r.createdAt : now;
    const updatedAt =
      typeof r.updatedAt === 'number' && Number.isFinite(r.updatedAt) ? r.updatedAt : createdAt;
    out.push({
      id,
      topic,
      formula,
      meaning: trimCap(r.meaning, 400),
      whenToUse: trimCap(r.whenToUse, 400),
      remember: trimCap(r.remember, 400),
      createdAt,
      updatedAt,
    });
  }
  return out.length ? out : undefined;
}

export function sanitizeDeskLayout(raw: unknown): DeskLayoutState | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const c = r.collapsed;
  if (!c || typeof c !== 'object') return undefined;
  const collapsed: Partial<Record<DeskZoneId, boolean>> = {};
  for (const z of DESK_ZONES) {
    const v = (c as Record<string, unknown>)[z];
    if (typeof v === 'boolean') collapsed[z] = v;
  }
  return Object.keys(collapsed).length ? { collapsed } : undefined;
}

export function sanitizeDeskComputeHistory(raw: unknown): DeskComputeHistoryEntry[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: DeskComputeHistoryEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const expr = trimCap(r.expr, 200);
    const result = trimCap(r.result, 120);
    if (!expr || !result) continue;
    out.push({ expr, result });
  }
  return out.length ? out.slice(-8) : undefined;
}

export function sanitizeDeskGraphExpression(raw: unknown): string | undefined {
  return trimCap(raw, 200);
}

export function sanitizeDeskScratch(raw: unknown): string | undefined {
  return trimCap(raw, 8000);
}
