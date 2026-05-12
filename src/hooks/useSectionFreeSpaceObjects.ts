import { useState, useCallback, useEffect } from 'react';
import type { ChecklistItem } from './useCustomBlocks';
import { fwPersistWarn } from '../lib/freeSpacePersistence';

export type ProjectObjectType =
  | 'notebook'
  | 'note'
  | 'link'
  | 'checklist'
  | 'image'
  | 'calculator'
  | 'graph';

export type CalculatorHistoryEntry = { expr: string; result: string };

export type ProjectObjectContent =
  | { type: 'notebook'; body: string; paperStyle: 'blank' | 'ruled' | 'grid' }
  | { type: 'note'; body: string }
  | { type: 'link'; title: string; url: string; description?: string }
  | { type: 'checklist'; items: ChecklistItem[] }
  | { type: 'image'; url: string; alt?: string; caption?: string }
  | { type: 'calculator'; input: string; history: CalculatorHistoryEntry[] }
  | {
      type: 'graph';
      expression: string;
      xmin: number;
      xmax: number;
      ymin: number;
      ymax: number;
    };

export interface ProjectSpaceObject {
  id: string;
  type: ProjectObjectType;
  title: string;
  content: ProjectObjectContent;
  /** Other Free Space object ids this object is linked to (directed; persisted in localStorage). */
  connections?: string[];
  createdAt: number;
  updatedAt: number;
}

const OBJECT_TYPES = new Set<ProjectObjectType>([
  'notebook',
  'note',
  'link',
  'checklist',
  'image',
  'calculator',
  'graph',
]);

function key(sectionId: string): string {
  return `fw_section_${sectionId}_free_space_objects_v1`;
}

