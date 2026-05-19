import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  ExternalLink,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  Loader2,
  Presentation,
} from 'lucide-react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import type { ProjectObjectContent } from '../../hooks/useSectionFreeSpaceObjects';
import { ensureProjectObjectContent } from '../../hooks/useSectionFreeSpaceObjects';
import {
  isAcceptableOfficeStudyFile,
  loadStudyFileBlob,
  saveStudyFileBlob,
} from '../../lib/freeSpaceStudyFileIdb';
import {
  continuityLabelForStudyFile,
  openStudyFileExternally,
  studyFileKindLabel,
  studyFileRoleLabel,
  STUDY_FILE_ROLE_OPTIONS,
  type StudyFileKind,
  type StudyFileRole,
} from '../../lib/studyFiles';
import { FreeSpacePdfCard } from './FreeSpacePdfCard';

interface Props {
  objectId: string;
  content: ProjectObjectContent;
  tokens: AtmosphereTokens;
  sectionId: string;
  onChange: (next: ProjectObjectContent) => void;
  onTitleChange?: (title: string) => void;
  suspendViewer?: boolean;
  linkedNotebookTitle?: string | null;
  relatedMistakeCount?: number;
}

function kindIcon(kind: StudyFileKind) {
  if (kind === 'xlsx' || kind === 'google-sheet') return FileSpreadsheet;
  if (kind === 'pptx' || kind === 'google-slides') return Presentation;
  return FileText;
}

function isGoogleKind(kind: StudyFileKind): boolean {
  return kind === 'google-doc' || kind === 'google-sheet' || kind === 'google-slides';
}

