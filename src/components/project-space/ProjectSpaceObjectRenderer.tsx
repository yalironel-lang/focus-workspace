import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import {
  ensureProjectObjectContent,
  type ProjectSpaceObject,
  type ProjectObjectContent,
} from '../../hooks/useSectionFreeSpaceObjects';
import { NoteBlock } from '../workspace/blocks/NoteBlock';
import { LinkBlock } from '../workspace/blocks/LinkBlock';
import { ChecklistBlock } from '../workspace/blocks/ChecklistBlock';
import { ImageBlock } from '../workspace/blocks/ImageBlock';
import { ProjectNotebookBlock } from './ProjectNotebookBlock';
import { FreeSpaceCalculator } from './FreeSpaceCalculator';
import { FreeSpaceGraph } from './FreeSpaceGraph';

import { FreeSpaceMistakeCard } from './FreeSpaceMistakeCard';
import { FreeSpacePdfCard } from './FreeSpacePdfCard';
import { WorkspaceSurfaceErrorBoundary } from '../common/WorkspaceSurfaceErrorBoundary';

interface Props {
  object: ProjectSpaceObject;
  tokens: AtmosphereTokens;
  /** Section id for Free Space PDF IndexedDB persistence */
  freeSpaceSectionId?: string;
  onChange: (content: ProjectObjectContent) => void;
  /** Optional: notify host when this notebook enters or exits edit mode (Free Space focus). */
  onNotebookEditingChange?: (id: string, isEditing: boolean) => void;
  /** Mistake cards: sync title to object.title */
  onTitleChange?: (title: string) => void;
}

export function ProjectSpaceObjectRenderer({
  object,
  tokens,
  freeSpaceSectionId,
  onChange,
  onNotebookEditingChange,
  onTitleChange,
}: Props) {
  const content = ensureProjectObjectContent(object.type, object.content);

  switch (content.type) {
    case 'notebook':
      return (
        <WorkspaceSurfaceErrorBoundary key={object.id} tokens={tokens} label="Notebook">
          <ProjectNotebookBlock
            content={content}
            tokens={tokens}
            onChange={onChange}
            context="free-space"
            onEditingChange={
              onNotebookEditingChange
                ? (editing) => onNotebookEditingChange(object.id, editing)
                : undefined
            }
          />
        </WorkspaceSurfaceErrorBoundary>
      );
    case 'note':
      return (
        <WorkspaceSurfaceErrorBoundary key={object.id} tokens={tokens} label="Note">
          <NoteBlock
            content={{ type: 'note', body: content.body }}
            tokens={tokens}
            onChange={c => onChange({ type: 'note', body: c.body })}
          />
        </WorkspaceSurfaceErrorBoundary>
      );
    case 'mistake':
      return (
        <WorkspaceSurfaceErrorBoundary key={object.id} tokens={tokens} label="Mistake card">
          <FreeSpaceMistakeCard
            title={object.title}
            content={content}
            tokens={tokens}
            onChange={c => onChange(c)}
            onTitleChange={onTitleChange}
          />
        </WorkspaceSurfaceErrorBoundary>
      );
    case 'link':
      return (
        <WorkspaceSurfaceErrorBoundary key={object.id} tokens={tokens} label="Link">
          <div>
            <div style={{ fontSize: '10px', color: tokens.textGhost, padding: '10px 14px 0' }}>
              Click to open. Double-click to edit.
            </div>
            <LinkBlock
              content={content}
              tokens={tokens}
              onChange={c => onChange(c)}
            />
          </div>
        </WorkspaceSurfaceErrorBoundary>
      );
    case 'checklist':
      return (
        <WorkspaceSurfaceErrorBoundary key={object.id} tokens={tokens} label="Checklist">
          <ChecklistBlock
            content={content}
            tokens={tokens}
            onChange={c => onChange(c)}
          />
        </WorkspaceSurfaceErrorBoundary>
      );
    case 'image':
      return (
        <WorkspaceSurfaceErrorBoundary key={object.id} tokens={tokens} label="Image">
          <div>
            <div style={{ fontSize: '10px', color: tokens.textGhost, padding: '10px 14px 0' }}>
              Hover image to change source.
            </div>
            <ImageBlock
              content={content}
              tokens={tokens}
              onChange={c => onChange(c)}
            />
          </div>
        </WorkspaceSurfaceErrorBoundary>
      );
    case 'calculator':
      return (
        <WorkspaceSurfaceErrorBoundary key={object.id} tokens={tokens} label="Calculator">
          <FreeSpaceCalculator
            content={content}
            tokens={tokens}
            onChange={c => onChange(c)}
          />
        </WorkspaceSurfaceErrorBoundary>
      );
    case 'graph':
      return (
        <WorkspaceSurfaceErrorBoundary key={object.id} tokens={tokens} label="Graph">
          <FreeSpaceGraph
            content={content}
            tokens={tokens}
            onChange={c => onChange(c)}
          />
        </WorkspaceSurfaceErrorBoundary>
      );
    case 'pdf':
      if (!freeSpaceSectionId) {
        return (
          <div className="p-4 text-xs" style={{ color: tokens.textMuted }}>
            PDF objects need a workspace context.
          </div>
        );
      }
      return (
        <WorkspaceSurfaceErrorBoundary key={object.id} tokens={tokens} label="PDF">
          <FreeSpacePdfCard
            objectId={object.id}
            content={content}
            tokens={tokens}
            sectionId={freeSpaceSectionId}
            onChange={c => onChange(c)}
            onTitleChange={onTitleChange}
          />
        </WorkspaceSurfaceErrorBoundary>
      );
    default:
      return (
        <div
          className="rounded-xl p-4 text-xs"
          style={{
            backgroundColor: `${tokens.cardBg}ee`,
            border: `1px solid ${tokens.cardBorder}`,
            color: tokens.textMuted,
          }}
        >
          This object could not be displayed. Try removing it and adding a new one.
        </div>
      );
  }
}

