import { memo, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { flickerDebugCount } from '../../lib/flickerDebug';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import {
  ensureProjectObjectContent,
  type ProjectSpaceObject,
  type ProjectObjectContent,
} from '../../hooks/useSectionFreeSpaceObjects';
import { NoteBlock } from '../workspace/blocks/NoteBlock';
import { LinkBlock } from '../workspace/blocks/LinkBlock';
import { ChecklistBlock } from '../workspace/blocks/ChecklistBlock';
import { FreeSpaceImageCard } from './FreeSpaceImageCard';
import { ProjectNotebookBlock } from './ProjectNotebookBlock';
import { MathDeskPrototype } from './MathDeskPrototype';
import { FreeSpaceCalculator } from './FreeSpaceCalculator';
import { FreeSpaceGraph } from './FreeSpaceGraph';

import { FreeSpaceMistakeCard } from './FreeSpaceMistakeCard';
import {
  deriveStudyLineage,
  findLinkedNotebook,
  findLinkedSource,
} from '../../lib/studyConnections';
import { mistakeContent, mistakeNeedsReview, mistakeReviewLabel } from '../../lib/mistakeIntelligence';
import { isLearningLoopClosed, learningLoopFields } from '../../lib/learningLoop';
import { FreeSpacePdfCard } from './FreeSpacePdfCard';
import { FreeSpaceCompanionCard } from './FreeSpaceCompanionCard';
import { WorkspaceSurfaceErrorBoundary } from '../common/WorkspaceSurfaceErrorBoundary';
import { useFreeSpaceRenderPolicy } from '../canvas/FreeSpaceRenderPolicyContext';
import { FreeSpaceObjectShell } from './FreeSpaceObjectShell';
import { StudyLayoutDockedPlaceholder } from './StudyLayoutDockedPlaceholder';
import { StudySessionCardChip } from './StudySessionCardChip';
import {
  isStudyLayoutDocked,
  sanitizeStudyLayout,
  type StudyLayoutMode,
} from '../../lib/mathDesk/studyLayout';

export type NotebookContentHost = 'canvas' | 'study-dock' | 'study-session';

interface Props {
  object: ProjectSpaceObject;
  allObjects?: ProjectSpaceObject[];
  tokens: AtmosphereTokens;
  /** Section id for Free Space PDF IndexedDB persistence */
  freeSpaceSectionId?: string;
  /** Active board id for knowledge journal scoping */
  freeSpaceBoardId?: string;
  onChange: (content: ProjectObjectContent) => void;
  /** Optional: notify host when this notebook enters or exits edit mode (Free Space focus). */
  onNotebookEditingChange?: (id: string, isEditing: boolean) => void;
  /** Mistake cards: sync title to object.title */
  onTitleChange?: (title: string) => void;
  /** Optional: focus/select another object from contextual notebook references. */
  onRequestSelectObject?: (id: string) => void;
  /** Optional: create a connected recall item from notebook content. */
  onCreateNotebookRecall?: (sourceObjectId: string, prompt: string) => void;
  /** Start closed-book learning attempt for this object. */
  onStartLearningAttempt?: (objectId: string) => void;
  /** Phase 0 Course Trap — PDF viewer ready hook. */
  onPdfViewerReady?: (payload: { objectId: string; fileName: string; title: string }) => void;
  /** Where notebook body renders: canvas card vs viewport study dock portal. */
  contentHost?: NotebookContentHost;
  /** Apply study layout; host should dedupe single docked notebook. */
  onStudyLayoutChange?: (mode: StudyLayoutMode) => void;
  onStartStudySession?: () => void;
  /** When set, canvas card shows a studying chip instead of live content. */
  studySessionChip?: { subtitle: string; onOpen: () => void } | null;
  sessionRestoreBlockId?: string | null;
  onStudySessionWorkFocus?: (blockId: string | null) => void;
  studyFocusQuestionNumber?: number | null;
  studyFocusQuestionToken?: number;
  onStudySessionActiveQuestionNumber?: (questionNumber: number | null) => void;
  /** Hide Attempt chip (e.g. PDF with Study this exam, or objects inside study session shell). */
  suppressLearningAttemptChip?: boolean;
  studySessionActive?: boolean;
  suppressStudyToolbar?: boolean;
  studyDeskQuiet?: boolean;
}

function copyText(text: string): Promise<void> {
  if (!text) return Promise.resolve();
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text);
  }
  if (typeof document === 'undefined') return Promise.reject(new Error('Clipboard unavailable'));
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', 'true');
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
    return Promise.resolve();
  } finally {
    document.body.removeChild(ta);
  }
}

