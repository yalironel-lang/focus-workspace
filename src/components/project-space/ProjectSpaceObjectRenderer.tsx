import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import type { ProjectSpaceObject, ProjectObjectContent } from '../../hooks/useSectionFreeSpaceObjects';
import { NoteBlock } from '../workspace/blocks/NoteBlock';
import { LinkBlock } from '../workspace/blocks/LinkBlock';
import { ChecklistBlock } from '../workspace/blocks/ChecklistBlock';
import { ImageBlock } from '../workspace/blocks/ImageBlock';
import { ProjectNotebookBlock } from './ProjectNotebookBlock';

interface Props {
  object: ProjectSpaceObject;
  tokens: AtmosphereTokens;
  onChange: (content: ProjectObjectContent) => void;
}

export function ProjectSpaceObjectRenderer({ object, tokens, onChange }: Props) {
  switch (object.content.type) {
    case 'notebook':
      return <ProjectNotebookBlock content={object.content} tokens={tokens} onChange={onChange} />;
    case 'note':
      return (
        <NoteBlock
          content={{ type: 'note', body: object.content.body }}
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
            content={object.content}
            tokens={tokens}
            onChange={c => onChange(c)}
          />
        </div>
      );
    case 'checklist':
      return (
        <ChecklistBlock
          content={object.content}
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
            content={object.content}
            tokens={tokens}
            onChange={c => onChange(c)}
          />
        </div>
      );
    default:
      return null;
  }
}

