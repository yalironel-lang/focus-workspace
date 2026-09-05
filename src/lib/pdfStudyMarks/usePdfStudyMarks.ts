import { useCallback, useEffect, useRef, useState } from 'react';
import { loadPdfStudyMarks, savePdfStudyMarks } from './pdfStudyMarksIdb';
import {
  emptyPdfStudyMarksDoc,
  MAX_MARKED_PAGES,
  MAX_REGIONS_PER_PAGE,
  MAX_STROKES_PER_PAGE,
  PDF_INK_DEFAULT_COLOR,
  PDF_INK_DEFAULT_WIDTH,
  type PdfHighlightRegion,
  type PdfInkStroke,
  type PdfStudyMarksDoc,
  type PdfStudyMarksPageLayer,
} from './types';

const SAVE_DEBOUNCE_MS = 400;

function pageKey(page: number): string {
  return String(Math.max(1, Math.floor(page)));
}

function newRegionId(): string {
  return `hr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function newStrokeId(): string {
  return `is-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export type PdfStudyMarksTool = 'view' | 'highlight' | 'ink' | 'eraser';

export type PdfStudyMarksChrome = {
  markedPages: number[];
  isCurrentPageMarked: boolean;
  highlightMode: boolean;
  annotateMode: boolean;
  eraserMode: boolean;
  toggleMarkPage: () => void;
  jumpToPage: (page: number) => void;
  setHighlightMode: (on: boolean) => void;
  setAnnotateMode: (on: boolean) => void;
  setEraserMode: (on: boolean) => void;
  clearCurrentPageInk: () => void;
  tool: PdfStudyMarksTool;
};

type Options = {
  sectionId: string;
  objectId: string;
  page: number;
  enabled: boolean;
  onJumpToPage: (page: number) => void;
  onChromeChange?: (chrome: PdfStudyMarksChrome | null) => void;
};

function layerOrEmpty(doc: PdfStudyMarksDoc, p: string): PdfStudyMarksPageLayer {
  return doc.pages[p] ?? { regions: [] };
}

export function usePdfStudyMarks({
  sectionId,
  objectId,
  page,
  enabled,
  onJumpToPage,
  onChromeChange,
}: Options) {
  const [doc, setDoc] = useState<PdfStudyMarksDoc>(emptyPdfStudyMarksDoc);
  const [loaded, setLoaded] = useState(false);
  const [tool, setTool] = useState<PdfStudyMarksTool>('view');
  const docRef = useRef(doc);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scopeRef = useRef({ sectionId, objectId });
  scopeRef.current = { sectionId, objectId };

  docRef.current = doc;

  const flushSave = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const { sectionId: sid, objectId: oid } = scopeRef.current;
    if (!sid || !oid) return;
    void savePdfStudyMarks(sid, oid, docRef.current).catch(() => {
      /* markSaveError already recorded */
    });
  }, []);

  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      const { sectionId: sid, objectId: oid } = scopeRef.current;
      if (!sid || !oid) return;
      void savePdfStudyMarks(sid, oid, docRef.current).catch(() => {
        /* markSaveError already recorded */
      });
    }, SAVE_DEBOUNCE_MS);
  }, []);

  useEffect(() => {
    if (!enabled || !sectionId || !objectId) {
      setLoaded(false);
      setDoc(emptyPdfStudyMarksDoc());
      setTool('view');
      return;
    }
    let cancelled = false;
    setLoaded(false);
    void loadPdfStudyMarks(sectionId, objectId).then(d => {
      if (cancelled) return;
      setDoc(d);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
      flushSave();
    };
  }, [enabled, sectionId, objectId, flushSave]);

  useEffect(() => {
    return () => flushSave();
  }, [flushSave]);

  const regionsForPage = useCallback(
    (pageNum: number) => layerOrEmpty(doc, pageKey(pageNum)).regions,
    [doc],
  );

  const strokesForPage = useCallback(
    (pageNum: number) => layerOrEmpty(doc, pageKey(pageNum)).strokes ?? [],
    [doc],
  );

  const currentPageKey = pageKey(page);
  const currentRegions = doc.pages[currentPageKey]?.regions ?? [];
  const currentStrokes = doc.pages[currentPageKey]?.strokes ?? [];

  const toggleMarkPage = useCallback(() => {
    setDoc(prev => {
      const p = Math.max(1, Math.floor(page));
      const has = prev.markedPages.includes(p);
      let markedPages = has
        ? prev.markedPages.filter(n => n !== p)
        : [...prev.markedPages, p].sort((a, b) => a - b);
      if (markedPages.length > MAX_MARKED_PAGES) {
        markedPages = markedPages.slice(-MAX_MARKED_PAGES);
      }
      return { ...prev, markedPages };
    });
    scheduleSave();
  }, [page, scheduleSave]);

  const addRegion = useCallback(
    (pageNum: number, rect: { x: number; y: number; w: number; h: number }) => {
      if (rect.w < 0.01 || rect.h < 0.01) return;
      const p = pageKey(pageNum);
      setDoc(prev => {
        const layer = layerOrEmpty(prev, p);
        if (layer.regions.length >= MAX_REGIONS_PER_PAGE) return prev;
        const region: PdfHighlightRegion = {
          id: newRegionId(),
          x: Math.max(0, Math.min(1, rect.x)),
          y: Math.max(0, Math.min(1, rect.y)),
          w: Math.max(0, Math.min(1, rect.w)),
          h: Math.max(0, Math.min(1, rect.h)),
        };
        const markedPages = prev.markedPages.includes(Math.floor(pageNum))
          ? prev.markedPages
          : [...prev.markedPages, Math.max(1, Math.floor(pageNum))].sort((a, b) => a - b);
        return {
          ...prev,
          markedPages,
          pages: {
            ...prev.pages,
            [p]: { ...layer, regions: [...layer.regions, region] },
          },
        };
      });
      scheduleSave();
    },
    [scheduleSave],
  );

  const removeRegion = useCallback(
    (pageNum: number, regionId: string) => {
      const p = pageKey(pageNum);
      setDoc(prev => {
        const layer = prev.pages[p];
        if (!layer) return prev;
        const regions = layer.regions.filter(r => r.id !== regionId);
        const pages = { ...prev.pages };
        const next: PdfStudyMarksPageLayer = { regions, strokes: layer.strokes };
        if (regions.length === 0 && !(next.strokes && next.strokes.length)) delete pages[p];
        else pages[p] = next;
        return { ...prev, pages };
      });
      scheduleSave();
    },
    [scheduleSave],
  );

  const addStroke = useCallback(
    (pageNum: number, stroke: Omit<PdfInkStroke, 'id'> & { id?: string }) => {
      if (!stroke.points.length) return;
      const p = pageKey(pageNum);
      const committed: PdfInkStroke = {
        id: stroke.id ?? newStrokeId(),
        color: stroke.color || PDF_INK_DEFAULT_COLOR,
        width: stroke.width > 0 ? stroke.width : PDF_INK_DEFAULT_WIDTH,
        points: stroke.points,
      };
      setDoc(prev => {
        const layer = layerOrEmpty(prev, p);
        const existing = layer.strokes ?? [];
        if (existing.length >= MAX_STROKES_PER_PAGE) return prev;
        return {
          ...prev,
          pages: {
            ...prev.pages,
            [p]: { ...layer, strokes: [...existing, committed] },
          },
        };
      });
      scheduleSave();
    },
    [scheduleSave],
  );

  const removeStroke = useCallback(
    (pageNum: number, strokeId: string) => {
      const p = pageKey(pageNum);
      setDoc(prev => {
        const layer = prev.pages[p];
        if (!layer?.strokes?.length) return prev;
        const strokes = layer.strokes.filter(s => s.id !== strokeId);
        const pages = { ...prev.pages };
        const next: PdfStudyMarksPageLayer = { regions: layer.regions, strokes };
        if (next.regions.length === 0 && strokes.length === 0) delete pages[p];
        else {
          if (strokes.length === 0) delete next.strokes;
          pages[p] = next;
        }
        return { ...prev, pages };
      });
      scheduleSave();
    },
    [scheduleSave],
  );

  const clearPageInk = useCallback(
    (pageNum: number) => {
      const p = pageKey(pageNum);
      setDoc(prev => {
        const layer = prev.pages[p];
        if (!layer?.strokes?.length) return prev;
        const pages = { ...prev.pages };
        if (layer.regions.length === 0) delete pages[p];
        else pages[p] = { regions: layer.regions };
        return { ...prev, pages };
      });
      scheduleSave();
    },
    [scheduleSave],
  );

  const clearCurrentPageInk = useCallback(() => {
    clearPageInk(page);
  }, [clearPageInk, page]);

  const jumpToPage = useCallback(
    (target: number) => {
      flushSave();
      onJumpToPage(Math.max(1, Math.floor(target)));
    },
    [flushSave, onJumpToPage],
  );

  const isCurrentPageMarked = doc.markedPages.includes(Math.max(1, Math.floor(page)));

  useEffect(() => {
    if (!enabled || !loaded) {
      onChromeChange?.(null);
      return;
    }
    onChromeChange?.({
      markedPages: doc.markedPages,
      isCurrentPageMarked,
      highlightMode: tool === 'highlight',
      annotateMode: tool === 'ink',
      eraserMode: tool === 'eraser',
      toggleMarkPage,
      jumpToPage,
      setHighlightMode: (on: boolean) => setTool(on ? 'highlight' : 'view'),
      setAnnotateMode: (on: boolean) => setTool(on ? 'ink' : 'view'),
      setEraserMode: (on: boolean) => setTool(on ? 'eraser' : tool === 'ink' ? 'ink' : 'view'),
      clearCurrentPageInk,
      tool,
    });
  }, [
    enabled,
    loaded,
    doc.markedPages,
    isCurrentPageMarked,
    tool,
    toggleMarkPage,
    jumpToPage,
    clearCurrentPageInk,
    onChromeChange,
  ]);

  return {
    loaded,
    tool,
    setTool,
    markedPages: doc.markedPages,
    currentRegions,
    currentStrokes,
    regionsForPage,
    strokesForPage,
    isCurrentPageMarked,
    toggleMarkPage,
    addRegion,
    removeRegion,
    addStroke,
    removeStroke,
    clearPageInk,
    clearCurrentPageInk,
    flushSave,
  };
}
