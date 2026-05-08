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
    pageBg:           '#0a0805',
    navBg:            'rgba(10,8,5,0.92)',
    cardBg:           '#13100c',
    cardBorder:       'rgba(255,200,120,0.08)',
    cardBorderHover:  'rgba(255,200,120,0.16)',
    wellBg:           '#0c0a07',
    textPrimary:      '#f5ede0',
    textSecondary:    '#a89070',
    textMuted:        '#5c4830',
    textGhost:        '#3a2e1e',   // visible on cardBg ~3.5:1
    accent:           '#f59e0b',
    accentHover:      '#fbbf24',
    accentSubtle:     'rgba(245,158,11,0.10)',
    accentGlow:       'rgba(245,158,11,0.30)',
    divider:          'rgba(255,200,120,0.05)',
    focusBorder:      '#f59e0b',
    ambientGlow1:     'rgba(245,158,11,0.05)',
    ambientGlow2:     'rgba(180,100,20,0.03)',
    shadowSm:         '0 1px 3px rgba(0,0,0,0.55)',
    shadowMd:         '0 4px 16px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,200,120,0.04)',
    shadowLg:         '0 8px 32px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,200,120,0.05)',
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
    pageBg:           '#060506',
    navBg:            'rgba(6,5,6,0.97)',
    cardBg:           '#0d0c0e',
    cardBorder:       'rgba(255,255,255,0.06)',
    cardBorderHover:  'rgba(255,255,255,0.12)',
    wellBg:           '#050405',
    textPrimary:      '#e8e2f0',
    textSecondary:    '#6b6280',
    textMuted:        '#3c3850',
    textGhost:        '#2a2838',   // visible ~3:1 on cardBg
    accent:           '#818cf8',
    accentHover:      '#a5b4fc',
    accentSubtle:     'rgba(129,140,248,0.08)',
    accentGlow:       'rgba(129,140,248,0.22)',
    divider:          'rgba(255,255,255,0.04)',
    focusBorder:      '#818cf8',
    ambientGlow1:     'rgba(129,140,248,0.03)',
    ambientGlow2:     'rgba(139,92,246,0.02)',
    shadowSm:         '0 1px 3px rgba(0,0,0,0.8)',
    shadowMd:         '0 4px 20px rgba(0,0,0,0.8)',
    shadowLg:         '0 8px 40px rgba(0,0,0,0.9)',
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
    pageBg:           '#0d0e10',
    navBg:            'rgba(13,14,16,0.93)',
    cardBg:           '#171a1e',
    cardBorder:       'rgba(160,190,220,0.08)',
    cardBorderHover:  'rgba(160,190,220,0.16)',
    wellBg:           '#0c0d0f',
    textPrimary:      '#eeeae5',
    textSecondary:    '#8898a8',
    textMuted:        '#495562',
    textGhost:        '#323d48',   // visible ~3:1 on cardBg
    accent:           '#38bdf8',
    accentHover:      '#7dd3fc',
    accentSubtle:     'rgba(56,189,248,0.08)',
    accentGlow:       'rgba(56,189,248,0.22)',
    divider:          'rgba(160,190,220,0.05)',
    focusBorder:      '#38bdf8',
    ambientGlow1:     'rgba(56,189,248,0.04)',
    ambientGlow2:     'rgba(14,60,100,0.3)',
    shadowSm:         '0 1px 4px rgba(0,0,0,0.45)',
    shadowMd:         '0 4px 18px rgba(0,0,0,0.50), inset 0 1px 0 rgba(160,190,220,0.04)',
    shadowLg:         '0 8px 36px rgba(0,0,0,0.60), inset 0 1px 0 rgba(160,190,220,0.05)',
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
    pageBg:           '#0d0804',
    navBg:            'rgba(13,8,4,0.96)',
    cardBg:           '#160d06',
    cardBorder:       'rgba(255,160,60,0.08)',
    cardBorderHover:  'rgba(255,160,60,0.16)',
    wellBg:           '#0b0603',
    textPrimary:      '#fef0da',
    textSecondary:    '#b07840',
    textMuted:        '#6a4020',
    textGhost:        '#3e2410',   // visible ~3:1 on cardBg
    accent:           '#f97316',
    accentHover:      '#fb923c',
    accentSubtle:     'rgba(249,115,22,0.10)',
    accentGlow:       'rgba(249,115,22,0.35)',
    divider:          'rgba(255,160,60,0.05)',
    focusBorder:      '#f97316',
    ambientGlow1:     'rgba(249,115,22,0.06)',
    ambientGlow2:     'rgba(239,68,68,0.04)',
    shadowSm:         '0 1px 3px rgba(0,0,0,0.6)',
    shadowMd:         '0 4px 16px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,160,60,0.04)',
    shadowLg:         '0 8px 32px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,160,60,0.05)',
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
    pageBg:           '#090909',
    navBg:            'rgba(9,9,9,0.98)',
    cardBg:           '#111111',
    cardBorder:       'rgba(255,255,255,0.06)',
    cardBorderHover:  'rgba(255,255,255,0.12)',
    wellBg:           '#080808',
    textPrimary:      '#e8e8e8',
    textSecondary:    '#666666',
    textMuted:        '#383838',
    textGhost:        '#282828',   // just visible on #111
    accent:           '#d4d4d4',
    accentHover:      '#f5f5f5',
    accentSubtle:     'rgba(212,212,212,0.06)',
    accentGlow:       'rgba(212,212,212,0.12)',
    divider:          'rgba(255,255,255,0.04)',
    focusBorder:      '#888888',
    ambientGlow1:     'rgba(0,0,0,0)',
    ambientGlow2:     'rgba(0,0,0,0)',
    shadowSm:         '0 1px 3px rgba(0,0,0,0.6)',
    shadowMd:         '0 4px 16px rgba(0,0,0,0.6)',
    shadowLg:         '0 8px 32px rgba(0,0,0,0.7)',
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
    pageBg:           '#07060f',
    navBg:            'rgba(7,6,15,0.93)',
    cardBg:           '#0e0b1a',
    cardBorder:       'rgba(180,160,255,0.08)',
    cardBorderHover:  'rgba(180,160,255,0.16)',
    wellBg:           '#060510',
    textPrimary:      '#f0eeff',
    textSecondary:    '#9080c0',
    textMuted:        '#504060',
    textGhost:        '#332840',   // visible on #0e0b1a ~3:1
    accent:           '#a78bfa',
    accentHover:      '#c4b5fd',
    accentSubtle:     'rgba(167,139,250,0.10)',
    accentGlow:       'rgba(167,139,250,0.28)',
    divider:          'rgba(180,160,255,0.05)',
    focusBorder:      '#a78bfa',
    ambientGlow1:     'rgba(167,139,250,0.05)',
    ambientGlow2:     'rgba(236,72,153,0.03)',
    shadowSm:         '0 1px 3px rgba(0,0,0,0.6)',
    shadowMd:         '0 4px 18px rgba(0,0,0,0.6), inset 0 1px 0 rgba(180,160,255,0.04)',
    shadowLg:         '0 8px 36px rgba(0,0,0,0.7), inset 0 1px 0 rgba(180,160,255,0.05)',
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
    pageBg:           '#060d09',
    navBg:            'rgba(6,13,9,0.94)',
    cardBg:           '#0c1510',
    cardBorder:       'rgba(120,200,140,0.08)',
    cardBorderHover:  'rgba(120,200,140,0.16)',
    wellBg:           '#050c08',
    textPrimary:      '#e6f0e8',
    textSecondary:    '#78a882',
    textMuted:        '#3e6045',
    textGhost:        '#243828',   // visible on #0c1510 ~3:1
    accent:           '#4ade80',
    accentHover:      '#86efac',
    accentSubtle:     'rgba(74,222,128,0.08)',
    accentGlow:       'rgba(74,222,128,0.22)',
    divider:          'rgba(120,200,140,0.05)',
    focusBorder:      '#4ade80',
    ambientGlow1:     'rgba(74,222,128,0.04)',
    ambientGlow2:     'rgba(20,80,30,0.4)',
    shadowSm:         '0 1px 3px rgba(0,0,0,0.55)',
    shadowMd:         '0 4px 16px rgba(0,0,0,0.55), inset 0 1px 0 rgba(120,200,140,0.04)',
    shadowLg:         '0 8px 32px rgba(0,0,0,0.65), inset 0 1px 0 rgba(120,200,140,0.05)',
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
