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
    '',
    'Still working through how **long-term potentiation** ties to spatial memory formation. The Squire model makes sense in isolation — harder to see how it connects to encoding speed.',
    '',
    '## Questions I\'m tracking',
    '',
    '- Hippocampus as index, not storage: it maps *where* in cortex the memory lives. But what defines "context" in a spatial sense?',
    '- The diagram to the right — the LTP slope looks similar to the consolidation curve in Squire. Same mechanism or coincidence?',
    '- !note Still unresolved: why does studying with scattered material feel slower to consolidate than studying in one place?',
    '',
    '## What I have so far',
    '',
    'If the hippocampus encodes spatial context during learning, items studied near each other share retrieval coordinates. Proximity during encoding may create shared access pathways later.',
    '',
    '---',
    '',
    '*Stopped here. Return to the LTP comparison before next lecture.*',
  ].join('\n');

  const notebook = obj(
    'notebook',
    'Working notes',
    {
      type: 'notebook',
      body: notebookBody,
      subtitle: 'Lecture 4 · in progress',
      paperStyle: 'ruled',
      notebookSurface: 'paper',
    },
    at(),
  );

  const source = obj(
    'note',
    'Source material',
    {
      type: 'note',
      body: [
        'Squire & Zola-Morgan (1991)',
        '',
        '> "The hippocampus provides the binding that allows distributed cortical representations to be retrieved together as a coherent experience."',
        '',
        'My read: it\'s a coordinator, not a container. The actual memory is spread across cortex — hippocampus holds the assembly instructions.',
        '',
        'Open question: if encoding context matters for retrieval, what counts as context? Location? Time? Co-present material?',
        '',
        '→ See working notes — comparing to LTP curve in the lecture diagram.',
        '',
        '*(paused here — are the decay timescales actually comparable?)*',
      ].join('\n'),
    },
    at(),
  );

  const image = obj(
    'image',
    'LTP curve — lecture 4',
    {
      type: 'image',
      url: DEMO_SCREENSHOT_DATA_URL,
      alt: 'LTP curve from lecture 4 slides',
    },
    at(),
  );

  const recall = obj(
    'mistake',
    'Something to return to',
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
    connections: [source.id, image.id],
  };

  const objects = [notebookLinked, source, image, recall];
  const positions: Record<string, BlockPos> = {
    // Notebook: dominant left anchor — large enough to read as "what I was working on"
    [notebook.id]: { x: 116, y:  58, w: 638, h: 598 },
    // Source: upper-right — close enough to suggest active reference, not a sidebar
    [source.id]:   { x: 797, y:  36, w: 358, h: 292 },
    // Image: right-middle, intentionally offset from source x — breaks grid alignment
    [image.id]:    { x: 828, y: 355, w: 302, h: 252 },
    // Recall: low and to the side — flagged and set aside, visible as a sliver at the fold
    [recall.id]:   { x: 238, y: 714, w: 254, h: 168 },
  };

  return {
    objects,
    positions,
    focusSuggestion: 'thinking',
    hints: [
      'All your material for this subject lives here — and the space remembers how you were thinking, not just what you saved.',
      'Where you place things carries meaning. Objects near each other are in relation — and that stays.',
      'Open any object to read or write inside it. The space extends further than the screen — drag to explore.',
    ],
  };
}

export { EXPLORE_FOCUS_SCENE_CENTER as EXPLORE_FOCUS_PACK_CENTER };

/** @deprecated Use buildExploreFocusPack */
export const buildStudyOsDemoPack = buildExploreFocusPack;

export const DEMO_SCENE_CENTER = EXPLORE_FOCUS_SCENE_CENTER;
