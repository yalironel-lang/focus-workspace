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
  wellBg: string;       // inset / tactile-well areas

  // Text
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textGhost: string;

  // Accent
  accent: string;
  accentHover: string;
  accentSubtle: string; // low-opacity accent for backgrounds
  accentGlow: string;   // drop-shadow glow color

  // Dividers & misc
  divider: string;
  focusBorder: string;

  // Ambient
  ambientGlow1: string; // radial gradient color 1 (top-left)
  ambientGlow2: string; // radial gradient color 2 (bottom-right)

  // Motion & depth
  shadowSm: string;
  shadowMd: string;
  shadowLg: string;
  blur: number;         // backdrop-blur in px
  glowIntensity: number; // 0-1 multiplier

  // Layout feel
  radius: number;       // base border-radius in px (applied to .rounded-2xl via CSS var)
  density: 'compact' | 'comfortable' | 'spacious';
}

// ── Atmosphere definitions ────────────────────────────────────────────────────

export const ATMOSPHERES: AtmosphereTokens[] = [
  {
    id: 'neural',
    name: 'Neural',
    emoji: '⚡',
    description: 'Deep navy + gold. Focused intelligence.',
    pageBg:           '#070b14',
    navBg:            'rgba(7,11,20,0.94)',
    cardBg:           '#0d1424',
    cardBorder:       '#1a2638',
    cardBorderHover:  '#2a3a54',
    wellBg:           '#060a12',
    textPrimary:      '#f1f5f9',
    textSecondary:    '#94a3b8',
    textMuted:        '#475569',
    textGhost:        '#1e2d40',
    accent:           '#f59e0b',
    accentHover:      '#fbbf24',
    accentSubtle:     'rgba(245,158,11,0.12)',
    accentGlow:       'rgba(245,158,11,0.35)',
    divider:          '#0f1826',
    focusBorder:      '#f59e0b',
    ambientGlow1:     'rgba(245,158,11,0.04)',
    ambientGlow2:     'rgba(99,102,241,0.03)',
    shadowSm:         '0 1px 3px rgba(0,0,0,0.5)',
    shadowMd:         '0 4px 16px rgba(0,0,0,0.5)',
    shadowLg:         '0 8px 32px rgba(0,0,0,0.6)',
    blur:             14,
    glowIntensity:    0.8,
    radius:           16,
    density:          'comfortable',
  },
  {
    id: 'deep-focus',
    name: 'Deep Focus',
    emoji: '🌑',
    description: 'Near-black. Nothing but the work.',
    pageBg:           '#050507',
    navBg:            'rgba(5,5,7,0.97)',
    cardBg:           '#0b0b0f',
    cardBorder:       '#151520',
    cardBorderHover:  '#222230',
    wellBg:           '#040406',
    textPrimary:      '#e8eaf0',
    textSecondary:    '#6b7280',
    textMuted:        '#374151',
    textGhost:        '#1f2937',
    accent:           '#818cf8',
    accentHover:      '#a5b4fc',
    accentSubtle:     'rgba(129,140,248,0.1)',
    accentGlow:       'rgba(129,140,248,0.25)',
    divider:          '#0d0d15',
    focusBorder:      '#818cf8',
    ambientGlow1:     'rgba(129,140,248,0.03)',
    ambientGlow2:     'rgba(0,0,0,0)',
    shadowSm:         '0 1px 3px rgba(0,0,0,0.8)',
    shadowMd:         '0 4px 20px rgba(0,0,0,0.8)',
    shadowLg:         '0 8px 40px rgba(0,0,0,0.9)',
    blur:             8,
    glowIntensity:    0.3,
    radius:           12,
    density:          'compact',
  },
  {
    id: 'calm-night',
    name: 'Calm Night',
    emoji: '🌙',
    description: 'Warm charcoal. Soft and unhurried.',
    pageBg:           '#0d0f10',
    navBg:            'rgba(13,15,16,0.94)',
    cardBg:           '#161a1c',
    cardBorder:       '#252d30',
    cardBorderHover:  '#3a464a',
    wellBg:           '#0c0e0f',
    textPrimary:      '#f0ece8',
    textSecondary:    '#8a9199',
    textMuted:        '#4a5560',
    textGhost:        '#252d32',
    accent:           '#38bdf8',
    accentHover:      '#7dd3fc',
    accentSubtle:     'rgba(56,189,248,0.1)',
    accentGlow:       'rgba(56,189,248,0.25)',
    divider:          '#171e21',
    focusBorder:      '#38bdf8',
    ambientGlow1:     'rgba(56,189,248,0.04)',
    ambientGlow2:     'rgba(20,36,50,0.8)',
    shadowSm:         '0 1px 4px rgba(0,0,0,0.4)',
    shadowMd:         '0 4px 18px rgba(0,0,0,0.45)',
    shadowLg:         '0 8px 36px rgba(0,0,0,0.55)',
    blur:             16,
    glowIntensity:    0.6,
    radius:           20,
    density:          'spacious',
  },
  {
    id: 'exam-pressure',
    name: 'Exam Mode',
    emoji: '🔥',
    description: 'Urgency is visible. Pressure activates.',
    pageBg:           '#0d0804',
    navBg:            'rgba(13,8,4,0.96)',
    cardBg:           '#150e07',
    cardBorder:       '#2a1a0a',
    cardBorderHover:  '#3d2510',
    wellBg:           '#0b0603',
    textPrimary:      '#fef3e2',
    textSecondary:    '#a07850',
    textMuted:        '#5a3c20',
    textGhost:        '#2a1a08',
    accent:           '#f97316',
    accentHover:      '#fb923c',
    accentSubtle:     'rgba(249,115,22,0.12)',
    accentGlow:       'rgba(249,115,22,0.4)',
    divider:          '#1a0e04',
    focusBorder:      '#f97316',
    ambientGlow1:     'rgba(249,115,22,0.06)',
    ambientGlow2:     'rgba(239,68,68,0.03)',
    shadowSm:         '0 1px 3px rgba(0,0,0,0.6)',
    shadowMd:         '0 4px 16px rgba(0,0,0,0.6)',
    shadowLg:         '0 8px 32px rgba(0,0,0,0.7)',
    blur:             10,
    glowIntensity:    1.0,
    radius:           12,
    density:          'compact',
  },
  {
    id: 'minimal-zen',
    name: 'Minimal Zen',
    emoji: '◯',
    description: 'Ultra-minimal. Only what matters.',
    pageBg:           '#090909',
    navBg:            'rgba(9,9,9,0.98)',
    cardBg:           '#111111',
    cardBorder:       '#1c1c1c',
    cardBorderHover:  '#2a2a2a',
    wellBg:           '#080808',
    textPrimary:      '#e8e8e8',
    textSecondary:    '#666666',
    textMuted:        '#333333',
    textGhost:        '#1a1a1a',
    accent:           '#d4d4d4',
    accentHover:      '#ffffff',
    accentSubtle:     'rgba(212,212,212,0.08)',
    accentGlow:       'rgba(212,212,212,0.15)',
    divider:          '#141414',
    focusBorder:      '#555555',
    ambientGlow1:     'rgba(0,0,0,0)',
    ambientGlow2:     'rgba(0,0,0,0)',
    shadowSm:         '0 1px 3px rgba(0,0,0,0.6)',
    shadowMd:         '0 4px 16px rgba(0,0,0,0.6)',
    shadowLg:         '0 8px 32px rgba(0,0,0,0.7)',
    blur:             0,
    glowIntensity:    0,
    radius:           8,
    density:          'spacious',
  },
  {
    id: 'creative',
    name: 'Creative',
    emoji: '✦',
    description: 'Violet-charged. Ideas want to move.',
    pageBg:           '#07060f',
    navBg:            'rgba(7,6,15,0.94)',
    cardBg:           '#0e0c1a',
    cardBorder:       '#1e1838',
    cardBorderHover:  '#2e2550',
    wellBg:           '#060510',
    textPrimary:      '#f0eeff',
    textSecondary:    '#9b8fc0',
    textMuted:        '#4d4270',
    textGhost:        '#201c35',
    accent:           '#a78bfa',
    accentHover:      '#c4b5fd',
    accentSubtle:     'rgba(167,139,250,0.12)',
    accentGlow:       'rgba(167,139,250,0.35)',
    divider:          '#130f25',
    focusBorder:      '#a78bfa',
    ambientGlow1:     'rgba(167,139,250,0.05)',
    ambientGlow2:     'rgba(236,72,153,0.03)',
    shadowSm:         '0 1px 3px rgba(0,0,0,0.6)',
    shadowMd:         '0 4px 18px rgba(0,0,0,0.6)',
    shadowLg:         '0 8px 36px rgba(0,0,0,0.7)',
    blur:             16,
    glowIntensity:    0.9,
    radius:           18,
    density:          'comfortable',
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
