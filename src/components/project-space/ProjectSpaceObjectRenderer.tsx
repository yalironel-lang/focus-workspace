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

interface Props {
  object: ProjectSpaceObject;
  tokens: AtmosphereTokens;
  onChange: (content: ProjectObjectContent) => void;
  /** Optional: notify host when this notebook enters or exits edit mode (Free Space focus). */
  onNotebookEditingChange?: (id: string, isEditing: boolean) => void;
}

export function ProjectSpaceObjectRenderer({
  object,
  tokens,
  onChange,
  onNotebookEditingChange,
}: Props) {
  const content = ensureProjectObjectContent(object.type, object.content);

  switch (content.type) {
    case 'notebook':
      return (
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
      );
    case 'note':
      return (
        <NoteBlock
          content={{ type: 'note', body: content.body }}
          tokens={tokens}
          onChange={c => onChange({ type: 'note', body: c.body })}
        />
      );
    case 'link':
      return (
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
      );
    case 'checklist':
      return (
        <ChecklistBlock
          content={content}
          tokens={tokens}
          onChange={c => onChange(c)}
        />
      );
    case 'image':
      return (
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
      );
    case 'calculator':
      return (
        <FreeSpaceCalculator
          content={content}
          tokens={tokens}
          onChange={c => onChange(c)}
        />
      );
    case 'graph':
      return (
        <FreeSpaceGraph
          content={content}
          tokens={tokens}
          onChange={c => onChange(c)}
        />
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

