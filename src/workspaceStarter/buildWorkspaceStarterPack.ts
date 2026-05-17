import type { BlockPos } from '../hooks/useBlockPositions';
import type {
  ProjectObjectType,
  ProjectSpaceObject,
  ProjectObjectContent,
} from '../hooks/useSectionFreeSpaceObjects';
import type { WorkspaceStarterId } from './workspaceStarterTypes';
import { WORKSPACE_STARTER_FOCUS } from './workspaceStarterTypes';
import type { FocusMode } from '../focusMode/focusModeTypes';

export interface WorkspaceStarterPack {
  objects: ProjectSpaceObject[];
  positions: Record<string, BlockPos>;
  focusSuggestion: FocusMode;
  hints: string[];
}

let idCounter = 0;

function newId(type: ProjectObjectType): string {
  idCounter += 1;
  return `ps-${type}-${Date.now()}-${idCounter}-${Math.random().toString(36).slice(2, 6)}`;
}

function obj(
  type: ProjectObjectType,
  title: string,
  content: ProjectObjectContent,
  createdAt: number,
  connections?: string[],
): ProjectSpaceObject {
  return {
    id: newId(type),
    type,
    title,
    content,
    createdAt,
    updatedAt: createdAt,
    ...(connections?.length ? { connections } : {}),
  };
}

/**
 * Pure builder: objects, positions, focus hint, ephemeral UI hints.
 * No persistence; caller merges into section state.
 */
export function buildWorkspaceStarterPack(starterId: WorkspaceStarterId): WorkspaceStarterPack {
  const t0 = Date.now();
  let tick = 0;
  const at = () => {
    tick += 1;
    return t0 + tick;
  };

  const focusSuggestion = WORKSPACE_STARTER_FOCUS[starterId];

  switch (starterId) {
    case 'exam-prep': {
      const notebook = obj('notebook', 'Study notes', { type: 'notebook', body: '', paperStyle: 'ruled' }, at());
      const objects = [notebook];
      const positions: Record<string, BlockPos> = {
        [notebook.id]: { x: 420, y: 160, w: 560, h: 440 },
      };
      return {
        objects,
        positions,
        focusSuggestion,
        hints: [
          'Start with notes, then add mistakes, tools, or sources only when you need them.',
          'Review Focus quiets the room without flattening the spatial desk.',
        ],
      };
    }

    case 'deep-reading': {
      const notebook = obj('notebook', 'Margin notes', { type: 'notebook', body: '', paperStyle: 'ruled' }, at());
      const objects = [notebook];
      const positions: Record<string, BlockPos> = {
        [notebook.id]: { x: 420, y: 160, w: 560, h: 440 },
      };
      return {
        objects,
        positions,
        focusSuggestion,
        hints: [
          'Add a PDF/source from the plus menu when you are ready to read beside your notes.',
          'Reading Focus tightens the room around what you are reading.',
        ],
      };
    }

    case 'problem-solving': {
      const notebook = obj('notebook', 'Workings', { type: 'notebook', body: '', paperStyle: 'grid' }, at());
      const objects = [notebook];
      const positions: Record<string, BlockPos> = {
        [notebook.id]: { x: 420, y: 160, w: 560, h: 440 },
      };
      return {
        objects,
        positions,
        focusSuggestion,
        hints: [
          'Add calculator, graph, or mistake cards from the plus menu when the problem needs them.',
          'Solving Focus lifts your working area without flattening the room.',
        ],
      };
    }

    case 'research-thinking': {
      const hub = obj('note', 'Central thread', { type: 'note', body: '' }, at());
      const objects = [hub];
      const positions: Record<string, BlockPos> = {
        [hub.id]: { x: 480, y: 220, w: 380, h: 280 },
      };
      return {
        objects,
        positions,
        focusSuggestion,
        hints: [
          'Add related notes and links as your map grows.',
          'Thinking Focus keeps the map spacious while reducing noise.',
        ],
      };
    }
  }
}
