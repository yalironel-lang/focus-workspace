import { useCallback, useEffect, useRef, useState } from 'react';
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
import { isAcceptablePdfFile, loadPdfBlob, savePdfBlob } from '../../lib/freeSpacePdfIdb';
import { flickerDebugLog } from '../../lib/flickerDebug';
import type { PdfStudyMarksChrome } from '../../lib/pdfStudyMarks/usePdfStudyMarks';
import { usePdfStudyMarks } from '../../lib/pdfStudyMarks/usePdfStudyMarks';
import { PdfStudyMarksOverlay } from './PdfStudyMarksOverlay';
import { TOUCH_TARGET_MIN_PX } from '../../lib/ui/touchTarget';

const IFRAME_LOAD_TIMEOUT_MS = 8000;

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
  /** LOD: keep chrome, suspend iframe until object is active/near. */
  suspendViewer?: boolean;
  linkedNotebookTitle?: string | null;
  relatedMistakeCount?: number;
  /** Phase 0 Course Trap — fires once when PDF viewer becomes ready. */
  onPdfViewerReady?: (payload: { objectId: string; fileName: string; title: string }) => void;
  pdfTitle?: string;
  /** Opens study session for this exam (Study Session V1). */
  onStartStudySession?: () => void;
  presentation?: 'canvas' | 'study-session';
  /** Focus exam: page/zoom live in StudySessionShell merged bar. */
  suppressStudyToolbar?: boolean;
  /** Lifts mark/highlight chrome into StudySessionShell header. */
  onStudyMarksChromeChange?: (chrome: PdfStudyMarksChrome | null) => void;
}

