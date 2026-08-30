/**
 * Production Free Space Add menu registry.
 *
 * Kept free of React / env gates so tests can prove `sheet` ships in
 * normal production builds (not DEV-only).
 */
import type { ProjectObjectType } from '../hooks/useSectionFreeSpaceObjects';

export type FreeSpacePaletteItemId =
  | ProjectObjectType
  | 'recall'
  | 'tutor'
  | 'quick-review'
  | 'math-notebook'
  | 'math-setup';

export type FreeSpacePaletteIconKey =
  | 'note'
  | 'notebook'
  | 'math-notebook'
  | 'pdf'
  | 'checklist'
  | 'mistake'
  | 'recall'
  | 'tutor'
  | 'quick-review'
  | 'math-setup'
  | 'calculator'
  | 'graph'
  | 'sheet'
  | 'link'
  | 'image';

export type FreeSpacePaletteItemDef = {
  id: FreeSpacePaletteItemId;
  title: string;
  description: string;
  iconKey: FreeSpacePaletteIconKey;
};

export type FreeSpacePaletteGroupDef = {
  label: string;
  items: FreeSpacePaletteItemDef[];
};

/** Canonical Add-to-Free-Space palette. Must include Sheet under Tools in production. */
export const FREE_SPACE_TOOL_PALETTE_GROUPS: FreeSpacePaletteGroupDef[] = [
  {
    label: 'Core',
    items: [
      {
        id: 'note',
        title: 'Note',
        description: 'Capture a quick idea or summary.',
        iconKey: 'note',
      },
      {
        id: 'notebook',
        title: 'Notebook',
        description: 'A larger writing surface for study.',
        iconKey: 'notebook',
      },
      {
        id: 'math-notebook',
        title: 'Math notebook',
        description: 'Formulas, steps, and derivations — math lives in notebooks.',
        iconKey: 'math-notebook',
      },
      {
        id: 'pdf',
        title: 'PDF / Source',
        description: 'Add source material to read beside notes.',
        iconKey: 'pdf',
      },
      {
        id: 'checklist',
        title: 'Checklist',
        description: 'Break work into small steps.',
        iconKey: 'checklist',
      },
    ],
  },
  {
    label: 'Study',
    items: [
      {
        id: 'mistake',
        title: 'Mistake',
        description: 'Track slips and corrections.',
        iconKey: 'mistake',
      },
      {
        id: 'recall',
        title: 'Flashcard / Recall',
        description: 'Create a prompt to review later.',
        iconKey: 'recall',
      },
      {
        id: 'tutor',
        title: 'Tutor',
        description: 'Open a companion tutor panel.',
        iconKey: 'tutor',
      },
      {
        id: 'quick-review',
        title: 'Quick Review',
        description: 'Review mistakes and recall cards.',
        iconKey: 'quick-review',
      },
      {
        id: 'math-setup',
        title: 'Problem layout',
        description: 'Problem card + derivation + scratch notebooks on the canvas.',
        iconKey: 'math-setup',
      },
    ],
  },
  {
    label: 'Tools',
    items: [
      {
        id: 'calculator',
        title: 'Calculator',
        description: 'Use a math scratchpad.',
        iconKey: 'calculator',
      },
      {
        id: 'graph',
        title: 'Graph',
        description: 'Plot and inspect an equation.',
        iconKey: 'graph',
      },
      {
        id: 'sheet',
        title: 'Sheet',
        description: 'Create a spreadsheet for data and calculations.',
        iconKey: 'sheet',
      },
      {
        id: 'link',
        title: 'Link',
        description: 'Save a reference URL.',
        iconKey: 'link',
      },
      {
        id: 'image',
        title: 'Image',
        description: 'Place a visual reference.',
        iconKey: 'image',
      },
    ],
  },
];

export function getFreeSpacePaletteToolsGroup(): FreeSpacePaletteGroupDef {
  const tools = FREE_SPACE_TOOL_PALETTE_GROUPS.find(g => g.label === 'Tools');
  if (!tools) throw new Error('Free Space palette missing Tools group');
  return tools;
}

export function freeSpacePaletteIncludesSheet(): boolean {
  return FREE_SPACE_TOOL_PALETTE_GROUPS.some(g => g.items.some(i => i.id === 'sheet'));
}

/** Object types created via handleAddToSpace (not special-cased palette actions). */
export function isDirectFreeSpaceObjectCreateId(
  id: FreeSpacePaletteItemId,
): id is ProjectObjectType {
  return (
    id !== 'recall' &&
    id !== 'tutor' &&
    id !== 'quick-review' &&
    id !== 'math-notebook' &&
    id !== 'math-setup'
  );
}
