import type { NormalizedPageRegion } from "../../lib/pdfGeometry/normalizedPageRegion";
import type { TutorCaptureIntent, TutorCaptureChrome } from "../../lib/ai/tutor/tutorCaptureTypes";
import {
  useTutorPdfCapture,
  type PageTextLayerProbe,
} from "../../lib/ai/tutor/useTutorPdfCapture";
import { PdfTutorCaptureOverlay } from "./PdfTutorCaptureOverlay";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  ExternalLink,
  FileText,
  FolderOpen,
  Highlighter,
  Loader2,
  Bookmark,
  Minus,
  Plus,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import type { ProjectObjectContent } from '../../hooks/useSectionFreeSpaceObjects';
import { ensureProjectObjectContent } from '../../hooks/useSectionFreeSpaceObjects';
import { isAcceptablePdfFile, loadPdfBlob, savePdfBlobFromFile } from '../../lib/freeSpacePdfIdb';
import { useAuth } from '../../hooks/useAuth';
import {
  hydrateSpatialPdfWithCloud,
  onSpatialPdfSaved,
} from '../../lib/spatialAssetCloud';
import { loadPdfThumbnail } from '../../lib/freeSpacePdfThumbIdb';
import { pdfUploadDiag, pdfUploadDiagDump } from '../../lib/pdfUploadDiag';
import type { PdfStudyMarksChrome } from '../../lib/pdfStudyMarks/usePdfStudyMarks';
import { usePdfStudyMarks } from '../../lib/pdfStudyMarks/usePdfStudyMarks';
import { PdfStudyMarksOverlay } from './PdfStudyMarksOverlay';
import { PdfJsScrollViewer } from './PdfJsScrollViewer';
import {
  bumpPdfPage,
  normalizePdfPage,
  applyPdfVisiblePageToContent,
  pdfToolbarDisplayPage,
  formatPdfToolbarPageLabel,
} from '../../lib/pdfViewerState';
import { flushAllFreeSpacePersistence } from '../../lib/freeSpacePersistFlush';
import { TOUCH_TARGET_MIN_PX } from '../../lib/ui/touchTarget';

/** Compile-time staging/DEV only — Production builds exclude this chunk. */
const OWNER_PDF_RECOVERY_DIAG_BUILD =
  import.meta.env.DEV || import.meta.env.VITE_STAGING_EMAIL_AUTH === 'true';

const OwnerPdfRecoveryDiagPanel = OWNER_PDF_RECOVERY_DIAG_BUILD
  ? lazy(() =>
      import('./OwnerPdfRecoveryDiagPanel').then((m) => ({
        default: m.OwnerPdfRecoveryDiagPanel,
      })),
    )
  : null;

