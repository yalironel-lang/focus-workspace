/**
 * Math Zone storage — extracted from MathZone.tsx for cloud sync + tests.
 *
 * USER CONTENT: pages, refs, scratches, notebook titles
 * WORKSPACE STRUCTURE: notebook index, active notebook id, controls
 * DEVICE-LOCAL: pageResume (scroll position)
 */

export interface RefCard {
  id: string;
  content: string;
}

export interface ScratchBlock {
  id: string;
  content: string;
}

export interface NotebookPage {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
}

export interface MathZoneData {
  schemaVersion: 2;
  content: string;
  pages: NotebookPage[];
  activePageId: string;
  pageResume: Record<string, { scrollTop: number; lastEditing: boolean }>;
  refs: RefCard[];
  scratches: ScratchBlock[];
}

export interface Notebook {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

export interface NotebooksIndex {
  notebooks: Notebook[];
  activeId: string;
}

export type PageBackground = 'dots' | 'grid' | 'ruled' | 'blank';
export type PageDensity = 'light' | 'medium' | 'dense';
export type NotebookWidth = 'narrow' | 'comfortable' | 'wide';
export type PageSpacing = 'compact' | 'balanced' | 'spacious';
export type EquationSize = 'small' | 'medium' | 'large';
export type EquationAlignment = 'center' | 'left';

export interface NotebookControlsState {
  pageBackground: PageBackground;
  pageDensity: PageDensity;
  notebookWidth: NotebookWidth;
  pageSpacing: PageSpacing;
  fontSize: number;
  lineHeight: number;
  writingWidth: number;
  keepListsVisibleWhileTyping: boolean;
  rtlAssist: boolean;
  equationSize: EquationSize;
  equationAlignment: EquationAlignment;
  hideReferences: boolean;
  hideScratch: boolean;
  dimEnvironment: boolean;
  deepFocus: boolean;
}

export type MathZoneCloudState = {
  schemaVersion: 1;
  index: NotebooksIndex;
  /** Per-notebook data + controls; pageResume stripped (device-local). */
  notebooks: Record<
    string,
    {
      data: MathZoneData;
      controls: NotebookControlsState;
    }
  >;
  updatedAt: number;
};

const legacyKey = (sid: string) => `fw_math_v1_${sid}`;
const indexKey = (sid: string) => `fw_math_index_${sid}`;
const nbDataKey = (sid: string, id: string) => `fw_math_nb_${sid}_${id}`;
const nbControlsKey = (sid: string, id: string) => `fw_math_controls_v1_${sid}_${id}`;
export const MATH_META_KEY = (sid: string) => `fw_math_state_meta_${sid}`;

export function defaultControls(): NotebookControlsState {
  return {
    pageBackground: 'dots',
    pageDensity: 'medium',
    notebookWidth: 'comfortable',
    pageSpacing: 'balanced',
    fontSize: 15.5,
    lineHeight: 1.85,
    writingWidth: 640,
    keepListsVisibleWhileTyping: true,
    rtlAssist: false,
    equationSize: 'medium',
    equationAlignment: 'center',
    hideReferences: false,
    hideScratch: false,
    dimEnvironment: false,
    deepFocus: false,
  };
}

function defaultData(): MathZoneData {
  const id = `page-${Date.now()}`;
  return {
    schemaVersion: 2,
    content: '',
    pages: [{ id, title: 'Page 1', content: '', createdAt: Date.now(), updatedAt: Date.now() }],
    activePageId: id,
    pageResume: {},
    refs: [],
    scratches: [],
  };
}

export function loadControls(sectionId: string, notebookId: string): NotebookControlsState {
  try {
    const raw = localStorage.getItem(nbControlsKey(sectionId, notebookId));
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<NotebookControlsState>;
      return { ...defaultControls(), ...parsed };
    }
  } catch {
    /* ignore */
  }
  return defaultControls();
}

export function saveControls(
  sectionId: string,
  notebookId: string,
  controls: NotebookControlsState,
): void {
  try {
    localStorage.setItem(nbControlsKey(sectionId, notebookId), JSON.stringify(controls));
  } catch {
    /* quota */
  }
}

export function loadIndex(sectionId: string): NotebooksIndex {
  try {
    const raw = localStorage.getItem(indexKey(sectionId));
    if (raw) {
      const p = JSON.parse(raw) as NotebooksIndex;
      if (Array.isArray(p.notebooks) && p.notebooks.length > 0 && p.activeId) return p;
    }
  } catch {
    /* ignore */
  }

  const id = 'nb-legacy';
  const now = Date.now();
  let data = defaultData();

  try {
    const legacyRaw = localStorage.getItem(legacyKey(sectionId));
    if (legacyRaw) {
      const p = JSON.parse(legacyRaw) as Record<string, unknown>;
      let content = '';
      if (typeof p.content === 'string') {
        content = p.content;
      } else if (Array.isArray(p.blocks)) {
        content = (p.blocks as Array<{ text?: string }>)
          .map(b => b.text ?? '')
          .filter(Boolean)
          .join('\n\n');
      }
      data = {
        ...defaultData(),
        content,
        pages: [
          {
            id: `page-${now}`,
            title: 'Page 1',
            content,
            createdAt: now,
            updatedAt: now,
          },
        ],
        activePageId: `page-${now}`,
        refs: Array.isArray(p.refs) ? (p.refs as RefCard[]) : [],
        scratches: Array.isArray(p.scratches) ? (p.scratches as ScratchBlock[]) : [],
      };
    }
  } catch {
    /* ignore */
  }

  const idx: NotebooksIndex = {
    notebooks: [{ id, title: 'Notes', createdAt: now, updatedAt: now }],
    activeId: id,
  };
  try {
    localStorage.setItem(nbDataKey(sectionId, id), JSON.stringify(data));
    localStorage.setItem(indexKey(sectionId), JSON.stringify(idx));
  } catch {
    /* quota */
  }
  return idx;
}

