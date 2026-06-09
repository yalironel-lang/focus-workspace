import { useCallback, useEffect, useRef, useState } from 'react';
import { loadPdfStudyMarks, savePdfStudyMarks } from './pdfStudyMarksIdb';
import {
  emptyPdfStudyMarksDoc,
  MAX_MARKED_PAGES,
  MAX_REGIONS_PER_PAGE,
  type PdfHighlightRegion,
  type PdfStudyMarksDoc,
} from './types';

const SAVE_DEBOUNCE_MS = 400;

function pageKey(page: number): string {
  return String(Math.max(1, Math.floor(page)));
}

function newRegionId(): string {
  return `hr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export type PdfStudyMarksTool = 'view' | 'highlight';

export type PdfStudyMarksChrome = {
  markedPages: number[];
  isCurrentPageMarked: boolean;
  highlightMode: boolean;
  toggleMarkPage: () => void;
  jumpToPage: (page: number) => void;
  setHighlightMode: (on: boolean) => void;
};

type Options = {
  sectionId: string;
  objectId: string;
  page: number;
  enabled: boolean;
  onJumpToPage: (page: number) => void;
  onChromeChange?: (chrome: PdfStudyMarksChrome | null) => void;
};

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
    void savePdfStudyMarks(sid, oid, docRef.current);
  }, []);

  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      const { sectionId: sid, objectId: oid } = scopeRef.current;
      if (!sid || !oid) return;
      void savePdfStudyMarks(sid, oid, docRef.current);
    }, SAVE_DEBOUNCE_MS);
  }, []);

  useEffect(() => {
    if (!enabled || !sectionId || !objectId) {
      setLoaded(false);
      setDoc(emptyPdfStudyMarksDoc());
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

  const currentPageKey = pageKey(page);
  const currentRegions = doc.pages[currentPageKey]?.regions ?? [];

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
    (rect: { x: number; y: number; w: number; h: number }) => {
      if (rect.w < 0.01 || rect.h < 0.01) return;
      const p = pageKey(page);
      setDoc(prev => {
        const layer = prev.pages[p] ?? { regions: [] };
        if (layer.regions.length >= MAX_REGIONS_PER_PAGE) return prev;
        const region: PdfHighlightRegion = {
          id: newRegionId(),
          x: Math.max(0, Math.min(1, rect.x)),
          y: Math.max(0, Math.min(1, rect.y)),
          w: Math.max(0, Math.min(1, rect.w)),
          h: Math.max(0, Math.min(1, rect.h)),
        };
        const markedPages = prev.markedPages.includes(Math.floor(page))
          ? prev.markedPages
          : [...prev.markedPages, Math.max(1, Math.floor(page))].sort((a, b) => a - b);
        return {
          ...prev,
          markedPages,
          pages: {
            ...prev.pages,
            [p]: { regions: [...layer.regions, region] },
          },
        };
      });
      scheduleSave();
    },
    [page, scheduleSave],
  );

  const removeRegion = useCallback(
    (regionId: string) => {
      const p = pageKey(page);
      setDoc(prev => {
        const layer = prev.pages[p];
        if (!layer) return prev;
        const regions = layer.regions.filter(r => r.id !== regionId);
        const pages = { ...prev.pages };
        if (regions.length) pages[p] = { regions };
        else delete pages[p];
        return { ...prev, pages };
      });
      scheduleSave();
    },
    [page, scheduleSave],
  );

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
      toggleMarkPage,
      jumpToPage,
      setHighlightMode: (on: boolean) => setTool(on ? 'highlight' : 'view'),
    });
  }, [
    enabled,
    loaded,
    doc.markedPages,
    isCurrentPageMarked,
    tool,
    toggleMarkPage,
    jumpToPage,
    onChromeChange,
  ]);

  return {
    loaded,
    tool,
    setTool,
    markedPages: doc.markedPages,
    currentRegions,
    isCurrentPageMarked,
    toggleMarkPage,
    addRegion,
    removeRegion,
  };
}
