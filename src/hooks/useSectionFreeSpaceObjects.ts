import { useState, useCallback } from 'react';
import type { ChecklistItem } from './useCustomBlocks';

export type ProjectObjectType = 'notebook' | 'note' | 'link' | 'checklist' | 'image';

export type ProjectObjectContent =
  | { type: 'notebook'; body: string }
  | { type: 'note'; body: string }
  | { type: 'link'; title: string; url: string; description?: string }
  | { type: 'checklist'; items: ChecklistItem[] }
  | { type: 'image'; url: string; alt?: string; caption?: string };

export interface ProjectSpaceObject {
  id: string;
  type: ProjectObjectType;
  title: string;
  content: ProjectObjectContent;
  createdAt: number;
  updatedAt: number;
}

function key(sectionId: string): string {
  return `fw_section_${sectionId}_free_space_objects_v1`;
}

function load(sectionId: string): ProjectSpaceObject[] {
  try {
    const raw = localStorage.getItem(key(sectionId));
    return raw ? (JSON.parse(raw) as ProjectSpaceObject[]) : [];
  } catch {
    return [];
  }
}

function persist(sectionId: string, objects: ProjectSpaceObject[]): void {
  try { localStorage.setItem(key(sectionId), JSON.stringify(objects)); } catch { /* quota */ }
}

function uid(type: ProjectObjectType): string {
  return `ps-${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function makeDefaults(type: ProjectObjectType): { title: string; content: ProjectObjectContent } {
  switch (type) {
    case 'notebook': return { title: 'Notebook', content: { type: 'notebook', body: '' } };
    case 'note': return { title: 'Note', content: { type: 'note', body: '' } };
    case 'link': return { title: 'Reference Link', content: { type: 'link', title: 'Untitled link', url: '' } };
    case 'checklist': return { title: 'Checklist', content: { type: 'checklist', items: [] } };
    case 'image': return { title: 'Image', content: { type: 'image', url: '' } };
  }
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