export function saveIndex(sectionId: string, idx: NotebooksIndex): void {
  try {
    localStorage.setItem(indexKey(sectionId), JSON.stringify(idx));
  } catch {
    /* quota */
  }
}

export function loadNbData(sectionId: string, nbId: string): MathZoneData {
  try {
    const raw = localStorage.getItem(nbDataKey(sectionId, nbId));
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<MathZoneData>;
      const now = Date.now();
      if (Array.isArray(parsed.pages) && parsed.pages.length > 0) {
        const pages = parsed.pages.map((p, idx) => ({
          id: typeof p.id === 'string' ? p.id : `page-${now}-${idx}`,
          title: typeof p.title === 'string' && p.title.trim() ? p.title : `Page ${idx + 1}`,
          content: typeof p.content === 'string' ? p.content : '',
          createdAt: typeof p.createdAt === 'number' ? p.createdAt : now,
          updatedAt: typeof p.updatedAt === 'number' ? p.updatedAt : now,
        }));
        const activePageId = pages.some(p => p.id === parsed.activePageId)
          ? parsed.activePageId!
          : pages[0]!.id;
        return {
          schemaVersion: 2,
          content:
            typeof parsed.content === 'string'
              ? parsed.content
              : (pages.find(p => p.id === activePageId)?.content ?? ''),
          pages,
          activePageId,
          pageResume:
            parsed.pageResume && typeof parsed.pageResume === 'object' ? parsed.pageResume : {},
          refs: Array.isArray(parsed.refs) ? (parsed.refs as RefCard[]) : [],
          scratches: Array.isArray(parsed.scratches)
            ? (parsed.scratches as ScratchBlock[])
            : [],
        };
      }
    }
  } catch {
    /* ignore */
  }
  return defaultData();
}

export function saveNbData(sectionId: string, nbId: string, data: MathZoneData): void {
  try {
    localStorage.setItem(nbDataKey(sectionId, nbId), JSON.stringify(data));
  } catch {
    /* quota */
  }
}

function loadMeta(sectionId: string): { updatedAt: number } {
  try {
    const raw = localStorage.getItem(MATH_META_KEY(sectionId));
    if (!raw) return { updatedAt: 0 };
    const p = JSON.parse(raw) as { updatedAt?: number };
    return {
      updatedAt:
        typeof p.updatedAt === 'number' && Number.isFinite(p.updatedAt) ? p.updatedAt : 0,
    };
  } catch {
    return { updatedAt: 0 };
  }
}

function saveMeta(sectionId: string, updatedAt: number): void {
  try {
    localStorage.setItem(MATH_META_KEY(sectionId), JSON.stringify({ updatedAt }));
  } catch {
    /* quota */
  }
}

export function mathLocalUpdatedAt(sectionId: string): number {
  return loadMeta(sectionId).updatedAt;
}

/** Strip device-local pageResume before cloud upload. */
export function stripDeviceLocalFromMathData(data: MathZoneData): MathZoneData {
  return { ...data, pageResume: {} };
}

export function readMathZoneLocalSnapshot(sectionId: string): MathZoneCloudState {
  const index = loadIndex(sectionId);
  const notebooks: MathZoneCloudState['notebooks'] = {};
  for (const nb of index.notebooks) {
    notebooks[nb.id] = {
      data: stripDeviceLocalFromMathData(loadNbData(sectionId, nb.id)),
      controls: loadControls(sectionId, nb.id),
    };
  }
  return {
    schemaVersion: 1,
    index,
    notebooks,
    updatedAt: loadMeta(sectionId).updatedAt,
  };
}

export function applyMathZoneLocalSnapshot(sectionId: string, state: MathZoneCloudState): void {
  saveIndex(sectionId, state.index);
  for (const [nbId, bundle] of Object.entries(state.notebooks)) {
    const existing = loadNbData(sectionId, nbId);
    saveNbData(sectionId, nbId, {
      ...bundle.data,
      pageResume: existing.pageResume,
    });
    saveControls(sectionId, nbId, bundle.controls);
  }
  saveMeta(sectionId, state.updatedAt);
}

export function parseMathZoneCloudState(raw: unknown): MathZoneCloudState | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (r.schemaVersion !== 1) return null;
  if (!r.index || typeof r.index !== 'object') return null;
  if (!r.notebooks || typeof r.notebooks !== 'object') return null;
  if (typeof r.updatedAt !== 'number') return null;
  const index = r.index as NotebooksIndex;
  if (!Array.isArray(index.notebooks) || !index.activeId) return null;
  return {
    schemaVersion: 1,
    index,
    notebooks: r.notebooks as MathZoneCloudState['notebooks'],
    updatedAt: r.updatedAt,
  };
}
