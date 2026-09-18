/**
 * Notebook Designer appearance draft + debounced persist session.
 * Preview is immediate; persistence settles after debounce / flush on close.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  appearanceFromNotebookDesignPreset,
  type NotebookAppearanceV1,
  type NotebookDesignPresetId,
} from '../lib/notebookAppearance';
import { notebookAppearancesStructurallyEqual } from '../lib/notebookAppearanceVisualTokens';
import { NOTEBOOK_DESIGNER_PERSIST_DEBOUNCE_MS } from '../lib/notebookDesignerLayout';

export function useNotebookDesignerAppearanceSession(input: {
  persistedAppearance: NotebookAppearanceV1 | undefined;
  persistAppearance: (appearance: NotebookAppearanceV1) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<NotebookAppearanceV1 | undefined>(undefined);
  const dirtyRef = useRef(false);
  const draftRef = useRef<NotebookAppearanceV1 | undefined>(undefined);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistRef = useRef(input.persistAppearance);
  persistRef.current = input.persistAppearance;
  const persistCountRef = useRef(0);

  draftRef.current = draft;

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const flushPersist = useCallback(() => {
    clearTimer();
    if (!dirtyRef.current) return;
    const next = draftRef.current;
    if (!next) {
      dirtyRef.current = false;
      return;
    }
    persistRef.current(next);
    persistCountRef.current += 1;
    dirtyRef.current = false;
  }, [clearTimer]);

  const schedulePersist = useCallback(
    (next: NotebookAppearanceV1) => {
      dirtyRef.current = true;
      clearTimer();
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        persistRef.current(next);
        persistCountRef.current += 1;
        dirtyRef.current = false;
      }, NOTEBOOK_DESIGNER_PERSIST_DEBOUNCE_MS);
    },
    [clearTimer],
  );

  const openDesigner = useCallback(() => {
    const seed = input.persistedAppearance
      ? (JSON.parse(JSON.stringify(input.persistedAppearance)) as NotebookAppearanceV1)
      : undefined;
    setDraft(seed);
    draftRef.current = seed;
    dirtyRef.current = false;
    clearTimer();
    setOpen(true);
  }, [clearTimer, input.persistedAppearance]);

  const closeDesigner = useCallback(() => {
    flushPersist();
    setOpen(false);
    setDraft(undefined);
    draftRef.current = undefined;
  }, [flushPersist]);

  const selectPreset = useCallback(
    (id: NotebookDesignPresetId) => {
      const next = appearanceFromNotebookDesignPreset(id);
      setDraft(next);
      draftRef.current = next;
      schedulePersist(next);
    },
    [schedulePersist],
  );

  useEffect(() => () => clearTimer(), [clearTimer]);

  const liveAppearance = open ? draft : input.persistedAppearance;

  const isDirtyRelativeToPersisted = open
    ? !notebookAppearancesStructurallyEqual(draft, input.persistedAppearance)
    : false;

  return {
    open,
    openDesigner,
    closeDesigner,
    selectPreset,
    liveAppearance,
    draft,
    isDirtyRelativeToPersisted,
    /** Test aid — number of persist callbacks fired this session lifetime. */
    getPersistCount: () => persistCountRef.current,
    flushPersist,
  };
}
