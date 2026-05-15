import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import toast from 'react-hot-toast';
import { ExternalLink, FileText, FolderOpen, Loader2, Minus, Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import type { ProjectObjectContent } from '../../hooks/useSectionFreeSpaceObjects';
import { ensureProjectObjectContent } from '../../hooks/useSectionFreeSpaceObjects';
import { isAcceptablePdfFile, loadPdfBlob, savePdfBlob } from '../../lib/freeSpacePdfIdb';

interface FreeSpacePdfCardProps {
  objectId: string;
  content: ProjectObjectContent;
  tokens: AtmosphereTokens;
  sectionId: string;
  onChange: (next: ProjectObjectContent) => void;
  onTitleChange?: (title: string) => void;
}

export function FreeSpacePdfCard({
  objectId,
  content: rawContent,
  tokens,
  sectionId,
  onChange,
  onTitleChange,
}: FreeSpacePdfCardProps) {
  const content = ensureProjectObjectContent('pdf', rawContent);
  if (content.type !== 'pdf') return null;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'ready' | 'recover' | 'error'>('idle');
  const [dragOver, setDragOver] = useState(false);
  const mounted = useRef(true);

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

  const applyFile = useCallback(
    async (file: File) => {
      if (!isAcceptablePdfFile(file)) {
        toast.error('Only PDF files are supported for now.');
        return;
      }
      try {
        await savePdfBlob(sectionId, objectId, file);
        const next: ProjectObjectContent = {
          type: 'pdf',
          fileName: file.name,
          fileType: file.type || 'application/pdf',
          fileSize: file.size,
          lastOpenedAt: Date.now(),
          page: 1,
          zoom: 1,
        };
        onChange(next);
        onTitleChange?.(file.name.length > 80 ? `${file.name.slice(0, 78)}…` : file.name);
        setLoadState('loading');
      } catch {
        toast.error('Could not store this PDF on this device.');
      }
    },
    [sectionId, objectId, onChange, onTitleChange],
  );

  const [displayPage, setDisplayPage] = useState(content.page);
  useEffect(() => {
    const timer = window.setTimeout(() => setDisplayPage(content.page), 280);
    return () => window.clearTimeout(timer);
  }, [content.page]);

  const iframeSrc =
    objectUrl && loadState === 'ready'
      ? `${objectUrl}#page=${Math.max(1, displayPage)}&toolbar=0&navpanes=0`
      : '';

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

  const border = tokens.cardBorder;
  const well = tokens.wellBg;

  return (
    <div
      className="flex flex-col h-full min-h-[200px] rounded-xl overflow-hidden"
      style={{
        backgroundColor: `${tokens.cardBg}f2`,
        border: `1px solid ${tokens.cardBorderHover}`,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
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

      <div
        className="flex items-center gap-2 px-3 py-2 shrink-0"
        style={{ borderBottom: `1px solid ${border}`, backgroundColor: well }}
      >
        <FileText className="w-4 h-4 shrink-0" strokeWidth={2} style={{ color: tokens.accent }} />
        <span className="text-[12px] font-semibold truncate flex-1 min-w-0" style={{ color: tokens.textPrimary }}>
          {content.fileName || 'PDF'}
        </span>
        <button
          type="button"
          className="text-[10px] font-semibold px-2 py-1 rounded-lg shrink-0"
          style={{ color: tokens.textMuted, border: `1px solid ${border}` }}
          onClick={() => fileInputRef.current?.click()}
        >
          {loadState === 'recover' ? 'Reconnect' : content.fileName ? 'Replace' : 'Choose'}
        </button>
        {objectUrl && loadState === 'ready' && (
          <a
            href={objectUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-lg shrink-0"
            style={{ color: tokens.accent, border: `1px solid ${tokens.accent}44` }}
          >
            <ExternalLink className="w-3 h-3" />
            Tab
          </a>
        )}
      </div>

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
          Page {content.page}
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

      <div className="flex-1 min-h-0 relative" style={{ backgroundColor: tokens.wellBg }}>
        {loadState === 'loading' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 z-10" style={{ backgroundColor: `${tokens.pageBg}cc` }}>
            <Loader2 className="w-7 h-7 animate-spin" style={{ color: tokens.textMuted }} />
            <span className="text-[11px]" style={{ color: tokens.textMuted }}>
              Loading…
            </span>
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
                  className="text-[11px] font-semibold px-3 py-2 rounded-xl"
                  style={{ backgroundColor: `${tokens.accent}22`, color: tokens.accent, border: `1px solid ${tokens.accent}55` }}
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
                  className="text-[11px] font-semibold px-3 py-2 rounded-xl"
                  style={{ backgroundColor: tokens.wellBg, color: tokens.textPrimary, border: `1px solid ${border}` }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  Choose PDF…
                </button>
              </>
            )}
          </div>
        )}

        {iframeSrc && (
          <iframe
            title={content.fileName || 'PDF'}
            src={iframeSrc}
            className="border-0"
            style={
              {
                zoom: content.zoom,
                width: '100%',
                height: '100%',
                minHeight: '420px',
                backgroundColor: tokens.wellBg,
              } as CSSProperties
            }
            onError={() => {
              setObjectUrl(prev => {
                revokeIf(prev);
                return null;
              });
              setLoadState('error');
            }}
          />
        )}
      </div>
    </div>
  );
}
