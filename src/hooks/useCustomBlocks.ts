import { useState, useCallback } from 'react';
import type { ModuleSize } from './useWorkspaceLayout';
import type { AccentPreset, SurfaceStyle, BorderStyle } from './useWorkspaceTheme';

// ── Types ─────────────────────────────────────────────────────────────────────

export type BlockType =
  | 'text' | 'quote' | 'image' | 'link'
  | 'checklist' | 'divider' | 'emoji' | 'note';

export interface ChecklistItem {
  id:      string;
  text:    string;
  checked: boolean;
}

export type BlockContent =
  | { type: 'text';      body: string; align?: 'left' | 'center' | 'right' }
  | { type: 'quote';     body: string; author?: string }
  | { type: 'image';     url: string;  alt?: string; caption?: string }
  | { type: 'link';      title: string; url: string; description?: string }
  | { type: 'checklist'; items: ChecklistItem[] }
  | { type: 'divider';   style?: 'line' | 'dots' | 'gradient' }
  | { type: 'emoji';     emoji: string; label?: string; size?: 'sm' | 'md' | 'lg' | 'xl' }
  | { type: 'note';      body: string };

// Intentionally mirrors ModuleTheme so the inspector reuses the same controls
export interface BlockTheme {
  customTitle?:  string;
  accentPreset?: AccentPreset;
  accentCustom?: string;
  surfaceStyle?: SurfaceStyle;
  opacity?:      number;
  glowEnabled?:  boolean;
  borderStyle?:  BorderStyle;
}

export interface CustomBlock {
  id:        string;
  type:      BlockType;
  size:      ModuleSize;
  order:     number;
  content:   BlockContent;
  theme?:    BlockTheme;
  createdAt: number;
}

// ── Metadata (icon, label, description, default size) ─────────────────────────

export const BLOCK_META: Record<BlockType, {
  label: string; icon: string; description: string; defaultSize: ModuleSize;
}> = {
  text:      { label: 'Text Block',      icon: '✏️', description: 'Write anything, freely',         defaultSize: 'half'       },
  quote:     { label: 'Quote',           icon: '❝',  description: 'Highlight an inspiring thought', defaultSize: 'two-thirds' },
  image:     { label: 'Image',           icon: '🖼️', description: 'Display an image by URL',        defaultSize: 'half'       },
  link:      { label: 'Link Card',       icon: '🔗', description: 'Bookmark a URL with preview',    defaultSize: 'third'      },
  checklist: { label: 'Checklist',       icon: '✅', description: 'Personal quick checklist',       defaultSize: 'half'       },
  divider:   { label: 'Divider',         icon: '—',  description: 'Visual section break',           defaultSize: 'full'       },
  emoji:     { label: 'Emoji / Sticker', icon: '✨', description: 'Big emoji for personality',      defaultSize: 'third'      },
  note:      { label: 'Note Card',       icon: '📝', description: 'Blank note — write anything',    defaultSize: 'half'       },
};

// ── Default content per type ──────────────────────────────────────────────────

function makeDefaultContent(type: BlockType): BlockContent {
  switch (type) {
    case 'text':      return { type: 'text',      body: '',   align: 'left' };
    case 'quote':     return { type: 'quote',     body: '',   author: '' };
    case 'image':     return { type: 'image',     url: '' };
    case 'link':      return { type: 'link',      title: 'Untitled Link', url: '' };
    case 'checklist': return { type: 'checklist', items: [] };
    case 'divider':   return { type: 'divider',   style: 'gradient' };
    case 'emoji':     return { type: 'emoji',     emoji: '✨', size: 'lg' };
    case 'note':      return { type: 'note',      body: '' };
  }
}

// ── Persistence ───────────────────────────────────────────────────────────────

const STORAGE_KEY = 'fw_custom_blocks_v1';
// NOTE: Replace localStorage.setItem/getItem with Supabase calls to migrate to cloud persistence.

function load(): CustomBlock[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function persist(blocks: CustomBlock[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(blocks));
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useCustomBlocks() {
  const [blocks, setBlocks] = useState<CustomBlock[]>(load);

  const addBlock = useCallback((type: BlockType): string => {
    const id = `block-${type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setBlocks(prev => {
      const maxOrder = prev.length > 0 ? Math.max(...prev.map(b => b.order)) : -1;
      const block: CustomBlock = {
        id, type,
        size:      BLOCK_META[type].defaultSize,
        order:     maxOrder + 1,
        content:   makeDefaultContent(type),
        // Pre-set customTitle so the inspector preview shows a nice label right away
        theme:     { customTitle: BLOCK_META[type].label },
        createdAt: Date.now(),
      };
      const next = [...prev, block];
      persist(next);
      return next;
    });
    return id;
  }, []);

  const updateContent = useCallback((id: string, content: BlockContent) => {
    setBlocks(prev => {
      const next = prev.map(b => b.id === id ? { ...b, content } : b);
      persist(next);
      return next;
    });
  }, []);

  const updateTheme = useCallback((id: string, patch: Partial<BlockTheme>) => {
    setBlocks(prev => {
      const next = prev.map(b =>
        b.id === id ? { ...b, theme: { ...b.theme, ...patch } } : b
      );
      persist(next);
      return next;
    });
  }, []);

  const setBlockSize = useCallback((id: string, size: ModuleSize) => {
    setBlocks(prev => {
      const next = prev.map(b => b.id === id ? { ...b, size } : b);
      persist(next);
      return next;
    });
  }, []);

  const deleteBlock = useCallback((id: string) => {
    setBlocks(prev => {
      const next = prev.filter(b => b.id !== id);
      persist(next);
      return next;
    });
  }, []);

  const duplicateBlock = useCallback((id: string): string => {
    const newId = `block-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setBlocks(prev => {
      const src = prev.find(b => b.id === id);
      if (!src) return prev;
      const maxOrder = prev.length > 0 ? Math.max(...prev.map(b => b.order)) : 0;
      const copy: CustomBlock = { ...src, id: newId, order: maxOrder + 1, createdAt: Date.now() };
      const next = [...prev, copy];
      persist(next);
      return next;
    });
    return newId;
  }, []);

  const reorderBlocks = useCallback((fromId: string, toId: string) => {
    setBlocks(prev => {
      const arr = [...prev].sort((a, b) => a.order - b.order);
      const fi = arr.findIndex(b => b.id === fromId);
      const ti = arr.findIndex(b => b.id === toId);
      if (fi === -1 || ti === -1 || fi === ti) return prev;
      const [moved] = arr.splice(fi, 1);
      arr.splice(ti, 0, moved);
      const next = arr.map((b, i) => ({ ...b, order: i }));
      persist(next);
      return next;
    });
  }, []);

  const sorted = [...blocks].sort((a, b) => a.order - b.order);

  return {
    blocks: sorted,
    addBlock,
    updateContent,
    updateTheme,
    setBlockSize,
    deleteBlock,
    duplicateBlock,
    reorderBlocks,
  };
}
