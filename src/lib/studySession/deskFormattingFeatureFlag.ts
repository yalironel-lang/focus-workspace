import { useState } from 'react';

const LS_KEY = 'deskFormattingV1';

/** Desk Formatting V1 — Study Session / Math Desk compact toolbar (default off). */
export function readDeskFormattingV1(): boolean {
  const raw = import.meta.env.VITE_DESK_FORMATTING_V1;
  if (raw === 'true' || raw === '1') return true;
  if (raw === 'false' || raw === '0') return false;
  try {
    if (typeof localStorage !== 'undefined') {
      const ls = localStorage.getItem(LS_KEY);
      if (ls === '1') return true;
      if (ls === '0') return false;
    }
  } catch {
    /* private mode */
  }
  return false;
}

export function useDeskFormattingV1(): boolean {
  return useState(() => readDeskFormattingV1())[0];
}