export const STUDY_SESSION_PDF_FIT_WIDTH_ZOOM = 1.8;

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
  presentation = 'canvas',
  suppressStudyToolbar = false,
  onStudyMarksChromeChange,
}: FreeSpacePdfCardProps) {
  const content = ensureProjectObjectContent('pdf', rawContent);
  if (content.type !== 'pdf') return null;

  const inStudySession = presentation === 'study-session';
  const coarsePointer = useCoarsePointer();
  const useTransformZoom = coarsePointer || inStudySession;
  const forceIframeRemount = coarsePointer || inStudySession;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'ready' | 'recover' | 'error'>('idle');
  const [dragOver, setDragOver] = useState(false);
  const mounted = useRef(true);
  const iframeLoadTimerRef = useRef<number | null>(null);
  const iframeLoadedRef = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const revokeIf = useCallback((url: string | null) => {
    if (url && url.startsWith('blob:')) URL.revokeObjectURL(url);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;

    const run = async () => {
      if (!content.fileName || content.fileSize <= 0) {
        setLoadState('idle');
        setObjectUrl(prev => {
          revokeIf(prev);
          return null;
        });
        return;
      }
      setLoadState('loading');
      try {
        const blob = await loadPdfBlob(sectionId, objectId);
        if (cancelled || !mounted.current) return;
        if (!blob) {
          setLoadState('recover');
          setObjectUrl(prev => {
            revokeIf(prev);
            return null;
          });
          return;
        }
        url = URL.createObjectURL(blob);
        setObjectUrl(prev => {
          revokeIf(prev);
          return url;
        });
        setLoadState('ready');
      } catch {
        if (!cancelled && mounted.current) {
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
  }, [sectionId, objectId, content.fileName, content.fileSize, revokeIf]);

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
      onChange(next);
      onTitleChange?.(file.name.length > 80 ? `${file.name.slice(0, 78)}…` : file.name);
      setLoadState('loading');
      try {
        await savePdfBlob(sectionId, objectId, file);
      } catch {
        toast.error('Could not store this PDF on this device. Reconnect the same file to try again.');
        setLoadState('recover');
      }
    },
    [sectionId, objectId, onChange, onTitleChange],
  );

  const [displayPage, setDisplayPage] = useState(content.page);
  useEffect(() => {
    if (forceIframeRemount) {
      setDisplayPage(content.page);
      return;
    }
    const timer = window.setTimeout(() => setDisplayPage(content.page), 280);
    return () => window.clearTimeout(timer);
  }, [content.page, forceIframeRemount]);

  const iframeSrc =
    objectUrl && loadState === 'ready'
      ? `${objectUrl}#page=${Math.max(1, displayPage)}&toolbar=0&navpanes=0`
      : '';

  const clearIframeLoadTimer = useCallback(() => {
    if (iframeLoadTimerRef.current != null) {
      window.clearTimeout(iframeLoadTimerRef.current);
      iframeLoadTimerRef.current = null;
    }
  }, []);

  const handleIframeError = useCallback(() => {
    clearIframeLoadTimer();
    setObjectUrl(prev => {
      revokeIf(prev);
      return null;
    });
    setLoadState('error');
  }, [clearIframeLoadTimer, revokeIf]);

  const handleIframeLoad = useCallback(() => {
    iframeLoadedRef.current = true;
    clearIframeLoadTimer();
  }, [clearIframeLoadTimer]);

  useEffect(() => {
    if (!iframeSrc || suspendViewer) {
      clearIframeLoadTimer();
      return;
    }
    iframeLoadedRef.current = false;
    clearIframeLoadTimer();
    iframeLoadTimerRef.current = window.setTimeout(() => {
      if (!iframeLoadedRef.current && mounted.current) {
        setObjectUrl(prev => {
          revokeIf(prev);
          return null;
        });
        setLoadState('error');
      }
    }, IFRAME_LOAD_TIMEOUT_MS);
    return clearIframeLoadTimer;
  }, [iframeSrc, suspendViewer, content.page, displayPage, clearIframeLoadTimer, revokeIf]);

  const iframeRemountKey = forceIframeRemount
    ? `${objectId}-p${content.page}`
    : objectId;

  useEffect(() => {
    if (iframeSrc) flickerDebugLog('pdf-iframe-src', `${objectId} p${displayPage}`);
  }, [iframeSrc, objectId, displayPage]);

  const bumpPage = (delta: number) => {
    onChange({
      ...content,
      page: Math.max(1, content.page + delta),
    });
  };

  const bumpZoom = (delta: number) => {
    const z = Math.min(2.5, Math.max(0.55, Math.round((content.zoom + delta) * 100) / 100));
    onChange({ ...content, zoom: z });
  };

  const fitWidth = useCallback(() => {
    onChange({ ...content, zoom: STUDY_SESSION_PDF_FIT_WIDTH_ZOOM });
  }, [content, onChange]);

  const jumpToPage = useCallback(
    (page: number) => {
      onChange({ ...content, page: Math.max(1, page) });
    },
    [content, onChange],
  );

  const studyMarks = usePdfStudyMarks({
    sectionId,
    objectId,
    page: content.page,
    enabled: inStudySession && loadState === 'ready',
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
        disabled={content.page <= 1 || loadState !== 'ready'}
        onClick={() => bumpPage(-1)}
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      <span className="text-[10px] tabular-nums px-1" style={{ color: tokens.textMuted }}>
        {content.pageCount ? `Page ${content.page} / ${content.pageCount}` : `Page ${content.page}`}
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
        onClick={fitWidth}
      >
        Fit width
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

      {!inStudySession ? (
        <div
          className="flex items-center gap-1 px-2 py-1.5 shrink-0 flex-wrap"
          style={{ borderBottom: `1px solid ${border}`, backgroundColor: `${tokens.wellBg}dd` }}
        >
          <button
            type="button"
            title="Previous page"
            className="p-1 rounded-md"
            style={{ color: tokens.textMuted }}
            disabled={content.page <= 1 || loadState !== 'ready'}
            onClick={() => bumpPage(-1)}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-[10px] tabular-nums px-1" style={{ color: tokens.textMuted }}>
            {content.pageCount ? `Page ${content.page} / ${content.pageCount}` : `Page ${content.page}`}
          </span>
          <button type="button" title="Next page" className="p-1 rounded-md" style={{ color: tokens.textMuted }} onClick={() => bumpPage(1)}>
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
        </div>
      ) : null}

      <div
        className={`flex-1 min-h-0 relative${inStudySession ? ' overflow-hidden' : ''}`}
        style={{ backgroundColor: tokens.wellBg }}
      >
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
            {content.thumbnailDataUrl ? (
              /* Thumbnail — first page preview at rest, no label, no decoration */
              <img
                src={content.thumbnailDataUrl}
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

        {iframeSrc && !suspendViewer && useTransformZoom ? (
          <div className="absolute inset-0 overflow-auto" style={{ backgroundColor: tokens.wellBg }}>
            <div
              style={{
                position: 'relative',
                width: `${100 / content.zoom}%`,
                minHeight: `${100 / content.zoom}%`,
                transform: `scale(${content.zoom})`,
                transformOrigin: 'top left',
              }}
            >
              <iframe
                key={iframeRemountKey}
                title={content.fileName || 'PDF'}
                src={iframeSrc}
                className="border-0 block"
                style={{
                  width: '100%',
                  height: '100%',
                  minHeight: inStudySession ? '720px' : '420px',
                  backgroundColor: tokens.wellBg,
                }}
                onLoad={handleIframeLoad}
                onError={handleIframeError}
              />
              {inStudySession && studyMarks.loaded ? (
                <PdfStudyMarksOverlay
                  tokens={tokens}
                  regions={studyMarks.currentRegions}
                  tool={studyMarks.tool}
                  onAddRegion={studyMarks.addRegion}
                  onRemoveRegion={studyMarks.removeRegion}
                />
              ) : null}
            </div>
          </div>
        ) : null}
        {iframeSrc && !suspendViewer && !useTransformZoom ? (
          <iframe
            key={iframeRemountKey}
            title={content.fileName || 'PDF'}
            src={iframeSrc}
            className="border-0"
            style={{
              zoom: content.zoom,
              width: '100%',
              height: '100%',
              minHeight: '420px',
              backgroundColor: tokens.wellBg,
            }}
            onLoad={handleIframeLoad}
            onError={handleIframeError}
          />
        ) : null}
      </div>
    </div>
  );
}
