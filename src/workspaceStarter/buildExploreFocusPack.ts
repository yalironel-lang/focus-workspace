import type { BlockPos } from '../hooks/useBlockPositions';
import type {
  ProjectObjectType,
  ProjectSpaceObject,
  ProjectObjectContent,
} from '../hooks/useSectionFreeSpaceObjects';
import type { WorkspaceStarterPack } from './buildWorkspaceStarterPack';
import { DEMO_SCREENSHOT_DATA_URL } from './demoAssets';
import { EXPLORE_FOCUS_SCENE_CENTER } from '../lib/exploreFocus';

let idCounter = 0;

function newId(type: ProjectObjectType): string {
  idCounter += 1;
  return `ps-focus-${type}-${Date.now()}-${idCounter}`;
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
 * Curated Explore Focus scene — active study in progress, spatial memory visible.
 */
export function buildExploreFocusPack(): WorkspaceStarterPack {
  const t0 = Date.now();
  let tick = 0;
  const at = () => {
    tick += 1;
    return t0 + tick;
  };

  const notebookBody = [
    '# Neural pathways — lecture 4',
    '¶ Still working through how **long-term potentiation** ties to spatial memory — not folders, not tabs.',
    '## Open thread',
    '- Hippocampus maps context; notes stay beside the source, not in another app.',
    '- The diagram on the right is the reference I keep returning to.',
    '- !note Compare LTP curve to the graph — same slope, different scale?',
    '¶ Unfinished: why does consolidation feel slower when material is scattered?',
    '## This room',
    '- Objects stay where you left them — continuity, not chaos.',
    '- Press **⌘K** and search **neural** to find this notebook instantly.',
  ].join('\n');

  const notebook = obj(
    'notebook',
    'Active notes',
    {
      type: 'notebook',
      body: notebookBody,
      subtitle: 'Spatial memory · search: neural',
      paperStyle: 'ruled',
      notebookSurface: 'paper',
    },
    at(),
  );

  const source = obj(
    'note',
    'Reading — Chapter 4',
    {
      type: 'note',
      body: 'Source material lives beside your thinking.\n\nIn a real workspace, drop a PDF or article here — it stays on this device, anchored to your notes.\n\nYou read and write in the same visual field.',
    },
    at(),
  );

  const image = obj(
    'image',
    'Reference diagram',
    {
      type: 'image',
      url: DEMO_SCREENSHOT_DATA_URL,
      alt: 'LTP reference curve',
    },
    at(),
  );

  const recall = obj(
    'mistake',
    'Review later',
    {
      type: 'mistake',
      variant: 'recall',
      whatWrong: 'What is the role of the hippocampus in spatial memory consolidation?',
      correction: 'Episodic binding of place + context before cortex transfer.',
      whyConfused: '',
      tags: ['recall'],
      confidence: 'low',
      timesReviewed: 0,
      lastReviewedAt: null,
    },
    at(),
  );

  const notebookLinked = {
    ...notebook,
    connections: [source.id, image.id, recall.id],
  };

  const objects = [notebookLinked, source, image, recall];
  const positions: Record<string, BlockPos> = {
    [notebook.id]: { x: 260, y: 180, w: 560, h: 500 },
    [source.id]: { x: 860, y: 150, w: 340, h: 300 },
    [image.id]: { x: 860, y: 480, w: 320, h: 260 },
    [recall.id]: { x: 280, y: 720, w: 300, h: 200 },
  };

  return {
    objects,
    positions,
    focusSuggestion: 'thinking',
    hints: [
      'Notes, sources, and recall share one continuous room.',
      'Connection lines show intentional relationships — not random tiles.',
      '⌘K searches notebook text on this device only.',
    ],
  };
}

export { EXPLORE_FOCUS_SCENE_CENTER as EXPLORE_FOCUS_PACK_CENTER };

/** @deprecated Use buildExploreFocusPack */
export const buildStudyOsDemoPack = buildExploreFocusPack;

export const DEMO_SCENE_CENTER = EXPLORE_FOCUS_SCENE_CENTER;
