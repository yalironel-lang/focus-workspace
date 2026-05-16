import { useEffect, useMemo, useRef, useState } from 'react';
import type { PositionMap } from './useBlockPositions';
import type { FocusMode } from '../focusMode/focusModeTypes';
import type { ProjectSpaceObject } from './useSectionFreeSpaceObjects';
import {
  buildWorkspaceContinuityMemory,
  buildWorkspaceContinuitySuggestions,
  buildWorkspaceResumeCopy,
  isRecentWorkspaceContinuity,
  loadWorkspaceContinuityMemory,
  saveWorkspaceContinuityMemory,
  type WorkspaceContinuityMemory,
} from '../lib/workspaceContinuity';

interface Args {
  sectionId: string;
  objects: ProjectSpaceObject[];
  positions: PositionMap;
  selectedId: string | null;
  editingId: string | null;
  focusMode: FocusMode | null;
  zoom: number;
  panX: number;
  panY: number;
}

export function useWorkspaceContinuity({
  sectionId,
  objects,
  positions,
  selectedId,
  editingId,
  focusMode,
  zoom,
  panX,
  panY,
}: Args): {
  continuity: WorkspaceContinuityMemory | null;
  continuityRecent: boolean;
  resumeCopy: ReturnType<typeof buildWorkspaceResumeCopy>;
  suggestions: ReturnType<typeof buildWorkspaceContinuitySuggestions>;
  continuityObjectIds: string[];
  continuityClusterIds: string[];
  continuityEdgeKeys: string[];
  restoreSelectionId: string | null;
  restoreViewport: WorkspaceContinuityMemory['viewport'] | null;
} {
  const [continuity, setContinuity] = useState<WorkspaceContinuityMemory | null>(() =>
    loadWorkspaceContinuityMemory(sectionId),
  );
  const lastSelectedRef = useRef<string | null>(continuity?.lastSelectedObjectId ?? null);
  const recentNotebookRef = useRef<string | null>(continuity?.recentNotebookId ?? null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const loaded = loadWorkspaceContinuityMemory(sectionId);
    setContinuity(loaded);
    lastSelectedRef.current = loaded?.lastSelectedObjectId ?? null;
    recentNotebookRef.current = loaded?.recentNotebookId ?? null;
  }, [sectionId]);

  useEffect(() => {
    if (!selectedId) return;
    if (!objects.some(object => object.id === selectedId)) return;
    lastSelectedRef.current = selectedId;
  }, [selectedId, objects]);

  useEffect(() => {
    if (!editingId) return;
    const object = objects.find(entry => entry.id === editingId);
    if (!object || object.type !== 'notebook') return;
    recentNotebookRef.current = editingId;
    lastSelectedRef.current = editingId;
  }, [editingId, objects]);

  useEffect(() => {
    if (!sectionId || !objects.length) return;
    const next = buildWorkspaceContinuityMemory({
      sectionId,
      objects,
      positions,
      selectedId,
      lastSelectedId: lastSelectedRef.current,
      recentNotebookId: recentNotebookRef.current,
      focusMode,
      zoom,
      panX,
      panY,
    });
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveWorkspaceContinuityMemory(sectionId, next);
    }, 450);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [sectionId, objects, positions, selectedId, focusMode, zoom, panX, panY]);

  const validIds = useMemo(() => new Set(objects.map(object => object.id)), [objects]);
  const continuityRecent = isRecentWorkspaceContinuity(continuity);

  const continuityObjectIds = useMemo(
    () => (continuityRecent ? continuity?.recentObjectIds.filter(id => validIds.has(id)) ?? [] : []),
    [continuity, continuityRecent, validIds],
  );
  const continuityClusterIds = useMemo(
    () => (continuityRecent ? continuity?.activeClusterObjectIds.filter(id => validIds.has(id)) ?? [] : []),
    [continuity, continuityRecent, validIds],
  );
  const continuityEdgeKeys = useMemo(
    () => (continuityRecent ? continuity?.recentConnectionKeys ?? [] : []),
    [continuity, continuityRecent],
  );
  const restoreSelectionId =
    continuityRecent && continuity?.lastSelectedObjectId && validIds.has(continuity.lastSelectedObjectId)
      ? continuity.lastSelectedObjectId
      : null;
  const restoreViewport = continuityRecent ? continuity?.viewport ?? null : null;

  const resumeCopy = useMemo(
    () => buildWorkspaceResumeCopy(continuity, objects),
    [continuity, objects],
  );
  const suggestions = useMemo(
    () => buildWorkspaceContinuitySuggestions(continuity, objects),
    [continuity, objects],
  );

  return useMemo(() => ({
    continuity,
    continuityRecent,
    resumeCopy,
    suggestions,
    continuityObjectIds,
    continuityClusterIds,
    continuityEdgeKeys,
    restoreSelectionId,
    restoreViewport,
  }), [
    continuity,
    continuityRecent,
    resumeCopy,
    suggestions,
    continuityObjectIds,
    continuityClusterIds,
    continuityEdgeKeys,
    restoreSelectionId,
    restoreViewport,
  ]);
}
