import {
  ensureProjectObjectContent,
  type ProjectSpaceObject,
} from '../../hooks/useSectionFreeSpaceObjects';
import { findLinkedNotebook } from '../studyConnections';
import { loadStudySession } from './persistence';

export type StudyPairResolution =
  | { kind: 'ready'; workObjectId: string }
  | { kind: 'pick'; candidates: ProjectSpaceObject[] }
  | { kind: 'create' }
  | { kind: 'missing-source' };

function isMathNotebook(o: ProjectSpaceObject): boolean {
  if (o.type !== 'notebook') return false;
  const c = ensureProjectObjectContent('notebook', o.content);
  return c.type === 'notebook' && c.notebookMode === 'math';
}

function mathNotebooksOnBoard(objects: ProjectSpaceObject[]): ProjectSpaceObject[] {
  return objects.filter(isMathNotebook);
}

export function resolveStudyPair(
  source: ProjectSpaceObject,
  objects: ProjectSpaceObject[],
  sectionId: string,
  boardId: string,
): StudyPairResolution {
  if (source.type !== 'pdf') return { kind: 'missing-source' };

  const saved = loadStudySession(sectionId, boardId, source.id);
  if (saved?.workObjectId && objects.some(o => o.id === saved.workObjectId)) {
    return { kind: 'ready', workObjectId: saved.workObjectId };
  }

  const linked = findLinkedNotebook(source, objects);
  if (linked && isMathNotebook(linked)) {
    return { kind: 'ready', workObjectId: linked.id };
  }

  const candidates = mathNotebooksOnBoard(objects);
  if (candidates.length === 1) {
    return { kind: 'ready', workObjectId: candidates[0]!.id };
  }
  if (candidates.length > 1) {
    return { kind: 'pick', candidates };
  }

  return { kind: 'create' };
}
