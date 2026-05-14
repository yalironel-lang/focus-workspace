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
      const mistake = obj(
        'mistake',
        'Mistakes',
        {
          type: 'mistake',
          whatWrong: '',
          correction: '',
          whyConfused: '',
          tags: [],
          confidence: 'low',
          timesReviewed: 0,
          lastReviewedAt: null,
        },
        at(),
      );
      const reviewNote = obj('note', 'Quick review', { type: 'note', body: '' }, at());
      const pdf = obj(
        'pdf',
        'Reading',
        {
          type: 'pdf',
          fileName: '',
          fileType: '',
          fileSize: 0,
          lastOpenedAt: null,
          page: 1,
          zoom: 1,
        },
        at(),
      );
      const calculator = obj('calculator', 'Calculator', { type: 'calculator', input: '', history: [] }, at());
      const graph = obj(
        'graph',
        'Graph',
        { type: 'graph', expression: 'x^2', xmin: -6, xmax: 6, ymin: -4, ymax: 8 },
        at(),
      );
      const notebookLinked = { ...notebook, connections: [mistake.id, reviewNote.id] };
      const objects = [notebookLinked, mistake, reviewNote, pdf, calculator, graph];
      const positions: Record<string, BlockPos> = {
        [notebook.id]: { x: 96, y: 72, w: 600, h: 500 },
        [mistake.id]: { x: 740, y: 72, w: 380, h: 320 },
        [reviewNote.id]: { x: 740, y: 420, w: 360, h: 280 },
        [pdf.id]: { x: 96, y: 600, w: 540, h: 460 },
        [calculator.id]: { x: 680, y: 600, w: 300, h: 420 },
        [graph.id]: { x: 1010, y: 600, w: 400, h: 360 },
      };
      return {
        objects,
        positions,
        focusSuggestion,
        hints: [
          'Connected review material stays easier to scan.',
          'Mistake cards can resurface later when you want recall.',
          'Review Focus quiets the room without hiding nearby context.',
        ],
      };
    }

    case 'deep-reading': {
      const pdf = obj(
        'pdf',
        'Main text',
        {
          type: 'pdf',
          fileName: '',
          fileType: '',
          fileSize: 0,
          lastOpenedAt: null,
          page: 1,
          zoom: 1,
        },
        at(),
      );
      const notebook = obj('notebook', 'Margin notes', { type: 'notebook', body: '', paperStyle: 'ruled' }, at());
      const quotes = obj('note', 'Quotes & excerpts', { type: 'note', body: '' }, at());
      const nb = { ...notebook, connections: [pdf.id] };
      const objects = [pdf, nb, quotes];
      const positions: Record<string, BlockPos> = {
        [pdf.id]: { x: 72, y: 56, w: 720, h: 580 },
        [notebook.id]: { x: 820, y: 56, w: 560, h: 480 },
        [quotes.id]: { x: 820, y: 560, w: 560, h: 260 },
      };
      return {
        objects,
        positions,
        focusSuggestion,
        hints: [
          'Keep the document and your notes connected as one reading space.',
          'Marginalia works best beside the source it came from.',
          'Reading Focus tightens the room around what you are reading.',
        ],
      };
    }

    case 'problem-solving': {
      const notebook = obj('notebook', 'Workings', { type: 'notebook', body: '', paperStyle: 'grid' }, at());
      const calculator = obj('calculator', 'Calculator', { type: 'calculator', input: '', history: [] }, at());
      const graph = obj(
        'graph',
        'Graph',
        { type: 'graph', expression: 'x^2', xmin: -6, xmax: 6, ymin: -4, ymax: 8 },
        at(),
      );
      const scratch = obj('note', 'Scratch', { type: 'note', body: '' }, at());
      const mistake = obj(
        'mistake',
        'Slips',
        {
          type: 'mistake',
          whatWrong: '',
          correction: '',
          whyConfused: '',
          tags: [],
          confidence: 'low',
          timesReviewed: 0,
          lastReviewedAt: null,
        },
        at(),
      );
      const nb = { ...notebook, connections: [scratch.id, graph.id] };
      const objects = [nb, calculator, graph, scratch, mistake];
      const positions: Record<string, BlockPos> = {
        [notebook.id]: { x: 80, y: 64, w: 560, h: 500 },
        [calculator.id]: { x: 680, y: 64, w: 300, h: 420 },
        [graph.id]: { x: 1010, y: 64, w: 400, h: 360 },
        [scratch.id]: { x: 680, y: 510, w: 360, h: 280 },
        [mistake.id]: { x: 1080, y: 460, w: 380, h: 320 },
      };
      return {
        objects,
        positions,
        focusSuggestion,
        hints: [
          'Quick capture keeps scratch thoughts from interrupting the flow.',
          'Recurring slips become more useful once they live near the work.',
          'Solving Focus lifts tools and scratch without flattening the room.',
        ],
      };
    }

    case 'research-thinking': {
      const hub = obj('note', 'Central thread', { type: 'note', body: '' }, at());
      const a = obj('note', 'Idea', { type: 'note', body: '' }, at());
      const b = obj('note', 'Counterpoint', { type: 'note', body: '' }, at());
      const c = obj('note', 'Open question', { type: 'note', body: '' }, at());
      const hubConn = { ...hub, connections: [a.id, b.id, c.id] };
      const objects = [hubConn, a, b, c];
      const positions: Record<string, BlockPos> = {
        [hub.id]: { x: 620, y: 260, w: 360, h: 260 },
        [a.id]: { x: 200, y: 120, w: 340, h: 240 },
        [b.id]: { x: 1120, y: 140, w: 340, h: 240 },
        [c.id]: { x: 520, y: 520, w: 360, h: 260 },
      };
      return {
        objects,
        positions,
        focusSuggestion,
        hints: [
          'Connections help related ideas stay part of the same cluster.',
          'Thinking Focus keeps the map spacious while reducing noise.',
          'The minimap makes distant clusters feel connected instead of lost.',
        ],
      };
    }
  }
}
