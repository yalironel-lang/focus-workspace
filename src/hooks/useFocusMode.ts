import { useCallback, useEffect, useState } from 'react';
import type { FocusMode } from '../focusMode/focusModeTypes';
import { isFocusMode } from '../focusMode/focusModeTypes';

function storageKey(sectionId: string): string {
  return `fw_section_${sectionId}_focus_mode_v1`;
}

export function useFocusMode(sectionId: string): {
  focusMode: FocusMode | null;
  setFocusMode: (next: FocusMode | null) => void;
} {
  const [focusMode, setFocusModeState] = useState<FocusMode | null>(() => {
    if (!sectionId) return null;
    try {
      const raw = localStorage.getItem(storageKey(sectionId));
      if (!raw) return null;
      return isFocusMode(raw) ? raw : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (!sectionId) {
      setFocusModeState(null);
      return;
    }
    try {
      const raw = localStorage.getItem(storageKey(sectionId));
      setFocusModeState(raw && isFocusMode(raw) ? raw : null);
    } catch {
      setFocusModeState(null);
    }
  }, [sectionId]);

  const setFocusMode = useCallback(
    (next: FocusMode | null) => {
      setFocusModeState(next);
      if (!sectionId) return;
      try {
        if (next == null) localStorage.removeItem(storageKey(sectionId));
        else localStorage.setItem(storageKey(sectionId), next);
      } catch {
        /* quota */
      }
    },
    [sectionId],
  );

  return { focusMode, setFocusMode };
}
