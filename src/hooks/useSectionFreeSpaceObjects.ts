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

    const normalized: ProjectSpaceObject[] = [];
    let needsWrite = false;
    for (const item of parsed) {
      const n = normalizeProjectSpaceObject(item);
      if (!n) {
        needsWrite = true;
        continue;
      }
      if (JSON.stringify(n) !== JSON.stringify(item)) needsWrite = true;
      normalized.push(n);
    }
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
  updateObjectContent: (id: string, content: ProjectObjectContent) => void;
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

  const updateObjectContent = useCallback((id: string, content: ProjectObjectContent) => {
    setObjects(prev => {
      const next = prev.map(o => o.id === id ? { ...o, content, updatedAt: Date.now() } : o);
      persist(sectionId, next);
      return next;
    });
  }, [sectionId]);

  const removeObject = useCallback((id: string) => {
    setObjects(prev => {
      const next = prev.filter(o => o.id !== id);
      persist(sectionId, next);
      return next;
    });
  }, [sectionId]);

  const duplicateObject = useCallback((id: string): ProjectSpaceObject | null => {
    const source = objects.find(o => o.id === id);
    if (!source) return null;
    const now = Date.now();
    const copy: ProjectSpaceObject = {
      ...source,
      id: uid(source.type),
      createdAt: now,
      updatedAt: now,
    };
    setObjects(prev => {
      const next = [...prev, copy];
      persist(sectionId, next);
      return next;
    });
    return copy;
  }, [objects, sectionId]);

  const getObject = useCallback((id: string) => objects.find(o => o.id === id), [objects]);

  return { objects, addObject, updateObjectContent, removeObject, duplicateObject, getObject };
}