export function FreeSpaceStudyFileCard({
  objectId,
  content: rawContent,
  tokens,
  sectionId,
  onChange,
  onTitleChange,
  suspendViewer = false,
  linkedNotebookTitle,
  relatedMistakeCount = 0,
}: Props) {
  const content = ensureProjectObjectContent('studyfile', rawContent);
  if (content.type !== 'studyfile') return null;

  if (content.fileKind === 'pdf') {
    const pdfContent: ProjectObjectContent = {
      type: 'pdf',
      fileName: content.fileName,
      fileType: content.fileType,
      fileSize: content.fileSize,
      lastOpenedAt: content.lastOpenedAt,
      page: content.page,
      zoom: content.zoom,
    };
    return (
      <FreeSpacePdfCard
        objectId={objectId}
        content={pdfContent}
        tokens={tokens}
        sectionId={sectionId}
        onChange={next => {
          if (next.type !== 'pdf') return;
          onChange({
            type: 'studyfile',
            fileName: next.fileName,
            fileType: next.fileType,
            fileSize: next.fileSize,
            fileKind: 'pdf',
            role: content.role,
            usageLabel: content.usageLabel,
            externalUrl: content.externalUrl,
            lastOpenedAt: next.lastOpenedAt,
            page: next.page,
            zoom: next.zoom,
          });
        }}
        onTitleChange={onTitleChange}
        suspendViewer={suspendViewer}
        linkedNotebookTitle={linkedNotebookTitle}
        relatedMistakeCount={relatedMistakeCount}
      />
    );
  }

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'ready' | 'recover' | 'error'>('idle');
  const [dragOver, setDragOver] = useState(false);
  const mounted = useRef(true);

  const isGoogle = isGoogleKind(content.fileKind);
  const isOffice =
    content.fileKind === 'docx' || content.fileKind === 'pptx' || content.fileKind === 'xlsx';
  const hasLocalFile = content.fileSize > 0 && !!content.fileName;
  const displayTitle = continuityLabelForStudyFile(
    content.fileKind,
    content.role,
    content.usageLabel,
    content.fileName,
  );
  const Icon = kindIcon(content.fileKind);
  const hasStudyLinks = !!(linkedNotebookTitle || relatedMistakeCount > 0);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const revokeIf = useCallback((url: string | null) => {
    if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
  }, []);

  useEffect(() => {
    if (isGoogle || !hasLocalFile) {
      setLoadState('idle');
      setBlobUrl(prev => {
        revokeIf(prev);
        return null;
      });
      return;
    }

    let cancelled = false;
    let url: string | null = null;

    const run = async () => {
      setLoadState('loading');
      try {
        const blob = await loadStudyFileBlob(sectionId, objectId);
        if (cancelled || !mounted.current) return;
        if (!blob) {
          setLoadState('recover');
          setBlobUrl(prev => {
            revokeIf(prev);
            return null;
          });
          return;
        }
        url = URL.createObjectURL(blob);
        setBlobUrl(prev => {
          revokeIf(prev);
          return url;
        });
        setLoadState('ready');
      } catch {
        if (!cancelled && mounted.current) setLoadState('error');
      }
    };

    void run();
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [sectionId, objectId, content.fileName, content.fileSize, hasLocalFile, isGoogle, revokeIf]);

  const touchOpened = useCallback(() => {
    onChange({ ...content, lastOpenedAt: Date.now() });
  }, [content, onChange]);

  const handleOpenExternal = useCallback(() => {
    openStudyFileExternally({
      fileKind: content.fileKind,
      externalUrl: content.externalUrl,
      blobUrl,
      fileName: content.fileName,
    });
    touchOpened();
  }, [content, blobUrl, touchOpened]);

  const applyFile = useCallback(
    async (file: File) => {
      if (!isAcceptableOfficeStudyFile(file)) {
        toast.error('Use Word (.docx), PowerPoint (.pptx), or Excel (.xlsx).');
        return;
      }
      try {
        await saveStudyFileBlob(sectionId, objectId, file);
        const kind: StudyFileKind =
          file.name.toLowerCase().endsWith('.pptx') || file.name.toLowerCase().endsWith('.ppt')
            ? 'pptx'
            : file.name.toLowerCase().match(/\.xls/)
              ? 'xlsx'
              : 'docx';
        onChange({
          ...content,
          fileName: file.name,
          fileType: file.type || '',
          fileSize: file.size,
          fileKind: kind,
          lastOpenedAt: Date.now(),
        });
        onTitleChange?.(file.name.length > 80 ? `${file.name.slice(0, 78)}…` : file.name);
      } catch {
        toast.error('Could not store this file on this device.');
      }
    },
    [sectionId, objectId, content, onChange, onTitleChange],
  );

  const setRole = (role: StudyFileRole) => {
    onChange({ ...content, role });
  };

  const border = tokens.cardBorder;
  const well = tokens.wellBg;

  const contextualHint = (() => {
    if (linkedNotebookTitle && relatedMistakeCount > 0) {
      return `Referenced in ${linkedNotebookTitle} · ${relatedMistakeCount} related mistake${relatedMistakeCount === 1 ? '' : 's'}`;
    }
    if (linkedNotebookTitle) return `Referenced in ${linkedNotebookTitle}`;
    if (relatedMistakeCount > 0) {
      return `Used in ${relatedMistakeCount} mistake${relatedMistakeCount === 1 ? '' : 's'}`;
    }
    if (content.role === 'assignment' && content.fileKind === 'xlsx') return 'Continue spreadsheet review in your editor';
    if (content.role === 'lecture' && content.fileKind === 'pptx') return 'Linked lecture slides — open when reviewing notes';
    if (isGoogle) return 'Opens in Google — stays connected to this workspace';
    if (isOffice) return 'Preview here is light — open in Word, PowerPoint, or Excel to study';
    return null;
  })();

  return (
    <div
      className="flex flex-col h-full min-h-[200px] rounded-xl overflow-hidden"
      style={{
        backgroundColor: `${tokens.cardBg}ff`,
        border: `1px solid ${tokens.cardBorderHover}`,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
      }}
      onDragOver={e => {
        if (!isOffice) return;
        e.preventDefault();
        e.stopPropagation();
        setDragOver(true);
      }}
      onDragLeave={e => {
        if (e.currentTarget === e.target) setDragOver(false);
      }}
      onDrop={e => {
        if (!isOffice) return;
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
        accept=".doc,.docx,.ppt,.pptx,.xls,.xlsx,.xlsm,.csv"
        className="hidden"
        onChange={e => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void applyFile(f);
        }}
      />

      <div
        className="flex items-center gap-2 px-3 py-2 shrink-0 flex-wrap"
        style={{ borderBottom: `1px solid ${border}`, backgroundColor: well }}
      >
        <Icon className="w-4 h-4 shrink-0" strokeWidth={2} style={{ color: tokens.accent }} />
        <span className="text-[12px] font-semibold truncate flex-1 min-w-0" style={{ color: tokens.textPrimary }}>
          {displayTitle}
        </span>
        <span
          className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded shrink-0"
          style={{ color: tokens.textMuted, border: `1px solid ${border}` }}
        >
          {studyFileKindLabel(content.fileKind)}
        </span>
        {isOffice && (
          <button
            type="button"
            className="text-[10px] font-semibold px-2 py-1 rounded-lg shrink-0"
            style={{ color: tokens.textMuted, border: `1px solid ${border}` }}
            onClick={() => fileInputRef.current?.click()}
          >
            {hasLocalFile ? 'Replace' : 'Attach'}
          </button>
        )}
        {(isGoogle || (hasLocalFile && loadState === 'ready') || content.externalUrl) && (
          <button
            type="button"
            className="flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-lg shrink-0"
            style={{ color: tokens.accent, border: `1px solid ${tokens.accent}44` }}
            onClick={handleOpenExternal}
          >
            <ExternalLink className="w-3 h-3" />
            {isGoogle ? 'Open in Google' : 'Open externally'}
          </button>
        )}
      </div>

      {hasStudyLinks || contextualHint ? (
        <div
          className="px-3 py-1.5 shrink-0"
          style={{ borderBottom: `1px solid ${border}`, backgroundColor: `${tokens.accent}0c` }}
        >
          <p style={{ margin: 0, fontSize: 10.5, color: tokens.textMuted, lineHeight: 1.4 }}>
            {contextualHint}
          </p>
        </div>
      ) : null}

      <div className="flex-1 min-h-0 flex flex-col" style={{ backgroundColor: tokens.wellBg }}>
        {loadState === 'loading' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-2">
            <Loader2 className="w-7 h-7 animate-spin" style={{ color: tokens.textMuted }} />
            <span className="text-[11px]" style={{ color: tokens.textMuted }}>
              Loading…
            </span>
          </div>
        )}

        {isGoogle && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
            <Icon className="w-10 h-10" strokeWidth={1.25} style={{ color: tokens.accent }} />
            <p className="text-[13px] font-medium max-w-[260px]" style={{ color: tokens.textPrimary }}>
              {studyFileKindLabel(content.fileKind)}
            </p>
            <p className="text-[11px] leading-relaxed max-w-[280px]" style={{ color: tokens.textMuted }}>
              Study in Google — this card keeps the link tied to notebooks, mistakes, and review.
            </p>
            {!suspendViewer && (
              <button
                type="button"
                className="text-[11px] font-semibold px-3 py-2 rounded-xl"
                style={{ backgroundColor: `${tokens.accent}22`, color: tokens.accent, border: `1px solid ${tokens.accent}55` }}
                onClick={handleOpenExternal}
              >
                Open in new tab
              </button>
            )}
            {suspendViewer && (
              <p className="text-[11px]" style={{ color: tokens.textGhost }}>
                Paused — select to interact
              </p>
            )}
          </div>
        )}

        {isOffice && !isGoogle && (
          <div
            className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center"
            style={{
              border: dragOver ? `1px dashed ${tokens.accent}` : undefined,
              margin: dragOver ? 8 : 0,
              borderRadius: dragOver ? 8 : undefined,
            }}
          >
            {!hasLocalFile || loadState === 'recover' || loadState === 'error' ? (
              <>
                <FolderOpen className="w-8 h-8" strokeWidth={1.25} style={{ color: tokens.textMuted }} />
                <p className="text-[12px] leading-relaxed max-w-[240px]" style={{ color: tokens.textMuted }}>
                  {loadState === 'recover'
                    ? 'Reconnect the same file on this device — metadata and links stay.'
                    : 'Drop or attach a file. Opens in your usual app; this workspace keeps context.'}
                </p>
                <button
                  type="button"
                  className="text-[11px] font-semibold px-3 py-2 rounded-xl"
                  style={{ backgroundColor: tokens.wellBg, color: tokens.textPrimary, border: `1px solid ${border}` }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  Choose file…
                </button>
              </>
            ) : (
              <>
                <Icon className="w-9 h-9" strokeWidth={1.25} style={{ color: tokens.accent }} />
                <p className="text-[12px] font-medium" style={{ color: tokens.textPrimary }}>
                  {content.fileName}
                </p>
                <p className="text-[11px] max-w-[260px]" style={{ color: tokens.textMuted }}>
                  Lightweight preview only — use Open externally to study in Word, PowerPoint, or Excel.
                </p>
                {!suspendViewer && loadState === 'ready' && (
                  <button
                    type="button"
                    className="text-[11px] font-semibold px-3 py-2 rounded-xl"
                    style={{ backgroundColor: `${tokens.accent}22`, color: tokens.accent, border: `1px solid ${tokens.accent}55` }}
                    onClick={handleOpenExternal}
                  >
                    Open externally
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {!isGoogle && !isOffice && content.fileKind === 'web' && content.externalUrl && (
          <div className="flex-1 flex flex-col items-center justify-center p-6">
            <p className="text-[11px] mb-3" style={{ color: tokens.textMuted }}>
              External reference
            </p>
            <button
              type="button"
              className="text-[11px] font-semibold px-3 py-2 rounded-xl"
              style={{ backgroundColor: `${tokens.accent}22`, color: tokens.accent }}
              onClick={handleOpenExternal}
            >
              Open link
            </button>
          </div>
        )}
      </div>

      <div
        className="flex items-center gap-2 px-3 py-2 shrink-0 flex-wrap"
        style={{ borderTop: `1px solid ${border}`, backgroundColor: `${well}ee` }}
      >
        <span className="text-[10px] font-semibold" style={{ color: tokens.textMuted }}>
          Role
        </span>
        {STUDY_FILE_ROLE_OPTIONS.map(opt => (
          <button
            key={opt.id}
            type="button"
            onClick={() => setRole(opt.id)}
            className="text-[10px] px-2 py-0.5 rounded-md"
            style={{
              color: content.role === opt.id ? tokens.accent : tokens.textMuted,
              border: `1px solid ${content.role === opt.id ? tokens.accent : border}`,
              backgroundColor: content.role === opt.id ? `${tokens.accent}18` : 'transparent',
            }}
          >
            {opt.label}
          </button>
        ))}
        {content.role !== 'general' ? (
          <span className="text-[10px] ml-auto" style={{ color: tokens.textGhost }}>
            {studyFileRoleLabel(content.role)}
          </span>
        ) : null}
      </div>
    </div>
  );
}
