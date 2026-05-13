import { useState, useCallback, useEffect } from 'react';

// ── Token shape ───────────────────────────────────────────────────────────────

export interface AtmosphereTokens {
  id: string;
  name: string;
  emoji: string;
  description: string;

  // Surfaces
  pageBg: string;
  navBg: string;
  cardBg: string;
  cardBorder: string;
  cardBorderHover: string;
  wellBg: string;       // inset / input areas

  // Text — properly graduated for readability
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textGhost: string;    // subtle but VISIBLE — min 3:1 contrast on card

  // Accent
  accent: string;
  accentHover: string;
  accentSubtle: string;
  accentGlow: string;

  // Dividers
  divider: string;
  focusBorder: string;

  // Ambient
  ambientGlow1: string;
  ambientGlow2: string;

  // Motion & depth
  shadowSm: string;
  shadowMd: string;
  shadowLg: string;
  blur: number;
  glowIntensity: number;

  // Layout
  radius: number;
  density: 'compact' | 'comfortable' | 'spacious';
}

// ── Atmospheres ───────────────────────────────────────────────────────────────
// Design principle: warm charcoal backgrounds, not cold blue-blacks.
// Each atmosphere is a distinct "mood environment" — not just a color change.

export const ATMOSPHERES: AtmosphereTokens[] = [

  // ─── Neural ── warm amber signals on deep warm navy ─────────────────────────
  {
    id: 'neural',
    name: 'Neural',
    emoji: '⚡',
    description: 'Deep warmth. Amber clarity. Pure signal.',
    pageBg:           '#110d09',
    navBg:            'rgba(17,13,9,0.9)',
    cardBg:           '#1a1611',
    cardBorder:       'rgba(255,200,120,0.12)',
    cardBorderHover:  'rgba(255,200,120,0.24)',
    wellBg:           '#120f0a',
    textPrimary:      '#f5ede0',
    textSecondary:    '#c0a889',
    textMuted:        '#b89062',   // brighter small chrome
    textGhost:        '#94724b',   // remains quiet but readable
    accent:           '#f59e0b',
    accentHover:      '#fbbf24',
    accentSubtle:     'rgba(245,158,11,0.12)',
    accentGlow:       'rgba(245,158,11,0.34)',
    divider:          'rgba(255,200,120,0.08)',
    focusBorder:      '#f59e0b',
    ambientGlow1:     'rgba(245,158,11,0.07)',
    ambientGlow2:     'rgba(180,100,20,0.05)',
    shadowSm:         '0 1px 3px rgba(0,0,0,0.48)',
    shadowMd:         '0 6px 20px rgba(0,0,0,0.48), inset 0 1px 0 rgba(255,200,120,0.06)',
    shadowLg:         '0 14px 40px rgba(0,0,0,0.56), inset 0 1px 0 rgba(255,200,120,0.08)',
    blur:             20,
    glowIntensity:    0.75,
    radius:           16,
    density:          'comfortable',
  },

  // ─── Midnight ── near-black. OLED-optimised. Nothing but the work. ──────────
  {
    id: 'deep-focus',
    name: 'Midnight',
    emoji: '🌑',
    description: 'OLED black. Every pixel deliberate.',
    pageBg:           '#0d0b10',
    navBg:            'rgba(13,11,16,0.94)',
    cardBg:           '#17141b',
    cardBorder:       'rgba(255,255,255,0.08)',
    cardBorderHover:  'rgba(255,255,255,0.17)',
    wellBg:           '#100d13',
    textPrimary:      '#e8e2f0',
    textSecondary:    '#b0a8c0',
    textMuted:        '#958daa',
    textGhost:        '#786f92',
    accent:           '#818cf8',
    accentHover:      '#a5b4fc',
    accentSubtle:     'rgba(129,140,248,0.1)',
    accentGlow:       'rgba(129,140,248,0.26)',
    divider:          'rgba(255,255,255,0.06)',
    focusBorder:      '#818cf8',
    ambientGlow1:     'rgba(129,140,248,0.05)',
    ambientGlow2:     'rgba(139,92,246,0.04)',
    shadowSm:         '0 1px 3px rgba(0,0,0,0.6)',
    shadowMd:         '0 6px 22px rgba(0,0,0,0.62), inset 0 1px 0 rgba(255,255,255,0.04)',
    shadowLg:         '0 14px 42px rgba(0,0,0,0.72), inset 0 1px 0 rgba(255,255,255,0.05)',
    blur:             10,
    glowIntensity:    0.35,
    radius:           12,
    density:          'compact',
  },

  // ─── Dusk ── warm charcoal with sky-blue coolness ───────────────────────────
  {
    id: 'calm-night',
    name: 'Dusk',
    emoji: '🌙',
    description: 'Warm charcoal. Soft light. Unhurried.',
    pageBg:           '#13161a',
    navBg:            'rgba(19,22,26,0.9)',
    cardBg:           '#1d232a',
    cardBorder:       'rgba(160,190,220,0.12)',
    cardBorderHover:  'rgba(160,190,220,0.24)',
    wellBg:           '#14181d',
    textPrimary:      '#eeeae5',
    textSecondary:    '#aab7c5',
    textMuted:        '#8799aa',
    textGhost:        '#6c7d90',
    accent:           '#38bdf8',
    accentHover:      '#7dd3fc',
    accentSubtle:     'rgba(56,189,248,0.1)',
    accentGlow:       'rgba(56,189,248,0.26)',
    divider:          'rgba(160,190,220,0.08)',
    focusBorder:      '#38bdf8',
    ambientGlow1:     'rgba(56,189,248,0.06)',
    ambientGlow2:     'rgba(14,60,100,0.22)',
    shadowSm:         '0 1px 4px rgba(0,0,0,0.38)',
    shadowMd:         '0 6px 20px rgba(0,0,0,0.42), inset 0 1px 0 rgba(160,190,220,0.06)',
    shadowLg:         '0 14px 38px rgba(0,0,0,0.5), inset 0 1px 0 rgba(160,190,220,0.08)',
    blur:             18,
    glowIntensity:    0.6,
    radius:           20,
    density:          'spacious',
  },

  // ─── Pressure ── fire-charged orange. Urgency as aesthetic. ─────────────────
  {
    id: 'exam-pressure',
    name: 'Pressure',
    emoji: '🔥',
    description: 'High stakes. Every second counts.',
    pageBg:           '#120c08',
    navBg:            'rgba(18,12,8,0.92)',
    cardBg:           '#1d140d',
    cardBorder:       'rgba(255,160,60,0.12)',
    cardBorderHover:  'rgba(255,160,60,0.24)',
    wellBg:           '#140d07',
    textPrimary:      '#fef0da',
    textSecondary:    '#d9a66d',
    textMuted:        '#bb7c46',
    textGhost:        '#935e30',
    accent:           '#f97316',
    accentHover:      '#fb923c',
    accentSubtle:     'rgba(249,115,22,0.12)',
    accentGlow:       'rgba(249,115,22,0.35)',
    divider:          'rgba(255,160,60,0.08)',
    focusBorder:      '#f97316',
    ambientGlow1:     'rgba(249,115,22,0.07)',
    ambientGlow2:     'rgba(239,68,68,0.05)',
    shadowSm:         '0 1px 3px rgba(0,0,0,0.48)',
    shadowMd:         '0 6px 18px rgba(0,0,0,0.52), inset 0 1px 0 rgba(255,160,60,0.06)',
    shadowLg:         '0 14px 36px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,160,60,0.08)',
    blur:             12,
    glowIntensity:    0.95,
    radius:           12,
    density:          'compact',
  },

  // ─── Zen ── monochrome. Silence made visible. ───────────────────────────────
  {
    id: 'minimal-zen',
    name: 'Zen',
    emoji: '◯',
    description: 'Monochrome. Silence. Only what matters.',
    pageBg:           '#121212',
    navBg:            'rgba(18,18,18,0.94)',
    cardBg:           '#1a1a1a',
    cardBorder:       'rgba(255,255,255,0.08)',
    cardBorderHover:  'rgba(255,255,255,0.16)',
    wellBg:           '#141414',
    textPrimary:      '#e8e8e8',
    textSecondary:    '#b0b0b0',
    textMuted:        '#929292',
    textGhost:        '#747474',
    accent:           '#d4d4d4',
    accentHover:      '#f5f5f5',
    accentSubtle:     'rgba(212,212,212,0.08)',
    accentGlow:       'rgba(212,212,212,0.16)',
    divider:          'rgba(255,255,255,0.06)',
    focusBorder:      '#888888',
    ambientGlow1:     'rgba(0,0,0,0)',
    ambientGlow2:     'rgba(0,0,0,0)',
    shadowSm:         '0 1px 3px rgba(0,0,0,0.44)',
    shadowMd:         '0 6px 18px rgba(0,0,0,0.46), inset 0 1px 0 rgba(255,255,255,0.04)',
    shadowLg:         '0 14px 34px rgba(0,0,0,0.54), inset 0 1px 0 rgba(255,255,255,0.05)',
    blur:             0,
    glowIntensity:    0,
    radius:           10,
    density:          'spacious',
  },

  // ─── Studio ── violet creative energy. Ideas want to move. ──────────────────
  {
    id: 'creative',
    name: 'Studio',
    emoji: '✦',
    description: 'Violet-charged. Creative momentum.',
    pageBg:           '#0f0c19',
    navBg:            'rgba(15,12,25,0.9)',
    cardBg:           '#181427',
    cardBorder:       'rgba(180,160,255,0.12)',
    cardBorderHover:  'rgba(180,160,255,0.24)',
    wellBg:           '#100c1c',
    textPrimary:      '#f0eeff',
    textSecondary:    '#b8aedf',
    textMuted:        '#9e86c4',
    textGhost:        '#816ba4',
    accent:           '#a78bfa',
    accentHover:      '#c4b5fd',
    accentSubtle:     'rgba(167,139,250,0.12)',
    accentGlow:       'rgba(167,139,250,0.32)',
    divider:          'rgba(180,160,255,0.08)',
    focusBorder:      '#a78bfa',
    ambientGlow1:     'rgba(167,139,250,0.07)',
    ambientGlow2:     'rgba(236,72,153,0.05)',
    shadowSm:         '0 1px 3px rgba(0,0,0,0.48)',
    shadowMd:         '0 6px 20px rgba(0,0,0,0.52), inset 0 1px 0 rgba(180,160,255,0.06)',
    shadowLg:         '0 14px 38px rgba(0,0,0,0.6), inset 0 1px 0 rgba(180,160,255,0.08)',
    blur:             18,
    glowIntensity:    0.85,
    radius:           18,
    density:          'comfortable',
  },

  // ─── Sage ── deep green calm. Forest-floor thinking. ────────────────────────
  {
    id: 'sage',
    name: 'Sage',
    emoji: '🌿',
    description: 'Deep green. Grounded. Restorative.',
    pageBg:           '#0c1510',
    navBg:            'rgba(12,21,16,0.9)',
    cardBg:           '#15211b',
    cardBorder:       'rgba(120,200,140,0.12)',
    cardBorderHover:  'rgba(120,200,140,0.24)',
    wellBg:           '#0f1813',
    textPrimary:      '#e6f0e8',
    textSecondary:    '#9fc5a6',
    textMuted:        '#81ab89',
    textGhost:        '#698f71',
    accent:           '#4ade80',
    accentHover:      '#86efac',
    accentSubtle:     'rgba(74,222,128,0.1)',
    accentGlow:       'rgba(74,222,128,0.26)',
    divider:          'rgba(120,200,140,0.08)',
    focusBorder:      '#4ade80',
    ambientGlow1:     'rgba(74,222,128,0.06)',
    ambientGlow2:     'rgba(20,80,30,0.24)',
    shadowSm:         '0 1px 3px rgba(0,0,0,0.44)',
    shadowMd:         '0 6px 18px rgba(0,0,0,0.48), inset 0 1px 0 rgba(120,200,140,0.06)',
    shadowLg:         '0 14px 34px rgba(0,0,0,0.56), inset 0 1px 0 rgba(120,200,140,0.08)',
    blur:             16,
    glowIntensity:    0.55,
    radius:           18,
    density:          'spacious',
  },

];