function getCopyPayload(content: ProjectObjectContent): string | null {
  switch (content.type) {
    case 'note':
      return content.body?.trim() || null;
    case 'mistake': {
      const parts = [
        content.whatWrong?.trim() ? `What went wrong:\n${content.whatWrong.trim()}` : '',
        content.correction?.trim() ? `Correction:\n${content.correction.trim()}` : '',
        content.whyConfused?.trim() ? `Why confusion happened:\n${content.whyConfused.trim()}` : '',
      ].filter(Boolean);
      return parts.join('\n\n') || null;
    }
    case 'checklist': {
      const text = content.items
        .map(item => {
          const checked = Boolean((item as { checked?: boolean; done?: boolean }).checked ?? (item as { done?: boolean }).done);
          const label = (item as { text?: string; title?: string; label?: string }).text
            ?? (item as { title?: string; label?: string }).title
            ?? (item as { label?: string }).label
            ?? '';
          return `${checked ? '[x]' : '[ ]'} ${label.trim()}`.trim();
        })
        .filter(Boolean)
        .join('\n');
      return text || null;
    }
    case 'graph':
      return content.expression?.trim() || null;
    case 'link': {
      const parts = [content.title?.trim() ?? '', content.url?.trim() ?? '', content.description?.trim() ?? ''].filter(Boolean);
      return parts.join('\n') || null;
    }
    case 'companion': {
      const parts = [
        content.title?.trim() ?? '',
        content.description?.trim() ?? '',
      ].filter(Boolean);
      return parts.join('\n\n') || null;
    }
    default:
      return null;
  }
}

type NotebookContent = Extract<ProjectObjectContent, { type: 'notebook' }>;

