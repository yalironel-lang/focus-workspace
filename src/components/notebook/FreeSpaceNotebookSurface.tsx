import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import type { ProjectObjectContent, ProjectSpaceObject } from '../../hooks/useSectionFreeSpaceObjects';
import { ProjectNotebookBlock } from '../project-space/ProjectNotebookBlock';

type NotebookContent = Extract<ProjectObjectContent, { type: 'notebook' }>;

interface Props {
  content: NotebookContent;
  tokens: AtmosphereTokens;
  object: ProjectSpaceObject;
  allObjects?: ProjectSpaceObject[];
  freeSpaceSectionId?: string;
  freeSpaceBoardId?: string;
  onChange: (content: ProjectObjectContent) => void;
  onNotebookEditingChange?: (objectId: string, isEditing: boolean) => void;
  onRequestSelectObject?: (id: string) => void;
  onCreateNotebookRecall?: (sourceId: string, prompt: string) => void;
  onExpand?: () => void;
  compositionChromeSuppressed?: boolean;
  onOpenBinderStudy?: (payload: {
    pdfObjectId: string;
    inkObjectId: string;
    inkBlockKey: string;
    surfaceTitle: string;
  }) => void;
}

/** Live inline Free Space notebook — thin wrapper over the shared editor core. */
export function FreeSpaceNotebookSurface({
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
  onExpand,
  compositionChromeSuppressed,
  onOpenBinderStudy,
}: Props) {
  return (
    <div
      data-fs-notebook-surface="1"
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        minHeight: 0,
        boxSizing: 'border-box',
      }}
    >
      <ProjectNotebookBlock
        content={content}
        tokens={tokens}
        onChange={onChange}
        context="free-space"
        presentation="embedded"
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
        onExpand={onExpand}
        compositionChromeSuppressed={compositionChromeSuppressed}
        onOpenBinderStudy={onOpenBinderStudy}
      />
    </div>
  );
}
