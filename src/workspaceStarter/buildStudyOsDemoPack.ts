import type { BlockPos } from '../hooks/useBlockPositions';
import type {
  ProjectObjectType,
  ProjectSpaceObject,
  ProjectObjectContent,
} from '../hooks/useSectionFreeSpaceObjects';
import type { WorkspaceStarterPack } from './buildWorkspaceStarterPack';
import { DEMO_SCREENSHOT_DATA_URL } from './demoAssets';

let idCounter = 0;

function newId(type: ProjectObjectType): string {
  idCounter += 1;
  return `ps-demo-${type}-${Date.now()}-${idCounter}`;
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

/** Centered, calm demo — three objects, obvious relationships, no broken blobs. */
export function buildStudyOsDemoPack(): WorkspaceStarterPack {
  const t0 = Date.now();
  let tick = 0;
  const at = () => {
    tick += 1;
    return t0 + tick;
  };

  const notebookBody = [
    '# Your study notebook',
    '¶ Notes, sources, and screenshots stay in one spatial room on this device.',
    '## Try this',
    '- **Paper mode** is on — toggle Spatial | Paper in the toolbar above.',
    '- Press **⌘K** and search **spatial** to jump back here.',
    '- Lines connect this note to the source and screenshot on the right.',
    '- Drop a real PDF on the canvas, or paste a screenshot with **⌘V**.',
  ].join('\n');

  const notebook = obj(
    'notebook',
    'Study notebook',
    {
      type: 'notebook',
      body: notebookBody,
      subtitle: 'Search: spatial memory',
      paperStyle: 'ruled',
      notebookSurface: 'paper',
    },
    at(),
  );

  const source = obj(
    'note',
    'Reading source',
    {
      type: 'note',
      body: 'PDFs and articles sit here beside your notes.\n\nDrop a PDF onto the canvas — files stay on this device only.',
    },
    at(),
  );

  const image = obj(
    'image',
    'Sample screenshot',
    {
      type: 'image',
      url: DEMO_SCREENSHOT_DATA_URL,
      alt: 'Sample diagram beside your notes',
    },
    at(),
  );

  const notebookLinked = {
    ...notebook,
    connections: [source.id, image.id],
  };

  const objects = [notebookLinked, source, image];
  const positions: Record<string, BlockPos> = {
    [notebook.id]: { x: 140, y: 140, w: 540, h: 460 },
    [source.id]: { x: 720, y: 140, w: 360, h: 280 },
    [image.id]: { x: 720, y: 460, w: 360, h: 260 },
  };

  return {
    objects,
    positions,
    focusSuggestion: 'thinking',
    hints: [
      'Three objects, one room — spatial memory without folder hunting.',
      '⌘K searches this notebook on your device.',
    ],
  };
}

/** World-space focal point for framing the demo cluster. */
export const DEMO_SCENE_CENTER = { x: 520, y: 380 };