// ── Persistence ───────────────────────────────────────────────────────────────

const STORAGE_KEY = 'fw_atmosphere_v2';

function loadId(): string {
  return localStorage.getItem(STORAGE_KEY) ?? 'neural';
}

function applyToDom(t: AtmosphereTokens) {
  const r = document.documentElement;
  r.style.setProperty('--fw-bg',              t.pageBg);
  r.style.setProperty('--fw-accent',          t.accent);
  r.style.setProperty('--fw-accent-glow',     t.accentGlow);
  r.style.setProperty('--fw-card-bg',         t.cardBg);
  r.style.setProperty('--fw-card-border',     t.cardBorder);
  r.style.setProperty('--fw-text-primary',    t.textPrimary);
  r.style.setProperty('--fw-text-secondary',  t.textSecondary);
  r.style.setProperty('--fw-text-muted',      t.textMuted);
  r.style.setProperty('--fw-divider',         t.divider);
  r.style.setProperty('--fw-radius',          `${t.radius}px`);
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useAtmosphere() {
  const [atmosphereId, setAtmosphereId] = useState<string>(loadId);

  const tokens = ATMOSPHERES.find(a => a.id === atmosphereId) ?? ATMOSPHERES[0];

  useEffect(() => {
    applyToDom(tokens);
  }, [tokens]);

  const setAtmosphere = useCallback((id: string) => {
    setAtmosphereId(id);
    localStorage.setItem(STORAGE_KEY, id);
  }, []);

  return { tokens, atmosphereId, setAtmosphere, atmospheres: ATMOSPHERES };
}