function uid(type: ProjectObjectType): string {
  return `ps-${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function makeDefaults(type: ProjectObjectType): { title: string; content: ProjectObjectContent } {
  switch (type) {
    case 'notebook': return { title: 'Notebook', content: { type: 'notebook', body: '', paperStyle: 'ruled' } };
    case 'note': return { title: 'Note', content: { type: 'note', body: '' } };
    case 'link': return { title: 'Reference Link', content: { type: 'link', title: 'Untitled link', url: '' } };
    case 'checklist': return { title: 'Checklist', content: { type: 'checklist', items: [] } };
    case 'image': return { title: 'Image', content: { type: 'image', url: '' } };
    case 'calculator':
      return { title: 'Calculator', content: { type: 'calculator', input: '', history: [] } };
    case 'graph':
      return {
        title: 'Graph',
        content: {
          type: 'graph',
          expression: 'x^2',
          xmin: -6,
          xmax: 6,
          ymin: -4,
          ymax: 8,
        },
      };
  }
}

function numOr(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeHistoryEntry(raw: unknown): CalculatorHistoryEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const expr = typeof o.expr === 'string' ? o.expr : '';
  const result = typeof o.result === 'string' ? o.result : '';
  if (!expr && !result) return null;
  return { expr, result };
}

function normalizeChecklistItem(raw: unknown): ChecklistItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === 'string' && o.id ? o.id : `chk-${Math.random().toString(36).slice(2, 9)}`;
  const text = typeof o.text === 'string' ? o.text : '';
  const checked = typeof o.checked === 'boolean' ? o.checked : false;
  return { id, text, checked };
}

/**
 * Returns canonical content for a Free Space object type. Use after loading from storage
 * or in the renderer so malformed JSON never crashes the UI.
 */
export function ensureProjectObjectContent(type: ProjectObjectType, raw: unknown): ProjectObjectContent {
  const defaults = makeDefaults(type).content;
  if (!raw || typeof raw !== 'object') return defaults;
  const r = raw as Record<string, unknown>;
  if (r.type !== type) return defaults;

  switch (type) {
    case 'notebook': {
      const body = typeof r.body === 'string' ? r.body : '';
      const ps = r.paperStyle;
      const paperStyle =
        ps === 'blank' || ps === 'ruled' || ps === 'grid' ? ps : 'ruled';
      return { type: 'notebook', body, paperStyle };
    }
    case 'note':
      return { type: 'note', body: typeof r.body === 'string' ? r.body : '' };
    case 'link': {
      const title = typeof r.title === 'string' ? r.title : 'Untitled link';
      const url = typeof r.url === 'string' ? r.url : '';
      const description = typeof r.description === 'string' ? r.description : undefined;
      return description !== undefined
        ? { type: 'link', title, url, description }
        : { type: 'link', title, url };
    }
    case 'checklist': {
      const itemsRaw = Array.isArray(r.items) ? r.items : [];
      const items = itemsRaw.map(normalizeChecklistItem).filter((x): x is ChecklistItem => x !== null);
      return { type: 'checklist', items };
    }
    case 'image': {
      const url = typeof r.url === 'string' ? r.url : '';
      const alt = typeof r.alt === 'string' ? r.alt : undefined;
      const caption = typeof r.caption === 'string' ? r.caption : undefined;
      return { type: 'image', url, alt, caption };
    }
    case 'calculator': {
      const input = typeof r.input === 'string' ? r.input : '';
      const histRaw = Array.isArray(r.history) ? r.history : [];
      const history = histRaw.map(normalizeHistoryEntry).filter((x): x is CalculatorHistoryEntry => x !== null);
      return { type: 'calculator', input, history };
    }
    case 'graph': {
      const g = makeDefaults('graph').content as Extract<ProjectObjectContent, { type: 'graph' }>;
      const expression = typeof r.expression === 'string' ? r.expression : g.expression;
      return {
        type: 'graph',
        expression,
        xmin: numOr(r.xmin, g.xmin),
        xmax: numOr(r.xmax, g.xmax),
        ymin: numOr(r.ymin, g.ymin),
        ymax: numOr(r.ymax, g.ymax),
      };
    }
  }
}

function normalizeProjectSpaceObject(raw: unknown): ProjectSpaceObject | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === 'string' && o.id ? o.id : null;
  const type = typeof o.type === 'string' && OBJECT_TYPES.has(o.type as ProjectObjectType)
    ? (o.type as ProjectObjectType)
    : null;
  if (!id || !type) return null;

  const d = makeDefaults(type);
  const title = typeof o.title === 'string' && o.title.trim() ? o.title : d.title;
  const content = ensureProjectObjectContent(type, o.content);
  const createdAt = typeof o.createdAt === 'number' && Number.isFinite(o.createdAt) ? o.createdAt : Date.now();
  const updatedAt = typeof o.updatedAt === 'number' && Number.isFinite(o.updatedAt) ? o.updatedAt : createdAt;

  return { id, type, title, content, createdAt, updatedAt };
}

/**
 * Coerce persisted `connections` to id strings. Never treat a string as iterable for spread —
 * `[...connections, id]` would expand a string into single characters and corrupt storage.
 */
export function coerceFreeSpaceConnectionIds(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const x of raw) {
      if (typeof x !== 'string' || !x.trim()) continue;
      const id = x.trim();
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
    return out;
  }
  if (typeof raw === 'string' && raw.trim()) {
    const s = raw.trim();
    if (s.includes(',')) {
      const parts = s.split(',').map(p => p.trim()).filter(Boolean);
      const seen = new Set<string>();
      const out: string[] = [];
      for (const id of parts) {
        if (seen.has(id)) continue;
        seen.add(id);
        out.push(id);
      }
      return out;
    }
    return [s];
  }
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const vals = Object.values(raw as Record<string, unknown>).filter(
      (v): v is string => typeof v === 'string' && v.trim() !== '',
    );
    return coerceFreeSpaceConnectionIds(vals);
  }
  return [];
}

function normalizeConnectionsField(selfId: string, raw: unknown, validIds: Set<string>): string[] | undefined {
  const base = coerceFreeSpaceConnectionIds(raw);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of base) {
    if (id === selfId || !validIds.has(id)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out.length ? out : undefined;
}

function pruneConnectionsFromObjects(objects: ProjectSpaceObject[], removedId: string): ProjectSpaceObject[] {
  return objects.map(o => {
    const prevList = coerceFreeSpaceConnectionIds(o.connections);
    const next = prevList.filter(cid => cid !== removedId && cid !== o.id);
    if (next.length === prevList.length) return o;
    return {
      ...o,
      connections: next.length ? next : undefined,
      updatedAt: Date.now(),
    };
  });
}

function load(sectionId: string): ProjectSpaceObject[] {
  if (!sectionId) return [];
  try {
    const raw = localStorage.getItem(key(sectionId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      fwPersistWarn(
        `Free Space objects for section "${sectionId}" were not a JSON array; showing an empty canvas until storage is fixed (key: ${key(sectionId)}). Use __FW_RESET_FREE_SPACE__() after backing up if needed.`,
      );
      return [];
    }

    const staged: ProjectSpaceObject[] = [];
    const rawRows: unknown[] = [];
    let needsWrite = false;
    for (const item of parsed) {
      const n = normalizeProjectSpaceObject(item);
      if (!n) {
        needsWrite = true;
        continue;
      }
      staged.push(n);
      rawRows.push(item);
    }
    const validIds = new Set(staged.map(o => o.id));
    const normalized: ProjectSpaceObject[] = staged.map((o, i) => {
      const rawConn = (rawRows[i] && typeof rawRows[i] === 'object')
        ? (rawRows[i] as Record<string, unknown>).connections
        : undefined;
      const connections = normalizeConnectionsField(o.id, rawConn, validIds);
      const merged = { ...o, connections };
      if (JSON.stringify(merged) !== JSON.stringify(staged[i])) needsWrite = true;
      return merged;
    });
    if (needsWrite) {
      fwPersistWarn(`Repaired Free Space objects for section "${sectionId}" (${parsed.length} rows → ${normalized.length} valid); rewriting storage.`);
      try {
        localStorage.setItem(key(sectionId), JSON.stringify(normalized));
      } catch { /* quota */ }
    }
    return normalized;
  } catch (e) {
    fwPersistWarn(`Free Space objects JSON unreadable for section "${sectionId}": ${String(e)}`);
    return [];
  }
}

function persist(sectionId: string, objects: ProjectSpaceObject[]): void {
  if (!sectionId) return;
  try {
    localStorage.setItem(key(sectionId), JSON.stringify(objects));
  } catch { /* quota */ }
}

export interface SectionFreeSpaceObjectsState {
  objects: ProjectSpaceObject[];
  addObject: (type: ProjectObjectType) => ProjectSpaceObject;
  /** One persist write: new note with title + body (avoids batched add+patch races). */
  addQuickCaptureNote: (body: string) => ProjectSpaceObject;
  updateObjectContent: (id: string, content: ProjectObjectContent) => void;
  /** Update title and/or content in one persist write (e.g. quick capture). */
  updateObjectFields: (id: string, fields: { title?: string; content?: ProjectObjectContent }) => void;
  addConnection: (fromId: string, toId: string) => void;
  clearConnectionsForObject: (id: string) => void;
  removeObject: (id: string) => void;
  duplicateObject: (id: string) => ProjectSpaceObject | null;
  getObject: (id: string) => ProjectSpaceObject | undefined;
}

export function useSectionFreeSpaceObjects(sectionId: string): SectionFreeSpaceObjectsState {
  const [objects, setObjects] = useState<ProjectSpaceObject[]>(() => load(sectionId));

  useEffect(() => {
    setObjects(load(sectionId));
  }, [sectionId]);

  const addObject = useCallback((type: ProjectObjectType): ProjectSpaceObject => {
    const d = makeDefaults(type);
    const now = Date.now();
    const obj: ProjectSpaceObject = {
      id: uid(type),
      type,
      title: d.title,
      content: d.content,
      createdAt: now,
      updatedAt: now,
    };
    setObjects(prev => {
      const next = [...prev, obj];
      persist(sectionId, next);
      return next;
    });
    return obj;
  }, [sectionId]);

  const addQuickCaptureNote = useCallback((rawBody: string): ProjectSpaceObject => {
    const trimmed = rawBody.trim();
    const firstLine = trimmed.split(/\n/)[0]?.trim() ?? trimmed;
    const title = firstLine.length > 56 ? `${firstLine.slice(0, 54)}…` : (firstLine || 'Note');
    const now = Date.now();
    const obj: ProjectSpaceObject = {
      id: uid('note'),
      type: 'note',
      title,
      content: { type: 'note', body: trimmed },
      createdAt: now,
      updatedAt: now,
    };
    setObjects(prev => {
      const next = [...prev, obj];
      persist(sectionId, next);
      return next;
    });
    return obj;
  }, [sectionId]);

  const updateObjectContent = useCallback((id: string, content: ProjectObjectContent) => {
    setObjects(prev => {
      const next = prev.map(o => o.id === id ? { ...o, content, updatedAt: Date.now() } : o);
      persist(sectionId, next);
      return next;
    });
  }, [sectionId]);

  const updateObjectFields = useCallback(
    (objectId: string, fields: { title?: string; content?: ProjectObjectContent }) => {
      setObjects(prev => {
        const i = prev.findIndex(o => o.id === objectId);
        if (i === -1) return prev;
        const o = prev[i];
        const nextObj: ProjectSpaceObject = {
          ...o,
          ...(fields.title !== undefined ? { title: fields.title } : {}),
          ...(fields.content !== undefined ? { content: fields.content } : {}),
          updatedAt: Date.now(),
        };
        const next = [...prev.slice(0, i), nextObj, ...prev.slice(i + 1)];
        persist(sectionId, next);
        return next;
      });
    },
    [sectionId],
  );

  const addConnection = useCallback((fromId: string, toId: string) => {
    if (!fromId || !toId || fromId === toId) return;
    setObjects(prev => {
      const idSet = new Set(prev.map(o => o.id));
      if (!idSet.has(fromId) || !idSet.has(toId)) return prev;
      const fromObj = prev.find(o => o.id === fromId);
      const toObj = prev.find(o => o.id === toId);
      if (!fromObj || !toObj) return prev;
      const fromList = coerceFreeSpaceConnectionIds(fromObj.connections);
      const toList = coerceFreeSpaceConnectionIds(toObj.connections);
      // Same directed edge, or reverse (same undirected pair)
      if (fromList.includes(toId) || toList.includes(fromId)) return prev;
      const next = prev.map(o => {
        if (o.id !== fromId) return o;
        const cur = coerceFreeSpaceConnectionIds(o.connections);
        if (cur.includes(toId)) return o;
        return { ...o, connections: [...cur, toId], updatedAt: Date.now() };
      });
      persist(sectionId, next);
      return next;
    });
  }, [sectionId]);

  const clearConnectionsForObject = useCallback((id: string) => {
    if (!id) return;
    setObjects(prev => {
      const next = prev.map(o => {
        if (o.id === id) {
          const cur = coerceFreeSpaceConnectionIds(o.connections);
          if (cur.length === 0) return o;
          return { ...o, connections: undefined, updatedAt: Date.now() };
        }
        const prevList = coerceFreeSpaceConnectionIds(o.connections);
        const filtered = prevList.filter(cid => cid !== id);
        if (filtered.length === prevList.length) return o;
        return {
          ...o,
          connections: filtered.length ? filtered : undefined,
          updatedAt: Date.now(),
        };
      });
      persist(sectionId, next);
      return next;
    });
  }, [sectionId]);

  const removeObject = useCallback((id: string) => {
    setObjects(prev => {
      const rest = prev.filter(o => o.id !== id);
      const next = pruneConnectionsFromObjects(rest, id);
      persist(sectionId, next);
      return next;
    });
  }, [sectionId]);

  const duplicateObject = useCallback((id: string): ProjectSpaceObject | null => {
    const source = objects.find(o => o.id === id);
    if (!source) return null;
    const now = Date.now();
    const validTargets = new Set(objects.map(o => o.id));
    const dupConnections = coerceFreeSpaceConnectionIds(source.connections).filter(
      cid => cid !== id && cid !== source.id && validTargets.has(cid),
    );
    const copy: ProjectSpaceObject = {
      ...source,
      id: uid(source.type),
      createdAt: now,
      updatedAt: now,
      connections: dupConnections.length ? dupConnections : undefined,
    };
    setObjects(prev => {
      const next = [...prev, copy];
      persist(sectionId, next);
      return next;
    });
    return copy;
  }, [objects, sectionId]);

  const getObject = useCallback((id: string) => objects.find(o => o.id === id), [objects]);

  return {
    objects,
    addObject,
    addQuickCaptureNote,
    updateObjectContent,
    updateObjectFields,
    addConnection,
    clearConnectionsForObject,
    removeObject,
    duplicateObject,
    getObject,
  };
}
