import type { BlockPos } from '../hooks/useBlockPositions';
import type {
  ProjectObjectType,
  ProjectSpaceObject,
  ProjectObjectContent,
} from '../hooks/useSectionFreeSpaceObjects';
import type { WorkspaceStarterPack } from './buildWorkspaceStarterPack';

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

/** Rich spatial demo — the workspace teaches the product (no modals). */
export function buildStudyOsDemoPack(): WorkspaceStarterPack {
  const t0 = Date.now();
  let tick = 0;
  const at = () => {
    tick += 1;
    return t0 + tick;
  };

  const notebookBody = [
    '# Biochemistry — spatial study',
    '¶ This is your **study OS**: notebooks, sources, screenshots, and recall live in one room — not scattered tabs.',
    '## Try in under a minute',
    '- **Paper mode** is on for this notebook (warm page, ruled lines). Toggle Spatial | Paper in the toolbar.',
    '- Press **⌘K** (Ctrl+K) and search **spatial** — command palette finds notebook text only.',
    '- **Connections** link this note to the PDF, screenshot, and recall cards beside it.',
    '- Drop your own PDF on the canvas, or paste a screenshot with **⌘V** while the canvas is focused.',
    '¶ Everything here is saved on this device. Install the app from the library to open it like desktop software.',
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

  const pdf = obj(
    'pdf',
    'Sample lecture PDF',
    {
      type: 'pdf',
      fileName: 'Sample_lecture.pdf',
      fileType: 'application/pdf',
      fileSize: 2400000,
      lastOpenedAt: null,
      page: 1,
      zoom: 1,
    },
    at(),
  );

  const image = obj(
    'image',
    'Sample screenshot',
    {
      type: 'image',
      url: '',
      fileName: 'diagram_capture.png',
      fileSize: 128000,
      naturalWidth: 480,
      naturalHeight: 320,
    },
    at(),
  );

  const mistake = obj(
    'mistake',
    'Common slip',
    {
      type: 'mistake',
      variant: 'mistake',
      whatWrong: 'Confused oxidation with reduction in the last step.',
      correction: 'OIL RIG: oxidation loses electrons; reduction gains.',
      whyConfused: 'Similar arrow directions in both half-reactions.',
      tags: ['exam', 'redox'],
      confidence: 'medium',
      timesReviewed: 1,
      lastReviewedAt: t0 - 86400000,
    },
    at(),
  );

  const recall = obj(
    'mistake',
    'Recall card',
    {
      type: 'mistake',
      variant: 'recall',
      whatWrong: 'What is the rate-limiting step in glycolysis?',
      correction: 'Phosphofructokinase-1 (PFK-1) — ATP-sensitive control point.',
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
    connections: [pdf.id, image.id, mistake.id, recall.id],
  };

  const objects = [notebookLinked, pdf, image, mistake, recall];
  const positions: Record<string, BlockPos> = {
    [notebook.id]: { x: 120, y: 80, w: 620, h: 520 },
    [pdf.id]: { x: 780, y: 72, w: 480, h: 440 },
    [image.id]: { x: 120, y: 640, w: 400, h: 300 },
    [mistake.id]: { x: 560, y: 640, w: 360, h: 300 },
    [recall.id]: { x: 960, y: 540, w: 360, h: 280 },
  };

  return {
    objects,
    positions,
    focusSuggestion: 'thinking',
    hints: [
      'Objects stay where you put them — spatial memory beats folder hunting.',
      '⌘K searches notebook title, subtitle, and body on this device.',
      'Mistake and recall cards resurface beside the work they came from.',
    ],
  };
}