function useOwnerPdfRecoveryDiagOptIn(): boolean {
  const [optedIn, setOptedIn] = useState(() => {
    if (!OWNER_PDF_RECOVERY_DIAG_BUILD || typeof window === 'undefined') return false;
    try {
      if (new URLSearchParams(window.location.search).get('pdfRecoveryDiag') === '1') return true;
      return window.localStorage.getItem('FW_PDF_RECOVERY_DIAG') === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (!OWNER_PDF_RECOVERY_DIAG_BUILD || typeof window === 'undefined') return;
    try {
      const fromUrl =
        new URLSearchParams(window.location.search).get('pdfRecoveryDiag') === '1';
      if (fromUrl) {
        window.localStorage.setItem('FW_PDF_RECOVERY_DIAG', '1');
        setOptedIn(true);
        return;
      }
      setOptedIn(window.localStorage.getItem('FW_PDF_RECOVERY_DIAG') === '1');
    } catch {
      setOptedIn(false);
    }
  }, []);

  return OWNER_PDF_RECOVERY_DIAG_BUILD && optedIn;
}

function useCoarsePointer(): boolean {
  const [coarsePointer, setCoarsePointer] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse)');
    const update = () => setCoarsePointer(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return coarsePointer;
}

const touchBtnStyle = {
  minHeight: TOUCH_TARGET_MIN_PX,
  minWidth: TOUCH_TARGET_MIN_PX,
  padding: '0 14px',
  touchAction: 'manipulation' as const,
};

interface FreeSpacePdfCardProps {
  objectId: string;
  content: ProjectObjectContent;
  tokens: AtmosphereTokens;
  sectionId: string;
  onChange: (next: ProjectObjectContent) => void;
  onTitleChange?: (title: string) => void;
  /** LOD: keep chrome, suspend PDF viewer until object is active/near. */
  suspendViewer?: boolean;
  linkedNotebookTitle?: string | null;
  relatedMistakeCount?: number;
  /** Phase 0 Course Trap — fires once when PDF viewer becomes ready. */
  onPdfViewerReady?: (payload: { objectId: string; fileName: string; title: string }) => void;
  pdfTitle?: string;
  /** Opens study session for this exam (Study Session V1). */
  onStartStudySession?: () => void;
  /** Opens RV validation surface (single-question split). */
  onStartRvStudy?: () => void;
  /** Opens PDF + Notebook two-surface academic composition. */
  onStartAcademicComposition?: () => void;
  presentation?: 'canvas' | 'study-session' | 'rv-study';
  /** Hide “open in new tab” on coarse pointers (RV surface). */
  suppressExternalTabLink?: boolean;
  /** Focus exam: page/zoom live in StudySessionShell merged bar. */
  suppressStudyToolbar?: boolean;
  /** Lifts mark/highlight chrome into StudySessionShell header. */
  onStudyMarksChromeChange?: (chrome: PdfStudyMarksChrome | null) => void;
  /** Lifts live viewer page into StudySessionShell toolbar (persisted content.page can lag). */
  onPdfLivePageChange?: (page: number) => void;
  onTutorCaptureIntent?: (intent: TutorCaptureIntent) => void;
  onTutorCaptureChromeChange?: (chrome: TutorCaptureChrome | null) => void;
}

/**
 * 100% is fit-width. Older sessions may still have zoom 1.8 stored from the
 * previous Fit width button. That value is a real magnification now and is
 * not rewritten on load.
 */
export const STUDY_SESSION_PDF_FIT_WIDTH_ZOOM = 1;

export function FreeSpacePdfCard({
  objectId,
  content: rawContent,
  tokens,
  sectionId,
  onChange,
  onTitleChange,
  suspendViewer = false,
  linkedNotebookTitle,
  relatedMistakeCount = 0,
  onPdfViewerReady,
  pdfTitle = '',
  onStartStudySession,
  onStartRvStudy,
  onStartAcademicComposition,
  presentation = 'canvas',
  suppressStudyToolbar = false,
  suppressExternalTabLink = false,
  onStudyMarksChromeChange,
  onPdfLivePageChange,
  onTutorCaptureIntent,
  onTutorCaptureChromeChange,
}: FreeSpacePdfCardProps) {
  const { user } = useAuth();
  const content = ensureProjectObjectContent('pdf', rawContent);
  if (content.type !== 'pdf') return null;

  const inRvStudy = presentation === 'rv-study';
  const inStudySession = presentation === 'study-session' || inRvStudy;
  const coarsePointer = useCoarsePointer();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [idbThumbnail, setIdbThumbnail] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'ready' | 'recover' | 'error'>('idle');
  const [dragOver, setDragOver] = useState(false);
  const [visiblePage, setVisiblePage] = useState(content.page);
  const ownerPdfRecoveryDiagOptIn = useOwnerPdfRecoveryDiagOptIn();
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const inline = content.thumbnailDataUrl;
    if (inline) {
      setIdbThumbnail(inline);
      return;
    }
    void loadPdfThumbnail(sectionId, objectId).then(url => {
      if (!cancelled) setIdbThumbnail(url ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [sectionId, objectId, content.thumbnailDataUrl]);

  const thumbSrc = content.thumbnailDataUrl ?? idbThumbnail;

  const revokeIf = useCallback((url: string | null) => {
    if (url && url.startsWith('blob:')) URL.revokeObjectURL(url);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;

    const run = async () => {
      const key = `${sectionId}::${objectId}`;
      if (!content.fileName) {
        pdfUploadDiag('loadEffect:idle', { sectionId, objectId, key, reason: 'no fileName' });
        setLoadState('idle');
        setObjectUrl(prev => {
          revokeIf(prev);
          return null;
        });
        return;
      }
      pdfUploadDiag('loadEffect:start', {
        sectionId,
        objectId,
        key,
        fileName: content.fileName,
        fileSize: content.fileSize,
        metaFileSizeZero: content.fileSize <= 0,
      });
      setLoadState('loading');
      try {
        let blob = await loadPdfBlob(sectionId, objectId);
        if (!blob && user?.id) {
          const hydrateResult = await hydrateSpatialPdfWithCloud({
            userId: user.id,
            sectionId,
            objectId,
            assetType: 'pdf',
          });
          if (hydrateResult === 'cloud_hit') {
            blob = await loadPdfBlob(sectionId, objectId);
          }
        }
        if (cancelled || !mounted.current) return;
        if (!blob) {
          pdfUploadDiag('loadEffect:recover', { sectionId, objectId, key, fileName: content.fileName });
          setLoadState('recover');
          setObjectUrl(prev => {
            revokeIf(prev);
            return null;
          });
          return;
        }
        url = URL.createObjectURL(blob);
        pdfUploadDiag('loadEffect:ready', {
          sectionId,
          objectId,
          key,
          blobSize: blob.size,
          objectUrlPrefix: url.slice(0, 24),
        });
        setObjectUrl(prev => {
          revokeIf(prev);
          return url;
        });
        setLoadState('ready');
      } catch (err) {
        if (!cancelled && mounted.current) {
          pdfUploadDiag('loadEffect:exception', {
            sectionId,
            objectId,
            key,
            error: err instanceof Error ? err.message : String(err),
          });
          setLoadState('recover');
          setObjectUrl(prev => {
            revokeIf(prev);
            return null;
          });
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [sectionId, objectId, content.fileName, revokeIf]);

  const viewerReadyFiredRef = useRef(false);
  useEffect(() => {
    if (loadState !== 'ready' || !content.fileName || viewerReadyFiredRef.current) return;
    viewerReadyFiredRef.current = true;
    onPdfViewerReady?.({
      objectId,
      fileName: content.fileName,
      title: pdfTitle || content.fileName,
    });
  }, [loadState, content.fileName, objectId, pdfTitle, onPdfViewerReady]);

  const applyFile = useCallback(
    async (file: File) => {
      if (!isAcceptablePdfFile(file)) {
        toast.error('Only PDF files are supported for now.');
        return;
      }
      if (!sectionId?.trim()) {
        toast.error('Workspace context missing — reload and try again.');
        return;
      }
      const title = file.name.length > 80 ? `${file.name.slice(0, 78)}…` : file.name;
      const key = `${sectionId}::${objectId}`;
      pdfUploadDiag('applyFile:start', {
        sectionId,
        objectId,
        key,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
      });
      setLoadState('loading');
      try {
        const { blobSize } = await savePdfBlobFromFile(sectionId, objectId, file);
        if (user?.id) {
          await onSpatialPdfSaved({
            userId: user.id,
            sectionId,
            objectId,
            assetType: 'pdf',
          });
        }
        const next: ProjectObjectContent = {
          type: 'pdf',
          fileName: file.name,
          fileType: file.type || 'application/pdf',
          fileSize: blobSize,
          lastOpenedAt: Date.now(),
          page: 1,
          zoom: 1,
          ingestionPhase: 'ready',
        };
        onChange(next);
        onTitleChange?.(title);
        const blob = await loadPdfBlob(sectionId, objectId);
        if (blob) {
          const objectUrl = URL.createObjectURL(blob);
          pdfUploadDiag('applyFile:primeReady', {
            sectionId,
            objectId,
            key,
            blobSize: blob.size,
            objectUrlPrefix: objectUrl.slice(0, 24),
          });
          setObjectUrl(prev => {
            revokeIf(prev);
            return objectUrl;
          });
          setLoadState('ready');
        }
      } catch (err) {
        const next: ProjectObjectContent = {
          type: 'pdf',
          fileName: file.name,
          fileType: file.type || 'application/pdf',
          fileSize: file.size,
          lastOpenedAt: Date.now(),
          page: 1,
          zoom: 1,
          ingestionPhase: 'ready',
        };
        pdfUploadDiag('applyFile:failed', {
          sectionId,
          objectId,
          key,
          error: err instanceof Error ? err.message : String(err),
          diagTail: pdfUploadDiagDump().slice(-8),
        });
        onChange(next);
        onTitleChange?.(title);
        toast.error('Could not store this PDF on this device. Reconnect the same file to try again.');
        setLoadState('recover');
      }
    },
    [sectionId, objectId, onChange, onTitleChange, revokeIf, user?.id],
  );

  useEffect(() => () => flushAllFreeSpacePersistence(), []);

  const handleViewerError = useCallback(() => {
    pdfUploadDiag('viewer:onError', { objectId, sectionId, fileName: content.fileName });
    setLoadState('error');
  }, [objectId, sectionId, content.fileName]);

  const toolbarPage = pdfToolbarDisplayPage(visiblePage, content.pageCount);
  const contentRef = useRef(content);
  contentRef.current = content;
  const publishedPageRef = useRef<number | null>(null);
  const onPdfLivePageChangeRef = useRef(onPdfLivePageChange);
  onPdfLivePageChangeRef.current = onPdfLivePageChange;

  const publishLivePage = useCallback((page: number) => {
    const live = pdfToolbarDisplayPage(page, contentRef.current.pageCount);
    setVisiblePage(live);
    if (publishedPageRef.current === live) return;
    publishedPageRef.current = live;
    onPdfLivePageChangeRef.current?.(live);
  }, []);

  useEffect(() => {
    publishLivePage(content.page);
  }, [content.page, publishLivePage]);

  const handlePagePersist = useCallback(
    (page: number) => {
      const c = contentRef.current;
      const next = applyPdfVisiblePageToContent(c, page);
      if (!next) return;
      onChange(next);
    },
    [onChange],
  );

  const bumpPage = (delta: number) => {
    const nextPage = bumpPdfPage(toolbarPage, delta, content.pageCount);
    onChange({
      ...content,
      page: nextPage,
    });
  };

  const bumpZoom = (delta: number) => {
    const z = Math.min(2.5, Math.max(0.55, Math.round((content.zoom + delta) * 100) / 100));
    onChange({ ...content, zoom: z });
  };

  const [fitPageToken, setFitPageToken] = useState(0);

  const fitWidth = useCallback(() => {
    const current = contentRef.current;
    if (current.zoom === STUDY_SESSION_PDF_FIT_WIDTH_ZOOM) return;
    onChange({ ...current, zoom: STUDY_SESSION_PDF_FIT_WIDTH_ZOOM });
  }, [onChange]);

  const requestFitPage = useCallback(() => {
    setFitPageToken(token => token + 1);
  }, []);

  const commitViewerZoom = useCallback((zoom: number) => {
    const current = contentRef.current;
    const next = Math.min(2.5, Math.max(0.5, Math.round(zoom * 100) / 100));
    if (next === current.zoom) return;
    onChange({ ...current, zoom: next });
  }, [onChange]);

  const jumpToPage = useCallback(
    (page: number) => {
      const nextPage = normalizePdfPage(page, content.pageCount);
      onChange({ ...content, page: nextPage });
    },
    [content, onChange],
  );

  const extractTextRef = useRef<((page: number, region: NormalizedPageRegion) => Promise<string | undefined>) | null>(null);
  const probePageTextLayerRef = useRef<((page: number) => Promise<PageTextLayerProbe>) | null>(null);
  const assessRegionRef = useRef<
    | ((
        page: number,
        region: NormalizedPageRegion,
      ) => Promise<import('../../lib/ai/tutor/captureRegionDiagnostics').CaptureRegionDiagnostics | null>)
    | null
  >(null);
  const renderRegionImageRef = useRef<
    | ((
        page: number,
        region: NormalizedPageRegion,
      ) => Promise<import('../../lib/ai/visualCapture/renderPdfRegionImage').RenderPdfRegionImageResult>)
    | null
  >(null);
  const tutorCapture = useTutorPdfCapture({
    enabled: loadState === "ready" && !suspendViewer,
    sectionId,
    sourceObjectId: objectId,
    pageNumber: visiblePage,
    onIntent: onTutorCaptureIntent,
    onChromeChange: onTutorCaptureChromeChange,
    extractText: region => extractTextRef.current?.(visiblePage, region) ?? Promise.resolve(undefined),
    probePageTextLayer: page =>
      probePageTextLayerRef.current?.(page) ??
      Promise.resolve({
        kind: 'empty',
        itemCount: 0,
        meaningfulCharCount: 0,
        hasReadableText: false,
      }),
    assessRegion: region =>
      assessRegionRef.current?.(visiblePage, region) ?? Promise.resolve(null),
    renderRegionImage: region =>
      renderRegionImageRef.current?.(visiblePage, region) ??
      Promise.resolve({ ok: false, code: 'render_failed' as const }),
  });

  const studyMarks = usePdfStudyMarks({
    sectionId,
    objectId,
    page: visiblePage,
    enabled: inStudySession && loadState === 'ready' && !suspendViewer,
    onJumpToPage: jumpToPage,
    onChromeChange: onStudyMarksChromeChange,
  });

  const border = tokens.cardBorder;
  const well = tokens.wellBg;

  const hasStudyLinks = !!(linkedNotebookTitle || relatedMistakeCount > 0);

  const compactToolbar = (
    <div
      className="flex items-center gap-1 px-2 py-1.5 shrink-0 flex-wrap"
      style={{ borderBottom: `1px solid ${border}`, backgroundColor: well }}
    >
      <button
        type="button"
        title="Previous page"
        className="p-1 rounded-md"
        style={{ color: tokens.textMuted }}
        disabled={toolbarPage <= 1 || loadState !== 'ready'}
        onClick={() => bumpPage(-1)}
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      <span className="text-[10px] tabular-nums px-1" style={{ color: tokens.textMuted }}>
        {formatPdfToolbarPageLabel(toolbarPage, content.pageCount)}
      </span>
      <button
        type="button"
        title="Next page"
        className="p-1 rounded-md"
        style={{ color: tokens.textMuted }}
        onClick={() => bumpPage(1)}
      >
        <ChevronRight className="w-4 h-4" />
      </button>
      <span className="w-px h-3 mx-1" style={{ backgroundColor: border }} />
      <button type="button" title="Zoom out" className="p-1 rounded-md" style={{ color: tokens.textMuted }} onClick={() => bumpZoom(-0.1)}>
        <Minus className="w-3.5 h-3.5" />
      </button>
      <span className="text-[10px] tabular-nums px-1" style={{ color: tokens.textMuted }}>
        {Math.round(content.zoom * 100)}%
      </span>
      <button type="button" title="Zoom in" className="p-1 rounded-md" style={{ color: tokens.textMuted }} onClick={() => bumpZoom(0.1)}>
        <Plus className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        className="text-[10px] font-semibold px-2 py-0.5 rounded-md ml-1"
        style={{ color: tokens.accent, border: `1px solid ${tokens.accent}44` }}
        data-testid="pdf-zoom-fit-width"
        onClick={fitWidth}
      >
        Fit width
      </button>
      <button
        type="button"
        data-testid="pdf-zoom-fit-page"
        className="text-[10px] font-semibold px-2 py-0.5 rounded-md"
        style={{ color: tokens.accent, border: `1px solid ${tokens.accent}44` }}
        onClick={requestFitPage}
      >
        Fit page
      </button>
      {inStudySession && studyMarks.loaded && !onStudyMarksChromeChange ? (
        <>
          <span className="w-px h-3 mx-1" style={{ backgroundColor: border }} />
          <button
            type="button"
            title={studyMarks.isCurrentPageMarked ? 'Unmark page' : 'Mark page'}
            className="p-1 rounded-md"
            style={{ color: studyMarks.isCurrentPageMarked ? tokens.accent : tokens.textMuted }}
            onClick={studyMarks.toggleMarkPage}
          >
            <Bookmark className="w-3.5 h-3.5" fill={studyMarks.isCurrentPageMarked ? 'currentColor' : 'none'} />
          </button>
          <button
            type="button"
            title="Highlight region"
            className="p-1 rounded-md"
            style={{
              color: studyMarks.tool === 'highlight' ? tokens.accent : tokens.textMuted,
            }}
            onClick={() => studyMarks.setTool(studyMarks.tool === 'highlight' ? 'view' : 'highlight')}
          >
            <Highlighter className="w-3.5 h-3.5" />
          </button>
        </>
      ) : null}
    </div>
  );

  return (
    <div
      className={`flex flex-col h-full overflow-hidden${inStudySession ? '' : ' min-h-[200px] rounded-xl'}`}
      style={{
        backgroundColor: 'transparent',
        border: 'none',
        boxShadow: 'none',
      }}
      onDragOver={e => {
        e.preventDefault();
        e.stopPropagation();
        setDragOver(true);
      }}
      onDragLeave={e => {
        e.preventDefault();
        if (e.currentTarget === e.target) setDragOver(false);
      }}
      onDrop={e => {
        e.preventDefault();
        e.stopPropagation();
        setDragOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f) void applyFile(f);
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={e => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void applyFile(f);
        }}
      />

      {inStudySession && !suppressStudyToolbar ? (
        compactToolbar
      ) : !inStudySession ? (
        <div
          className="flex items-center gap-2 px-3 py-2 shrink-0"
          style={{ borderBottom: `1px solid ${border}`, backgroundColor: well }}
        >
          <FileText className="w-4 h-4 shrink-0" strokeWidth={2} style={{ color: tokens.accent }} />
          <span className="text-[12px] font-semibold truncate flex-1 min-w-0" style={{ color: tokens.textPrimary }}>
            {content.documentTitle || content.fileName || 'PDF'}
          </span>
          <button
            type="button"
            className="text-[11px] font-semibold rounded-lg shrink-0 inline-flex items-center justify-center"
            style={{
              color: tokens.textMuted,
              border: `1px solid ${border}`,
              ...(coarsePointer ? touchBtnStyle : { padding: '4px 8px', fontSize: 10 }),
            }}
            onClick={() => fileInputRef.current?.click()}
          >
            {loadState === 'recover' ? 'Reconnect' : content.fileName ? 'Replace' : 'Choose'}
          </button>
          {objectUrl && loadState === 'ready' && (
            <a
              href={objectUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 font-semibold rounded-lg shrink-0"
              style={{
                color: tokens.accent,
                border: `1px solid ${tokens.accent}44`,
                fontSize: coarsePointer ? 11 : 10,
                ...(coarsePointer ? touchBtnStyle : { padding: '4px 8px' }),
              }}
            >
              <ExternalLink className="w-3.5 h-3.5" />
              {coarsePointer ? 'Open in new tab' : 'Tab'}
            </a>
          )}
          {onStartStudySession && loadState === 'ready' && content.fileName ? (
            <button
              type="button"
              className="text-[10px] font-semibold px-2 py-1 rounded-lg shrink-0"
              style={{
                color: '#fff',
                background: tokens.accent,
                border: `1px solid ${tokens.accent}`,
              }}
              onClick={onStartStudySession}
            >
              Study this exam
            </button>
          ) : null}
          {onStartAcademicComposition && loadState === 'ready' && content.fileName ? (
            <button
              type="button"
              data-testid="study-with-notebook-btn"
              className="text-[10px] font-semibold px-2 py-1 rounded-lg shrink-0"
              style={{
                color: tokens.accent,
                background: `${tokens.accent}18`,
                border: `1px solid ${tokens.accent}66`,
              }}
              onClick={onStartAcademicComposition}
            >
              Study with Notebook
            </button>
          ) : null}
          {onStartRvStudy && loadState === 'ready' && content.fileName ? (
            <button
              type="button"
              className="text-[10px] font-semibold px-2 py-1 rounded-lg shrink-0"
              style={{
                color: tokens.accent,
                background: `${tokens.accent}18`,
                border: `1px solid ${tokens.accent}66`,
              }}
              onClick={onStartRvStudy}
            >
              Work on this question
            </button>
          ) : null}
        </div>
      ) : null}

      {!inStudySession && hasStudyLinks ? (
        <div
          className="px-3 py-1.5 shrink-0"
          style={{ borderBottom: `1px solid ${border}`, backgroundColor: `${tokens.accent}0c` }}
        >
          <p style={{ margin: 0, fontSize: 10.5, color: tokens.textMuted, lineHeight: 1.4 }}>
            {linkedNotebookTitle ? (
              <span>
                Referenced in <span style={{ color: tokens.textSecondary }}>{linkedNotebookTitle}</span>
              </span>
            ) : null}
            {linkedNotebookTitle && relatedMistakeCount > 0 ? ' · ' : null}
            {relatedMistakeCount > 0 ? (
              <span>
                {relatedMistakeCount} related mistake{relatedMistakeCount === 1 ? '' : 's'}
              </span>
            ) : null}
          </p>
        </div>
      ) : null}

      {!inStudySession ? compactToolbar : null}

      <div
        className={`flex-1 min-h-0 relative${inStudySession ? ' overflow-hidden' : ''}`}
        style={{ backgroundColor: tokens.wellBg }}
      >
        {coarsePointer && objectUrl && loadState === 'ready' && !suppressExternalTabLink ? (
          <a
            href={objectUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute top-2 right-2 z-20 flex items-center gap-1 font-semibold rounded-lg"
            style={{
              color: tokens.accent,
              backgroundColor: `${tokens.pageBg}ee`,
              border: `1px solid ${tokens.accent}55`,
              fontSize: 11,
              ...touchBtnStyle,
            }}
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Open in new tab
          </a>
        ) : null}
        {/* Shimmer — shown while ingestion is in progress (brief, resolves to thumbnail) */}
        {content.ingestionPhase === 'materializing' && (
          <div
            aria-hidden
            style={{
              position: 'absolute', inset: 0, zIndex: 12, pointerEvents: 'none',
              background: `linear-gradient(
                90deg,
                ${tokens.wellBg} 0%,
                rgba(255,255,255,0.04) 40%,
                ${tokens.wellBg} 80%
              )`,
              backgroundSize: '200% 100%',
              animation: 'fw-pdf-shimmer 1.6s ease-in-out infinite',
            }}
          />
        )}

        {/* Loading state (blob fetching from IDB) */}
        {loadState === 'loading' && content.ingestionPhase !== 'materializing' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 z-10" style={{ backgroundColor: `${tokens.pageBg}cc` }}>
            <Loader2 className="w-7 h-7 animate-spin" style={{ color: tokens.textMuted }} />
          </div>
        )}

        {(loadState === 'idle' || loadState === 'recover' || loadState === 'error') && !objectUrl && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center z-[5]"
            style={{
              border: dragOver ? `1px dashed ${tokens.accent}` : '1px dashed transparent',
              borderRadius: '8px',
              margin: '8px',
            }}
          >
            <FolderOpen className="w-8 h-8" strokeWidth={1.25} style={{ color: tokens.textMuted }} />
            {loadState === 'recover' || loadState === 'error' ? (
              <>
                <p className="text-[12px] leading-relaxed max-w-[220px]" style={{ color: tokens.textMuted }}>
                  {loadState === 'error'
                    ? 'This PDF could not be shown inline. Try reconnecting the file or open in a new tab after reconnecting.'
                    : 'File data is not in this browser session. Reconnect the same PDF — it stays on your device only.'}
                </p>
                <button
                  type="button"
                  className="text-[12px] font-semibold rounded-xl inline-flex items-center justify-center"
                  style={{
                    backgroundColor: `${tokens.accent}22`,
                    color: tokens.accent,
                    border: `1px solid ${tokens.accent}55`,
                    ...touchBtnStyle,
                  }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  Reconnect file
                </button>
                <p
                  className="text-[9px] leading-snug max-w-[260px] font-mono text-left opacity-70"
                  style={{ color: tokens.textGhost }}
                >
                  {pdfUploadDiagDump()
                    .slice(-4)
                    .map(e => `${e.phase}${e.data?.error ? `: ${String(e.data.error)}` : ''}`)
                    .join(' | ') || `key ${sectionId}::${objectId}`}
                </p>
              </>
            ) : (
              <>
                <p className="text-[12px] font-medium" style={{ color: tokens.textMuted }}>
                  Drop or choose a PDF
                </p>
                <button
                  type="button"
                  className="text-[12px] font-semibold rounded-xl inline-flex items-center justify-center"
                  style={{
                    backgroundColor: tokens.wellBg,
                    color: tokens.textPrimary,
                    border: `1px solid ${border}`,
                    ...touchBtnStyle,
                  }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  Choose PDF…
                </button>
              </>
            )}
          </div>
        )}

        {suspendViewer && loadState === 'ready' && (
          <div
            className="absolute inset-0 flex items-center justify-center overflow-hidden"
            style={{ backgroundColor: tokens.wellBg }}
          >
            {thumbSrc ? (
              /* Thumbnail — first page preview at rest, no label, no decoration */
              <img
                src={thumbSrc}
                alt=""
                aria-hidden
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  objectPosition: 'top center',
                  opacity: 0.55,
                  display: 'block',
                }}
              />
            ) : (
              /* Fallback when no thumbnail was extracted */
              <p className="text-[11px] text-center" style={{ color: tokens.textGhost }}>
                PDF paused — select to view
              </p>
            )}
          </div>
        )}

        {objectUrl && loadState === 'ready' && !suspendViewer ? (
          <PdfJsScrollViewer
            blobUrl={objectUrl}
            page={content.page}
            zoom={content.zoom}
            pageCount={content.pageCount}
            backgroundColor={tokens.wellBg}
            onVisiblePageChange={publishLivePage}
            onPagePersist={handlePagePersist}
            onError={handleViewerError}
            onExtractTextReady={(extractor, probe, assess, renderRegion) => {
              extractTextRef.current = extractor;
              probePageTextLayerRef.current = probe;
              assessRegionRef.current = assess;
              renderRegionImageRef.current = renderRegion;
            }}
            fitPageToken={fitPageToken}
            onCommitZoom={commitViewerZoom}
            renderPageOverlay={
              (studyMarks.loaded || tutorCapture.captureMode || !!tutorCapture.selection)
                ? () => (
                    <>
                      {studyMarks.loaded ? (
                        <PdfStudyMarksOverlay
                          tokens={tokens}
                          regions={studyMarks.currentRegions}
                          tool={tutorCapture.captureMode ? "view" : studyMarks.tool}
                          onAddRegion={studyMarks.addRegion}
                          onRemoveRegion={studyMarks.removeRegion}
                        />
                      ) : null}
                      <PdfTutorCaptureOverlay
                        tokens={tokens}
                        active={tutorCapture.captureMode}
                        selection={tutorCapture.selection}
                        onCommitSelection={tutorCapture.commitSelection}
                        onChooseAction={tutorCapture.chooseAction}
                        onClearSelection={tutorCapture.clearSelection}
                        onCancelCapture={tutorCapture.cancel}
                      />
                    </>
                  )
                : undefined
            }
          />
        ) : null}
      </div>
      {/*
        Must be a shrink-0 sibling BELOW the flex-1 viewer well.
        PdfJsScrollViewer uses absolute inset-0; mounting the panel inside that
        well hides it under the viewer / clips it via ancestor overflow-hidden.
      */}
      {OWNER_PDF_RECOVERY_DIAG_BUILD &&
      OwnerPdfRecoveryDiagPanel &&
      ownerPdfRecoveryDiagOptIn ? (
        <div className="shrink-0 relative z-30" data-testid="owner-pdf-recovery-diag-slot">
          <Suspense
            fallback={
              <div
                style={{
                  padding: '6px 10px',
                  fontSize: 11,
                  color: '#64748b',
                  borderTop: '1px dashed #94a3b8',
                }}
              >
                Loading PDF recovery diag…
              </div>
            }
          >
            <OwnerPdfRecoveryDiagPanel
              sectionId={sectionId}
              sourceObjectId={objectId}
              pageNumber={visiblePage}
            />
          </Suspense>
        </div>
      ) : null}
    </div>
  );
}
