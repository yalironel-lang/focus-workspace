/**
 * useSessionContinuity — cross-session "pick up where you left off" memory.
 *
 * Problem: sessionPlan.ts stores the active session in sessionStorage, which
 * is erased when the browser tab closes. So every new app open starts cold.
 *
 * This hook bridges that gap by mirroring the active session into localStorage
 * whenever the app opens (or whenever a session is explicitly recorded).
 *
 * Usage pattern:
 *   1. Call useSessionContinuity() in Dashboard.
 *   2. On mount: if sessionStorage has a live session, recordSession(it).
 *      This refreshes the localStorage checkpoint automatically.
 *   3. DailyEntryBanner receives lastSession and shows
 *      "Continue [title]?" if savedAt < RECENT_HOURS ago.
 *   4. When the user dismisses the suggestion, call clearLastSession().
 *
 * Design:
 *   - Zero dependencies beyond localStorage.
 *   - Never modifies sessionStorage — pure observer / parallel write.
 *   - `isRecent` = saved within RECENT_HOURS (48h).
 */

import { useState, useCallback } from 'react';

// ── Constants ─────────────────────────────────────────────────────────────────

const STORAGE_KEY   = 'fw_last_session_v1';
const RECENT_HOURS  = 48;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ContinuityRecord {
  sectionId:    string;
  sectionTitle: string;
  startedAt:    string; // ISO – when the session began
  savedAt:      string; // ISO – when this record was written/refreshed
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function load(): ContinuityRecord | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ContinuityRecord) : null;
  } catch {
    return null;
  }
}

function persist(record: ContinuityRecord): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch { /* quota edge case — ignore */ }
}

function isRecentRecord(record: ContinuityRecord): boolean {
  const diffMs = Date.now() - new Date(record.savedAt).getTime();
  return diffMs < RECENT_HOURS * 60 * 60 * 1000;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export interface SessionContinuityState {
  /** Last known session, if any */
  lastSession: ContinuityRecord | null;
  /** True when lastSession exists and was saved within RECENT_HOURS */
  isRecent: boolean;
  /**
   * Persist (or refresh) a session record.
   * Call this on mount if an active sessionStorage session exists,
   * and whenever the user starts/continues a session.
   */
  recordSession: (session: { sectionId: string; sectionTitle: string; startedAt: string }) => void;
  /** Remove the stored record (user dismissed "continue?" suggestion) */
  clearLastSession: () => void;
  /** Re-read continuity from localStorage (after startup repairs). */
  reloadFromStorage: () => void;
}

export function useSessionContinuity(): SessionContinuityState {
  const [lastSession, setLastSession] = useState<ContinuityRecord | null>(load);

  const recordSession = useCallback(
    (session: { sectionId: string; sectionTitle: string; startedAt: string }) => {
      const record: ContinuityRecord = {
        ...session,
        savedAt: new Date().toISOString(),
      };
      persist(record);
      setLastSession(record);
    },
    [],
  );

  const clearLastSession = useCallback(() => {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    setLastSession(null);
  }, []);

  const reloadFromStorage = useCallback(() => {
    setLastSession(load());
  }, []);

  const isRecent = !!(lastSession && isRecentRecord(lastSession));

  return { lastSession, isRecent, recordSession, clearLastSession, reloadFromStorage };
}