function FreeSpaceMathNotebookRenderer({
  content,
  tokens,
  object,
  allObjects,
  freeSpaceSectionId,
  freeSpaceBoardId,
  onChange,
  onNotebookEditingChange,
  onRequestSelectObject,
  onCreateNotebookRecall,
  attemptBtn,
  contentHost = 'canvas',
  onStudyLayoutChange,
  studySessionChip = null,
  sessionRestoreBlockId = null,
  onStudySessionWorkFocus,
  studyFocusQuestionNumber = null,
  studyFocusQuestionToken = 0,
  onStudySessionActiveQuestionNumber,
  studyDeskQuiet = false,
}: {
  content: NotebookContent;
  tokens: AtmosphereTokens;
  object: ProjectSpaceObject;
  allObjects?: ProjectSpaceObject[];
  freeSpaceSectionId?: string;
  freeSpaceBoardId?: string;
  onChange: (content: ProjectObjectContent) => void;
  onNotebookEditingChange?: (id: string, editing: boolean) => void;
  onRequestSelectObject?: (id: string) => void;
  onCreateNotebookRecall?: (sourceId: string, prompt: string) => void;
  attemptBtn: ReactNode;
  contentHost?: NotebookContentHost;
  onStudyLayoutChange?: (mode: StudyLayoutMode) => void;
  studySessionChip?: { subtitle: string; onOpen: () => void } | null;
  sessionRestoreBlockId?: string | null;
  onStudySessionWorkFocus?: (blockId: string | null) => void;
  studyFocusQuestionNumber?: number | null;
  studyFocusQuestionToken?: number;
  onStudySessionActiveQuestionNumber?: (questionNumber: number | null) => void;
  studyDeskQuiet?: boolean;
}) {
  const useDeskPrototype = content.notebookMode === 'math';
  const [legacyOpen, setLegacyOpen] = useState(false);
  const studyLayout = sanitizeStudyLayout(content.studyLayout);
  const docked = isStudyLayoutDocked(studyLayout);

  if (contentHost === 'canvas' && studySessionChip) {
    return (
      <StudySessionCardChip
        tokens={tokens}
        title={object.title}
        subtitle={studySessionChip.subtitle}
        onOpen={studySessionChip.onOpen}
      />
    );
  }

  if (contentHost === 'canvas' && docked) {
    return (
      <StudyLayoutDockedPlaceholder
        tokens={tokens}
        title={object.title}
        layout={studyLayout}
        onReturnToCanvas={() => onStudyLayoutChange?.('canvas')}
        onSelect={() => onRequestSelectObject?.(object.id)}
      />
    );
  }

  if (useDeskPrototype && !legacyOpen) {
    return (
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        <MathDeskPrototype
          content={content}
          tokens={tokens}
          object={object}
          allObjects={allObjects}
          freeSpaceSectionId={freeSpaceSectionId}
          freeSpaceBoardId={freeSpaceBoardId}
          onChange={onChange}
          onNotebookEditingChange={onNotebookEditingChange}
          onRequestSelectObject={onRequestSelectObject}
          onCreateNotebookRecall={onCreateNotebookRecall}
          onShowClassic={() => setLegacyOpen(true)}
          studyLayout={studyLayout}
          onStudyLayoutChange={onStudyLayoutChange}
          sessionRestoreBlockId={sessionRestoreBlockId}
          onStudySessionWorkFocus={onStudySessionWorkFocus}
          studySessionActive={contentHost === 'study-session'}
          studyFocusQuestionNumber={studyFocusQuestionNumber}
          studyFocusQuestionToken={studyFocusQuestionToken}
          onStudySessionActiveQuestionNumber={onStudySessionActiveQuestionNumber}
          studyDeskQuiet={studyDeskQuiet}
        />
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {attemptBtn}
      {useDeskPrototype && legacyOpen ? (
        <button
          type="button"
          onClick={() => setLegacyOpen(false)}
          style={{
            alignSelf: 'flex-end',
            margin: '4px 8px 0',
            zIndex: 3,
            fontSize: 10,
            padding: '4px 8px',
            borderRadius: 6,
            border: `1px solid ${tokens.cardBorder}`,
            background: tokens.wellBg,
            color: tokens.textMuted,
            cursor: 'pointer',
          }}
        >
          ← Math desk
        </button>
      ) : null}
      <div style={{ flex: 1, minHeight: 0 }}>
        <ProjectNotebookBlock
          content={content}
          tokens={tokens}
          onChange={onChange}
          context="free-space"
          objectId={object.id}
          objectTitle={object.title}
          objectUpdatedAt={object.updatedAt}
          allObjects={allObjects}
          freeSpaceSectionId={freeSpaceSectionId}
          freeSpaceBoardId={freeSpaceBoardId}
          onRequestSelectObject={onRequestSelectObject}
          onCreateRecallItem={
            onCreateNotebookRecall
              ? (prompt) => onCreateNotebookRecall(object.id, prompt)
              : undefined
          }
          onEditingChange={
            onNotebookEditingChange
              ? (editing) => onNotebookEditingChange(object.id, editing)
              : undefined
          }
        />
      </div>
    </div>
  );
}

function ProjectSpaceObjectRendererInner({
  object,
  allObjects,
  tokens,
  freeSpaceSectionId,
  freeSpaceBoardId,
  onChange,
  onNotebookEditingChange,
  onTitleChange,
  onRequestSelectObject,
  onCreateNotebookRecall,
  onStartLearningAttempt,
  onPdfViewerReady,
  contentHost = 'canvas',
  onStudyLayoutChange,
  onStartStudySession,
  studySessionChip = null,
  sessionRestoreBlockId = null,
  onStudySessionWorkFocus,
  studyFocusQuestionNumber = null,
  studyFocusQuestionToken = 0,
  onStudySessionActiveQuestionNumber,
  suppressLearningAttemptChip = false,
  suppressStudyToolbar = false,
  studyDeskQuiet = false,
}: Props) {
  useEffect(() => {
    flickerDebugCount(`ProjectSpaceObjectRenderer:${object.id}`);
  }, [object.id]);

  const renderPolicy = useFreeSpaceRenderPolicy(object.id);
  const content = ensureProjectObjectContent(object.type, object.content);
  const [copied, setCopied] = useState(false);
  const [copyHovered, setCopyHovered] = useState(false);
  const [touchSeen, setTouchSeen] = useState(false);
  const copyPayload = useMemo(() => getCopyPayload(content), [content]);

  const handleCopy = useCallback(async () => {
    if (!copyPayload) return;
    try {
      await copyText(copyPayload);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1000);
    } catch {}
  }, [copyPayload]);

  const attemptBtn =
    !suppressLearningAttemptChip &&
    onStartLearningAttempt &&
    (object.type === 'mistake' || object.type === 'note' || object.type === 'notebook' || object.type === 'pdf' || object.type === 'studyfile') ? (
      <button
        type="button"
        onClick={e => {
          e.stopPropagation();
          onStartLearningAttempt(object.id);
        }}
        className="absolute top-2 right-2 z-[2] px-2 py-1 rounded-lg text-[10px] font-semibold"
        style={{
          backgroundColor: `${tokens.accent}22`,
          color: tokens.accent,
          border: `1px solid ${tokens.accent}44`,
        }}
      >
        Attempt
      </button>
    ) : null;

  const wrapWithCopy = useCallback((node: ReactNode) => {
    if (!copyPayload) return node;
    const iconVisible = copied || copyHovered || touchSeen;
    return (
      <div
        style={{ position: 'relative', width: '100%', height: '100%' }}
        onPointerEnter={() => setCopyHovered(true)}
        onPointerLeave={() => setCopyHovered(false)}
        onPointerDown={e => {
          if (e.pointerType === 'touch') setTouchSeen(true);
        }}
      >
        <button
          type="button"
          onClick={e => {
            e.stopPropagation();
            void handleCopy();
          }}
          aria-label="Copy object text"
          style={{
            position: 'absolute',
            top: 10,
            right: 10,
            zIndex: 4,
            borderRadius: 10,
            border: `1px solid ${tokens.cardBorder}`,
            background: `${tokens.cardBg}dd`,
            color: copied ? tokens.accent : tokens.textMuted,
            fontSize: 11,
            fontWeight: 600,
            lineHeight: 1,
            padding: copied ? '6px 8px' : '6px',
            opacity: iconVisible ? 1 : 0,
            transform: iconVisible ? 'translateY(0)' : 'translateY(-2px)',
            transition: 'opacity 150ms ease, transform 150ms ease, color 150ms ease',
            pointerEvents: iconVisible ? 'auto' : 'none',
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
        {node}
      </div>
    );
  }, [copied, copyHovered, copyPayload, handleCopy, tokens.accent, tokens.cardBg, tokens.cardBorder, tokens.textMuted, touchSeen]);

  if (renderPolicy.chromeOnly) {
    return (
      <FreeSpaceObjectShell
        type={object.type}
        title={object.title}
        tokens={tokens}
        variant="chrome"
      />
    );
  }

  if (renderPolicy.suspendHeavyContent && object.type === 'notebook' && content.type === 'notebook') {
    const preview = (content.body ?? '')
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean)
      .slice(0, 5)
      .join(' · ');
    return (
      <FreeSpaceObjectShell
        type="notebook"
        title={object.title}
        tokens={tokens}
        variant="preview"
        subtitle={preview || 'Notebook'}
      />
    );
  }

  switch (content.type) {
    case 'notebook':
      return (
        <WorkspaceSurfaceErrorBoundary tokens={tokens} label="Notebook">
          <FreeSpaceMathNotebookRenderer
            content={content}
            tokens={tokens}
            object={object}
            allObjects={allObjects}
            freeSpaceSectionId={freeSpaceSectionId}
            freeSpaceBoardId={freeSpaceBoardId}
            onChange={onChange}
            onNotebookEditingChange={onNotebookEditingChange}
            onRequestSelectObject={onRequestSelectObject}
            onCreateNotebookRecall={onCreateNotebookRecall}
            attemptBtn={attemptBtn}
            contentHost={contentHost}
            onStudyLayoutChange={onStudyLayoutChange}
            studySessionChip={studySessionChip}
            sessionRestoreBlockId={sessionRestoreBlockId}
            onStudySessionWorkFocus={onStudySessionWorkFocus}
            studyFocusQuestionNumber={studyFocusQuestionNumber}
            studyFocusQuestionToken={studyFocusQuestionToken}
            onStudySessionActiveQuestionNumber={onStudySessionActiveQuestionNumber}
            studyDeskQuiet={studyDeskQuiet}
          />
        </WorkspaceSurfaceErrorBoundary>
      );
    case 'note':
      return (
        <WorkspaceSurfaceErrorBoundary tokens={tokens} label="Note">
          <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            {attemptBtn}
            {wrapWithCopy(
              <NoteBlock
                content={{ type: 'note', body: content.body }}
                tokens={tokens}
                onChange={c => onChange({ type: 'note', body: c.body })}
              />,
            )}
          </div>
        </WorkspaceSurfaceErrorBoundary>
      );
    case 'mistake': {
      const objects = allObjects ?? [object];
      const lineage = deriveStudyLineage(object.id, objects);
      const mc = mistakeContent(object);
      const needsReview = mc ? mistakeNeedsReview(mc) : false;
      const reviewLabel = mc ? mistakeReviewLabel(mc) : undefined;
      const loop = content.type === 'mistake' ? learningLoopFields(content) : null;
      return (
        <WorkspaceSurfaceErrorBoundary tokens={tokens} label="Mistake card">
          {wrapWithCopy(
            <FreeSpaceMistakeCard
              title={object.title}
              content={content}
              tokens={tokens}
              linkedSourceTitle={lineage.sourceTitle}
              linkedNotebookTitle={
                lineage.notebookId && lineage.notebookId !== object.id ? lineage.notebookTitle : null
              }
              needsReview={needsReview}
              reviewLabel={reviewLabel}
              loopOpen={loop ? !isLearningLoopClosed(content) : true}
              pendingReAttempt={loop?.pendingReAttempt ?? false}
              onChange={c => onChange(c)}
              onTitleChange={onTitleChange}
              onStartAttempt={
                onStartLearningAttempt ? () => onStartLearningAttempt(object.id) : undefined
              }
            />,
          )}
        </WorkspaceSurfaceErrorBoundary>
      );
    }
    case 'link':
      return (
        <WorkspaceSurfaceErrorBoundary tokens={tokens} label="Link">
          {wrapWithCopy(
            <div>
              <div style={{ fontSize: '10px', color: tokens.textMuted, padding: '10px 14px 0' }}>
                Click to open. Double-click to edit.
              </div>
              <LinkBlock
                content={content}
                tokens={tokens}
                onChange={c => onChange(c)}
              />
            </div>,
          )}
        </WorkspaceSurfaceErrorBoundary>
      );
    case 'checklist':
      return (
        <WorkspaceSurfaceErrorBoundary tokens={tokens} label="Checklist">
          {wrapWithCopy(
            <ChecklistBlock
              content={content}
              tokens={tokens}
              onChange={c => onChange(c)}
            />,
          )}
        </WorkspaceSurfaceErrorBoundary>
      );
    case 'image':
      return (
        <WorkspaceSurfaceErrorBoundary tokens={tokens} label="Image">
          <FreeSpaceImageCard
            objectId={object.id}
            content={content}
            tokens={tokens}
            sectionId={freeSpaceSectionId ?? ''}
            onChange={c => onChange(c)}
          />
        </WorkspaceSurfaceErrorBoundary>
      );
    case 'calculator':
      return (
        <WorkspaceSurfaceErrorBoundary tokens={tokens} label="Calculator">
          <FreeSpaceCalculator
            content={content}
            tokens={tokens}
            onChange={c => onChange(c)}
          />
        </WorkspaceSurfaceErrorBoundary>
      );
    case 'graph':
      return (
        <WorkspaceSurfaceErrorBoundary tokens={tokens} label="Graph">
          {wrapWithCopy(
            <FreeSpaceGraph
              content={content}
              tokens={tokens}
              onChange={c => onChange(c)}
            />,
          )}
        </WorkspaceSurfaceErrorBoundary>
      );
    case 'pdf': {
      const objects = allObjects ?? [object];
      const notebook = findLinkedNotebook(object, objects);
      const mistakeCount = objects.filter(o => {
        if (o.type !== 'mistake') return false;
        const src = findLinkedSource(o, objects);
        return src?.id === object.id;
      }).length;
      if (!freeSpaceSectionId) {
        return (
          <div className="p-4 text-xs" style={{ color: tokens.textMuted }}>
            PDF objects need a workspace context.
          </div>
        );
      }
      if (contentHost === 'canvas' && studySessionChip) {
        return (
          <StudySessionCardChip
            tokens={tokens}
            title={object.title || content.fileName}
            subtitle={studySessionChip.subtitle}
            onOpen={studySessionChip.onOpen}
          />
        );
      }
      return (
        <WorkspaceSurfaceErrorBoundary tokens={tokens} label="PDF">
          <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            {attemptBtn}
            <FreeSpacePdfCard
              objectId={object.id}
              content={content}
              tokens={tokens}
              sectionId={freeSpaceSectionId}
              onChange={c => onChange(c)}
              onTitleChange={onTitleChange}
            suspendViewer={renderPolicy.suspendHeavyContent}
            linkedNotebookTitle={notebook?.title ?? null}
            relatedMistakeCount={mistakeCount}
            pdfTitle={object.title}
            onPdfViewerReady={onPdfViewerReady}
            onStartStudySession={onStartStudySession}
            presentation={contentHost === 'study-session' ? 'study-session' : 'canvas'}
            suppressStudyToolbar={suppressStudyToolbar}
          />
          </div>
        </WorkspaceSurfaceErrorBoundary>
      );
    }
    case 'companion':
      return (
        <WorkspaceSurfaceErrorBoundary tokens={tokens} label="Companion">
          {wrapWithCopy(
            <FreeSpaceCompanionCard
              content={content}
              tokens={tokens}
              onChange={c => onChange(c)}
              onTitleChange={onTitleChange}
              suspendEmbed={renderPolicy.suspendHeavyContent}
            />,
          )}
        </WorkspaceSurfaceErrorBoundary>
      );
    default:
      return (
        <div
          className="rounded-xl p-4 text-xs"
          style={{
            backgroundColor: `${tokens.cardBg}f8`,
            border: `1px solid ${tokens.cardBorder}`,
            color: tokens.textMuted,
          }}
        >
          This object could not be displayed. Try removing it and adding a new one.
        </div>
      );
  }
}

export const ProjectSpaceObjectRenderer = memo(ProjectSpaceObjectRendererInner);
