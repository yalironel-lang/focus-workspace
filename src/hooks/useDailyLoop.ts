/**
 * useDailyLoop — streak tracking + daily session state.
 *
 * Tracks:
 *   - consecutive-day streak (opens on different calendar days)
 *   - total session count (all-time app opens)
 *   - whether the daily banner has been dismissed today
 *
 * All state lives in localStorage.  Replace with Supabase to make it
 * multi-device.  The interface stays identical either way.
 */

import { useState, useEffect, useCallback } from 'react';

// ── Storage keys ──────────────────────────────────────────────────────────────

const STREAK_KEY   = 'fw_streak_v1';
const SESSION_KEY  = 'fw_session_count_v1';
const BANNER_KEY   = 'fw_banner_dismissed_date_v1';

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

function yesterdayStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

interface StreakData {
  date:      string | null;
  streak:    number;
  totalDays: number;
}

function loadStreak(): StreakData {
  try {
    const raw = localStorage.getItem(STREAK_KEY);
    return raw ? JSON.parse(raw) : { date: null, streak: 0, totalDays: 0 };
  } catch { return { date: null, streak: 0, totalDays: 0 }; }
}

function loadSessionCount(): number {
  try {
    return parseInt(localStorage.getItem(SESSION_KEY) ?? '0', 10) || 0;
  } catch { return 0; }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DailyLoopState {
  streak:            number;   // consecutive days used
  totalDays:         number;   // all-time days used
  sessionCount:      number;   // all-time opens (used by contextual hints)
  isFirstOpenToday:  boolean;  // first time opening the app today
  isBannerDismissed: boolean;  // user dismissed the daily banner today
  dismissBanner:     () => void;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useDailyLoop(): DailyLoopState {
  const [streak,    setStreak]    = useState(() => loadStreak());
  const [sessionCount, setCount]  = useState(() => loadSessionCount());
  const [bannerDate, setBannerDate] = useState(() =>
    localStorage.getItem(BANNER_KEY) ?? ''
  );

  // ── Update streak + session count on mount ─────────────────────────────────
  useEffect(() => {
    const today = todayStr();

    // ── Streak ──────────────────────────────────────────────────────────────
    setStreak(prev => {
      if (prev.date === today) return prev;  // already counted

      const newStreak = prev.date === yesterdayStr() ? prev.streak + 1 : 1;
      const next: StreakData = {
        date:      today,
        streak:    newStreak,
        totalDays: prev.totalDays + 1,
      };
      localStorage.setItem(STREAK_KEY, JSON.stringify(next));
      return next;
    });

    // ── Session count ────────────────────────────────────────────────────────
    setCount(prev => {
      const next = prev + 1;
      localStorage.setItem(SESSION_KEY, String(next));
      return next;
    });
  }, []);  // runs once per mount (= once per app open)

  // ── Banner dismiss ─────────────────────────────────────────────────────────
  const dismissBanner = useCallback(() => {
    const today = todayStr();
    localStorage.setItem(BANNER_KEY, today);
    setBannerDate(today);
  }, []);

  const today = todayStr();
  const isFirstOpenToday  = streak.date === today && streak.totalDays >= 1;
  const isBannerDismissed = bannerDate === today;

  return {
    streak:    streak.streak,
    totalDays: streak.totalDays,
    sessionCount,
    isFirstOpenToday,
    isBannerDismissed,
    dismissBanner,
  };
}
