/**
 * HomeGuideCompanion — Feature Explorer companion for the library home screen.
 *
 * UX flow:
 *   click trigger → FeatureMenu (companion + 8 selectable feature chips)
 *                → FeatureBubble (companion + explanation + micro-preview + action)
 *
 * Preserved entirely: hexToRgb, SpotlightRect, TargetRadiance, AtmosphericSmear,
 *                     CompanionFigure, HomeGuideTrigger, HOME_GUIDE_KEYFRAMES.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';

// ── Keyframes ─────────────────────────────────────────────────────────────────

const HOME_GUIDE_KEYFRAMES = `
@keyframes hg-breathe {
  0%, 100% { transform: scale(1);     }
  50%       { transform: scale(1.035); }
}
@keyframes hg-companion-in {
  from { opacity: 0; transform: scale(0.70) translateY(8px); }
  to   { opacity: 1; transform: scale(1)    translateY(0);   }
}
@keyframes hg-bubble-in {
  from { opacity: 0; transform: translateY(10px); }
  to   { opacity: 1; transform: translateY(0);    }
}
@keyframes hg-node-breathe {
  0%, 100% { opacity: 0.40; box-shadow: 0 0 5px rgba(245,158,11,0.18); }
  50%       { opacity: 0.82; box-shadow: 0 0 12px rgba(245,158,11,0.32); }
}
@keyframes hg-trig-pulse {
  0%, 100% { box-shadow: 0 0 6px rgba(245,158,11,0.12); }
  50%       { box-shadow: 0 0 20px rgba(245,158,11,0.34); }
}
`;

// ── Feature data ──────────────────────────────────────────────────────────────

interface GuideFeature {
  id:       string;
  label:    string;
  target:   string | null;
  headline: string;
  body:     string;
  action:   { label: string };
  Preview:  () => React.ReactElement;
}

// ── Micro-preview components ──────────────────────────────────────────────────

function PreviewLibrary(): React.ReactElement {
  return (
    <svg width="100%" height="56" viewBox="0 0 232 56" preserveAspectRatio="xMidYMid meet">
      {/* Card stack — 3 cards slightly offset */}
      <rect x="28" y="12" width="158" height="40" rx="5" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.07)" strokeWidth="1"/>
      <rect x="20" y="7"  width="158" height="40" rx="5" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.09)" strokeWidth="1"/>
      <rect x="12" y="2"  width="158" height="40" rx="5" fill="rgba(255,255,255,0.07)" stroke="rgba(255,255,255,0.12)" strokeWidth="1"/>
      {/* Amber accent bar on front card */}
      <rect x="12" y="2" width="3" height="40" rx="1.5" fill="rgba(245,158,11,0.65)"/>
      {/* Title line */}
      <rect x="22" y="10" width="56" height="4" rx="2" fill="rgba(255,255,255,0.22)"/>
      {/* Body lines */}
      <rect x="22" y="19" width="40" height="3" rx="1.5" fill="rgba(255,255,255,0.10)"/>
      <rect x="22" y="25" width="52" height="3" rx="1.5" fill="rgba(255,255,255,0.07)"/>
      {/* Progress bar */}
      <rect x="22" y="34" width="80" height="2.5" rx="1.25" fill="rgba(255,255,255,0.06)"/>
      <rect x="22" y="34" width="48" height="2.5" rx="1.25" fill="rgba(245,158,11,0.42)"/>
      {/* Stack count badge */}
      <rect x="184" y="22" width="36" height="14" rx="5" fill="rgba(245,158,11,0.07)" stroke="rgba(245,158,11,0.18)" strokeWidth="1"/>
      <rect x="192" y="27" width="20" height="3" rx="1.5" fill="rgba(245,158,11,0.35)"/>
    </svg>
  );
}

function PreviewWorkspace(): React.ReactElement {
  return (
    <svg width="100%" height="56" viewBox="0 0 232 56" preserveAspectRatio="xMidYMid meet">
      <rect x="14" y="2" width="204" height="52" rx="7" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.10)" strokeWidth="1"/>
      <rect x="14" y="2" width="3"   height="52" rx="1.5" fill="rgba(245,158,11,0.60)"/>
      {/* Title */}
      <rect x="24" y="11" width="68" height="5" rx="2.5" fill="rgba(255,255,255,0.26)"/>
      {/* Body lines */}
      <rect x="24" y="22" width="96" height="3" rx="1.5" fill="rgba(255,255,255,0.10)"/>
      <rect x="24" y="29" width="76" height="3" rx="1.5" fill="rgba(255,255,255,0.07)"/>
      {/* Circular progress */}
      <circle cx="190" cy="27" r="14" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="2.5"/>
      <circle cx="190" cy="27" r="14" fill="none" stroke="rgba(245,158,11,0.45)" strokeWidth="2.5"
        strokeDasharray="54 34" strokeLinecap="round" transform="rotate(-90 190 27)"/>
      <rect x="185" y="24" width="10" height="4" rx="2" fill="rgba(245,158,11,0.50)"/>
      {/* Resume button */}
      <rect x="24" y="40" width="60" height="10" rx="5" fill="rgba(245,158,11,0.14)" stroke="rgba(245,158,11,0.28)" strokeWidth="1"/>
      <rect x="32" y="44" width="36" height="2.5" rx="1.25" fill="rgba(245,158,11,0.55)"/>
    </svg>
  );
}

function PreviewFreeSpace(): React.ReactElement {
  const dotXs = [36, 72, 108, 144, 180];
  const dotYs = [14, 28, 42];
  return (
    <svg width="100%" height="56" viewBox="0 0 232 56" preserveAspectRatio="xMidYMid meet">
      <rect x="0" y="0" width="232" height="56" rx="6" fill="rgba(14,10,6,0.45)"/>
      {dotXs.flatMap(x => dotYs.map(y => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="0.8" fill="rgba(255,255,255,0.08)"/>
      )))}
      {/* Floating note card */}
      <g transform="translate(22,8) rotate(-4 36 20)">
        <rect width="70" height="37" rx="5" fill="rgba(255,255,255,0.09)" stroke="rgba(255,255,255,0.12)" strokeWidth="1"/>
        <rect x="0" y="0" width="3" height="37" rx="1.5" fill="rgba(245,158,11,0.48)"/>
        <rect x="8" y="8"  width="36" height="3.5" rx="1.75" fill="rgba(255,255,255,0.20)"/>
        <rect x="8" y="16" width="28" height="2.5" rx="1.25" fill="rgba(255,255,255,0.09)"/>
        <rect x="8" y="22" width="32" height="2.5" rx="1.25" fill="rgba(255,255,255,0.06)"/>
      </g>
      {/* Floating PDF card */}
      <g transform="translate(108,14) rotate(3 27 16)">
        <rect width="54" height="30" rx="5" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.09)" strokeWidth="1"/>
        <rect x="5" y="7"  width="18" height="3"   rx="1.5"  fill="rgba(99,102,241,0.38)"/>
        <rect x="5" y="14" width="40" height="2.5" rx="1.25" fill="rgba(255,255,255,0.08)"/>
        <rect x="5" y="19" width="34" height="2.5" rx="1.25" fill="rgba(255,255,255,0.05)"/>
      </g>
      {/* Amber connection thread */}
      <path d="M 92 27 C 100 20,108 24,108 27" stroke="rgba(245,158,11,0.60)" strokeWidth="1.2" strokeDasharray="3 4" fill="none"/>
      {/* Floating amber idea card */}
      <g transform="translate(172,7) rotate(-2 22 14)">
        <rect width="46" height="28" rx="5" fill="rgba(245,158,11,0.07)" stroke="rgba(245,158,11,0.20)" strokeWidth="1"/>
        <rect x="5" y="7"  width="24" height="3"   rx="1.5"  fill="rgba(245,158,11,0.35)"/>
        <rect x="5" y="14" width="18" height="2.5" rx="1.25" fill="rgba(255,255,255,0.06)"/>
      </g>
    </svg>
  );
}

function PreviewStudyLoop(): React.ReactElement {
  return (
    <svg width="100%" height="56" viewBox="0 0 232 56" preserveAspectRatio="xMidYMid meet">
      {/* Mistake card */}
      <rect x="10" y="5"  width="84" height="47" rx="6" fill="rgba(255,255,255,0.05)" stroke="rgba(239,68,68,0.22)" strokeWidth="1"/>
      <rect x="10" y="5"  width="3"  height="47" rx="1.5" fill="rgba(239,68,68,0.50)"/>
      <rect x="18" y="12" width="36" height="4"   rx="2"    fill="rgba(239,68,68,0.28)"/>
      <rect x="18" y="21" width="54" height="3"   rx="1.5"  fill="rgba(255,255,255,0.12)"/>
      <rect x="18" y="28" width="44" height="3"   rx="1.5"  fill="rgba(255,255,255,0.08)"/>
      <rect x="18" y="38" width="44" height="9"   rx="4.5"  fill="rgba(245,158,11,0.14)" stroke="rgba(245,158,11,0.30)" strokeWidth="1"/>
      <rect x="26" y="41.5" width="28" height="2.5" rx="1.25" fill="rgba(245,158,11,0.55)"/>
      {/* Time-flow arrow */}
      <path d="M 100 28 L 118 28" stroke="rgba(255,255,255,0.14)" strokeWidth="1.5" strokeDasharray="2 3"/>
      <path d="M 114 24 L 118 28 L 114 32" stroke="rgba(255,255,255,0.14)" strokeWidth="1.5" fill="none"/>
      {/* Resurfaced card */}
      <rect x="126" y="7"  width="96" height="43" rx="6" fill="rgba(245,158,11,0.05)" stroke="rgba(245,158,11,0.20)" strokeWidth="1"/>
      <rect x="126" y="7"  width="3"  height="43" rx="1.5" fill="rgba(245,158,11,0.52)"/>
      <rect x="134" y="14" width="38" height="4"  rx="2"   fill="rgba(245,158,11,0.30)"/>
      <rect x="134" y="23" width="68" height="3"  rx="1.5" fill="rgba(255,255,255,0.12)"/>
      <rect x="134" y="30" width="54" height="3"  rx="1.5" fill="rgba(255,255,255,0.07)"/>
      <circle cx="206" cy="16" r="5"   fill="rgba(245,158,11,0.18)"/>
      <circle cx="206" cy="16" r="3.5" fill="rgba(245,158,11,0.58)"/>
    </svg>
  );
}

function PreviewNotesMath(): React.ReactElement {
  return (
    <svg width="100%" height="56" viewBox="0 0 232 56" preserveAspectRatio="xMidYMid meet">
      {/* Raw input panel */}
      <rect x="4" y="3" width="98" height="51" rx="6" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.08)" strokeWidth="1"/>
      <rect x="11" y="10" width="24" height="3.5" rx="1.75" fill="rgba(255,255,255,0.14)"/>
      {/* Monospace-style lines (square corners = code feel) */}
      <rect x="11" y="19" width="78" height="2.5" rx="0" fill="rgba(255,255,255,0.13)"/>
      <rect x="11" y="25" width="64" height="2.5" rx="0" fill="rgba(255,255,255,0.10)"/>
      <rect x="11" y="31" width="72" height="2.5" rx="0" fill="rgba(255,255,255,0.08)"/>
      <rect x="11" y="37" width="54" height="2.5" rx="0" fill="rgba(255,255,255,0.06)"/>
      <rect x="11" y="43" width="70" height="2.5" rx="0" fill="rgba(255,255,255,0.05)"/>
      {/* Amber transform arrow */}
      <path d="M 108 28 L 124 28" stroke="rgba(245,158,11,0.55)" strokeWidth="1.5"/>
      <path d="M 120 24 L 124 28 L 120 32" stroke="rgba(245,158,11,0.55)" strokeWidth="1.5" fill="none"/>
      {/* Rendered panel */}
      <rect x="130" y="3" width="98" height="51" rx="6" fill="rgba(255,255,255,0.05)" stroke="rgba(245,158,11,0.13)" strokeWidth="1"/>
      <rect x="138" y="10" width="30" height="3.5" rx="1.75" fill="rgba(245,158,11,0.22)"/>
      {/* Rendered math — rounded corners = elegant */}
      <rect x="138" y="20" width="72" height="4"   rx="2"    fill="rgba(255,255,255,0.20)"/>
      <rect x="140" y="28" width="44" height="3.5" rx="1.75" fill="rgba(255,255,255,0.14)"/>
      {/* Fraction bar */}
      <rect x="138" y="34" width="62" height="1.5" rx="0.75" fill="rgba(245,158,11,0.44)"/>
      <rect x="140" y="37" width="48" height="3.5" rx="1.75" fill="rgba(245,158,11,0.22)"/>
      <rect x="138" y="44" width="54" height="3.5" rx="1.75" fill="rgba(255,255,255,0.12)"/>
    </svg>
  );
}

function PreviewSources(): React.ReactElement {
  return (
    <svg width="100%" height="56" viewBox="0 0 232 56" preserveAspectRatio="xMidYMid meet">
      {/* PDF page */}
      <rect x="8"  y="2" width="60" height="53" rx="5" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.10)" strokeWidth="1"/>
      {/* Folded corner */}
      <path d="M 50 2 L 68 2 L 68 20 Z" fill="rgba(14,10,6,0.55)"/>
      <path d="M 50 2 L 50 20 L 68 20"  stroke="rgba(255,255,255,0.08)" strokeWidth="1" fill="none"/>
      {/* PDF content */}
      <rect x="15" y="24" width="38" height="3"  rx="1.5" fill="rgba(255,255,255,0.15)"/>
      <rect x="15" y="31" width="32" height="2.5" rx="1.25" fill="rgba(255,255,255,0.08)"/>
      {/* Highlighted passage */}
      <rect x="15" y="39" width="42" height="10" rx="3" fill="rgba(245,158,11,0.13)" stroke="rgba(245,158,11,0.24)" strokeWidth="1"/>
      <rect x="18" y="42.5" width="34" height="2.5" rx="1.25" fill="rgba(245,158,11,0.42)"/>
      {/* Curved flow arrow */}
      <path d="M 74 36 C 90 26,104 28,118 33" stroke="rgba(245,158,11,0.52)" strokeWidth="1.5" fill="none"/>
      <path d="M 114 29 L 118 33 L 114 37" stroke="rgba(245,158,11,0.52)" strokeWidth="1.5" fill="none"/>
      {/* Note card */}
      <rect x="122" y="4" width="102" height="50" rx="7" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.10)" strokeWidth="1"/>
      <rect x="122" y="4" width="3"   height="50" rx="1.5" fill="rgba(245,158,11,0.55)"/>
      <rect x="132" y="12" width="54" height="4.5" rx="2.25" fill="rgba(255,255,255,0.22)"/>
      <rect x="132" y="22" width="78" height="2.5" rx="1.25" fill="rgba(255,255,255,0.10)"/>
      <rect x="132" y="28" width="68" height="2.5" rx="1.25" fill="rgba(255,255,255,0.07)"/>
      {/* Source ref badge */}
      <rect x="132" y="38" width="58" height="10" rx="5" fill="rgba(245,158,11,0.11)" stroke="rgba(245,158,11,0.22)" strokeWidth="1"/>
      <rect x="140" y="42" width="38" height="2.5" rx="1.25" fill="rgba(245,158,11,0.38)"/>
    </svg>
  );
}

function PreviewConnections(): React.ReactElement {
  return (
    <svg width="100%" height="56" viewBox="0 0 232 56" preserveAspectRatio="xMidYMid meet">
      {/* Node 1 */}
      <rect x="8"  y="13" width="84" height="32" rx="6" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.10)" strokeWidth="1"/>
      <rect x="8"  y="13" width="3"  height="32" rx="1.5" fill="rgba(99,102,241,0.50)"/>
      <rect x="16" y="20" width="46" height="3.5" rx="1.75" fill="rgba(255,255,255,0.18)"/>
      <rect x="16" y="28" width="34" height="2.5" rx="1.25" fill="rgba(255,255,255,0.08)"/>
      <rect x="16" y="34" width="40" height="2.5" rx="1.25" fill="rgba(255,255,255,0.05)"/>
      {/* Curved amber thread */}
      <path d="M 92 29 C 112 14,120 44,140 29"
        stroke="rgba(245,158,11,0.65)" strokeWidth="1.5" strokeDasharray="4 5" fill="none"/>
      {/* Thread endpoint dots */}
      <circle cx="92"  cy="29" r="3.5" fill="rgba(245,158,11,0.18)" stroke="rgba(245,158,11,0.60)" strokeWidth="1"/>
      <circle cx="140" cy="29" r="3.5" fill="rgba(245,158,11,0.18)" stroke="rgba(245,158,11,0.60)" strokeWidth="1"/>
      {/* Node 2 */}
      <rect x="140" y="13" width="84" height="32" rx="6" fill="rgba(255,255,255,0.06)" stroke="rgba(245,158,11,0.17)" strokeWidth="1"/>
      <rect x="140" y="13" width="3"  height="32" rx="1.5" fill="rgba(245,158,11,0.52)"/>
      <rect x="148" y="20" width="52" height="3.5" rx="1.75" fill="rgba(255,255,255,0.18)"/>
      <rect x="148" y="28" width="40" height="2.5" rx="1.25" fill="rgba(255,255,255,0.08)"/>
      <rect x="148" y="34" width="44" height="2.5" rx="1.25" fill="rgba(255,255,255,0.05)"/>
    </svg>
  );
}

function PreviewResume(): React.ReactElement {
  const dotXs = [30, 66, 102, 138, 174, 210];
  const dotYs = [12, 28, 44];
  return (
    <svg width="100%" height="56" viewBox="0 0 232 56" preserveAspectRatio="xMidYMid meet">
      <rect x="0" y="0" width="232" height="56" rx="6" fill="rgba(14,10,6,0.40)"/>
      {dotXs.flatMap(x => dotYs.map(y => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="0.8" fill="rgba(255,255,255,0.07)"/>
      )))}
      {/* Primary card at its last position */}
      <rect x="28" y="6"  width="86" height="44" rx="6" fill="rgba(255,255,255,0.07)" stroke="rgba(255,255,255,0.11)" strokeWidth="1"/>
      <rect x="28" y="6"  width="3"  height="44" rx="1.5" fill="rgba(245,158,11,0.55)"/>
      <rect x="36" y="13" width="50" height="4"   rx="2"    fill="rgba(255,255,255,0.22)"/>
      <rect x="36" y="22" width="62" height="2.5" rx="1.25" fill="rgba(255,255,255,0.10)"/>
      <rect x="36" y="28" width="54" height="2.5" rx="1.25" fill="rgba(255,255,255,0.07)"/>
      <rect x="36" y="38" width="38" height="7"   rx="3.5"  fill="rgba(245,158,11,0.13)" stroke="rgba(245,158,11,0.27)" strokeWidth="1"/>
      {/* Memory pin */}
      <circle cx="124" cy="6"  r="8"   fill="rgba(245,158,11,0.12)"/>
      <circle cx="124" cy="6"  r="4.5" fill="rgba(245,158,11,0.72)"/>
      <circle cx="124" cy="6"  r="2.5" fill="rgba(255,248,235,0.92)"/>
      <circle cx="124" cy="6"  r="10"  fill="none" stroke="rgba(245,158,11,0.22)" strokeWidth="1.5"/>
      {/* "Last saved" label bars */}
      <rect x="136" y="3"  width="60" height="3.5" rx="1.75" fill="rgba(245,158,11,0.28)"/>
      <rect x="136" y="10" width="48" height="2.5" rx="1.25" fill="rgba(255,255,255,0.10)"/>
      {/* Secondary positioned card */}
      <rect x="148" y="26" width="64" height="28" rx="5" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.08)" strokeWidth="1"/>
      <rect x="154" y="32" width="38" height="3"   rx="1.5"  fill="rgba(255,255,255,0.14)"/>
      <rect x="154" y="39" width="48" height="2.5" rx="1.25" fill="rgba(255,255,255,0.07)"/>
    </svg>
  );
}

// ── Feature definitions ───────────────────────────────────────────────────────

const GUIDE_FEATURES: GuideFeature[] = [
  {
    id:       'library',
    label:    'Library',
    target:   '[data-guide-home="workspace-grid"]',
    headline: 'Your library of spaces.',
    body:     'Every subject lives here — each card holds your materials, notes, tasks, and progress. Add a workspace for any course or project.',
    action:   { label: 'Add a workspace' },
    Preview:  PreviewLibrary,
  },
  {
    id:       'workspace',
    label:    'Workspace',
    target:   '[data-guide-home="hero-portal"]',
    headline: 'One workspace, everything connected.',
    body:     'Inside each workspace: a study surface, a free canvas, a focus loop, and a notebook. All your thinking for one subject, in one place.',
    action:   { label: 'Open it' },
    Preview:  PreviewWorkspace,
  },
  {
    id:       'freespace',
    label:    'Free Space Canvas',
    target:   null,
    headline: 'An infinite canvas for thinking.',
    body:     'Inside any workspace, switch to Free Space. Place notes, PDFs, diagrams spatially. Draw connections. Ideas take shape outside of lists.',
    action:   { label: 'Try it' },
    Preview:  PreviewFreeSpace,
  },
  {
    id:       'studyloop',
    label:    'Study Loop',
    target:   null,
    headline: 'Spaced review, automatically surfaced.',
    body:     "Mistakes and weak spots resurface on a quiet schedule. The workspace tracks what you've seen and what needs revisiting.",
    action:   { label: 'See how it works' },
    Preview:  PreviewStudyLoop,
  },
  {
    id:       'notes',
    label:    'Notes & Math Notebook',
    target:   null,
    headline: 'Write. Think. Render.',
    body:     'Notes support plain text and rich math. Type a raw formula — it renders into clean notation. Your thinking, made legible.',
    action:   { label: 'Open notes' },
    Preview:  PreviewNotesMath,
  },
  {
    id:       'sources',
    label:    'Sources & PDFs',
    target:   null,
    headline: 'Your source material, annotated.',
    body:     'Upload PDFs, slides, or paste links. Highlight passages. Connect them to notes and cards on your canvas. Everything cited, nothing lost.',
    action:   { label: 'Add a source' },
    Preview:  PreviewSources,
  },
  {
    id:       'connections',
    label:    'Connections',
    target:   null,
    headline: 'Ideas that know each other.',
    body:     'On the free canvas, draw connections between any two objects — a note and a PDF, a mistake and a formula. Relationships become visible.',
    action:   { label: 'Explore canvas' },
    Preview:  PreviewConnections,
  },
  {
    id:       'resume',
    label:    'Resume where you stopped',
    target:   '[data-guide-home="hero-portal"]',
    headline: 'Your workspace remembers.',
    body:     'Every position, connection, and note is held exactly as you left it. The most recent space stays front and center on this screen.',
    action:   { label: 'Open it' },
    Preview:  PreviewResume,
  },
];

// ── Types ─────────────────────────────────────────────────────────────────────

interface SpotlightRect {
  top:     number;
  left:    number;
  width:   number;
  height:  number;
  centerX: number;
  centerY: number;
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16) || 245,
    parseInt(h.slice(2, 4), 16) || 158,
    parseInt(h.slice(4, 6), 16) || 11,
  ];
}

// ── Target radiance ───────────────────────────────────────────────────────────

const GLOW_PAD = 36;

function TargetRadiance({ spotlightRect, accent }: {
  spotlightRect: SpotlightRect | null;
  accent: string;
}) {
  if (!spotlightRect) return null;
  const [r, g, b] = hexToRgb(accent);
  return (
    <div
      aria-hidden
      style={{
        position:      'fixed',
        zIndex:        991,
        pointerEvents: 'none',
        top:           spotlightRect.top    - GLOW_PAD,
        left:          spotlightRect.left   - GLOW_PAD,
        width:         spotlightRect.width  + GLOW_PAD * 2,
        height:        spotlightRect.height + GLOW_PAD * 2,
        borderRadius:  24,
        background:    `radial-gradient(ellipse at center, rgba(${r},${g},${b},0.07) 0%, transparent 68%)`,
        filter:        'blur(2px)',
        mixBlendMode:  'screen',
      }}
    />
  );
}

// ── Atmospheric smear ─────────────────────────────────────────────────────────

function AtmosphericSmear({ bubbleRect, spotlightRect, accent }: {
  bubbleRect:    DOMRect | null;
  spotlightRect: SpotlightRect | null;
  accent:        string;
}) {
  if (!bubbleRect || !spotlightRect) return null;
  const bx = bubbleRect.left + bubbleRect.width  / 2;
  const by = bubbleRect.top  + bubbleRect.height / 2;
  const tx = spotlightRect.centerX;
  const ty = spotlightRect.centerY;
  const distance = Math.hypot(tx - bx, ty - by);
  if (distance < 60) return null;
  const angle  = Math.atan2(ty - by, tx - bx) * (180 / Math.PI);
  const smearW = distance * 0.65;
  const smearH = 72;
  const cx = (bx + tx) / 2;
  const cy = (by + ty) / 2;
  const [r, g, b] = hexToRgb(accent);
  return (
    <div
      aria-hidden
      style={{
        position:      'fixed',
        zIndex:        991,
        pointerEvents: 'none',
        width:         smearW,
        height:        smearH,
        left:          cx - smearW / 2,
        top:           cy - smearH / 2,
        transform:     `rotate(${angle}deg)`,
        background:    `radial-gradient(ellipse 55% 38% at 50% 50%, rgba(${r},${g},${b},0.09) 0%, transparent 100%)`,
        filter:        'blur(28px)',
        mixBlendMode:  'screen',
      }}
    />
  );
}

// ── Companion figure ──────────────────────────────────────────────────────────

function CompanionFigure({ accent, blink, eyeDir }: {
  accent: string;
  blink:  boolean;
  eyeDir: { x: number; y: number };
}) {
  const [r, g, b] = hexToRgb(accent);
  const ex = eyeDir.x * 1.5;
  const ey = eyeDir.y * 1.5;
  return (
    <div style={{
      position: 'relative', width: 52, height: 58,
      flexShrink: 0, alignSelf: 'flex-end', marginBottom: 6,
      animation: 'hg-companion-in 0.5s 0.08s cubic-bezier(0.16,1,0.3,1) both',
    }}>
      <div aria-hidden style={{
        position: 'absolute', bottom: 1, left: '50%', transform: 'translateX(-50%)',
        width: 28, height: 7, borderRadius: '50%',
        background: `rgba(${r},${g},${b},0.20)`, filter: 'blur(5px)',
      }}/>
      <svg width="52" height="52" viewBox="0 0 52 52"
        style={{ display: 'block', overflow: 'visible', animation: 'hg-breathe 4s ease-in-out infinite' }}
        aria-hidden>
        <defs>
          <radialGradient id="hg-body-grad" cx="40%" cy="36%" r="58%">
            <stop offset="0%"   stopColor={`rgb(${r},${g},${b})`}/>
            <stop offset="52%"  stopColor={`rgba(${Math.round(r*.70)},${Math.round(g*.52)},0,0.85)`}/>
            <stop offset="100%" stopColor={`rgba(${Math.round(r*.38)},${Math.round(g*.25)},0,0.28)`}/>
          </radialGradient>
          <radialGradient id="hg-aura-grad" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor={`rgba(${r},${g},${b},0.15)`}/>
            <stop offset="100%" stopColor="transparent"/>
          </radialGradient>
          <filter id="hg-aura-blur-f">
            <feGaussianBlur stdDeviation="5.5"/>
          </filter>
        </defs>
        <ellipse cx="26" cy="27" rx="24" ry="23" fill="url(#hg-aura-grad)" filter="url(#hg-aura-blur-f)"/>
        <ellipse cx="26" cy="28" rx="17" ry="18" fill="url(#hg-body-grad)"/>
        <ellipse cx="20" cy="21" rx="5" ry="3.2" fill="rgba(255,248,235,0.17)" transform="rotate(-18 20 21)"/>
        <ellipse cx={19+ex} cy={27+ey} rx="2.4" ry={blink ? 0.25 : 3} fill="rgba(14,10,6,0.88)"/>
        <ellipse cx={33+ex} cy={27+ey} rx="2.4" ry={blink ? 0.25 : 3} fill="rgba(14,10,6,0.88)"/>
        {!blink && (<>
          <circle cx={20+ex} cy={26+ey} r="0.75" fill="rgba(255,248,235,0.50)"/>
          <circle cx={34+ex} cy={26+ey} r="0.75" fill="rgba(255,248,235,0.50)"/>
        </>)}
      </svg>
    </div>
  );
}

// ── Feature menu panel ────────────────────────────────────────────────────────

function FeatureMenu({ accent, onSelect, onClose, panelRef }: {
  accent:   string;
  onSelect: (id: string) => void;
  onClose:  () => void;
  panelRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [r, g, b] = hexToRgb(accent);

  return (
    <div
      ref={panelRef}
      style={{
        background:          'rgba(14,10,6,0.88)',
        backdropFilter:      'blur(24px)',
        WebkitBackdropFilter:'blur(24px)',
        borderLeft:          `2px solid rgba(${r},${g},${b},0.32)`,
        borderRadius:        '0 14px 14px 0',
        padding:             '16px 16px 16px 18px',
        width:               274,
        animation:           'hg-bubble-in 0.5s cubic-bezier(0.16,1,0.3,1) both',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 13 }}>
        <span style={{
          fontSize: 9.5, fontWeight: 700,
          letterSpacing: '0.18em', textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.28)',
        }}>
          Explore your workspace
        </span>
        <button
          onClick={onClose}
          aria-label="Close guide"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,248,235,0.20)', fontSize: 16, lineHeight: 1, padding: '0 2px', transition: 'color 0.15s' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,248,235,0.50)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,248,235,0.20)'; }}
        >×</button>
      </div>

      {/* 2-column feature chip grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {GUIDE_FEATURES.map(f => {
          const hot = hoveredId === f.id;
          return (
            <button
              key={f.id}
              onClick={() => onSelect(f.id)}
              onMouseEnter={() => setHoveredId(f.id)}
              onMouseLeave={() => setHoveredId(null)}
              style={{
                background:  hot ? `rgba(${r},${g},${b},0.10)` : 'rgba(255,255,255,0.04)',
                border:      hot ? `1px solid rgba(${r},${g},${b},0.38)` : '1px solid rgba(255,255,255,0.08)',
                borderRadius: 7,
                padding:      '7px 10px',
                cursor:       'pointer',
                textAlign:    'left',
                transition:   'background 0.18s ease, border-color 0.18s ease, color 0.18s ease',
                color:        hot ? `rgba(${r},${g},${b},0.90)` : 'rgba(255,248,235,0.52)',
                fontSize:     11.5,
                fontWeight:   hot ? 500 : 400,
                lineHeight:   1.3,
              }}
            >
              {f.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Feature detail bubble ─────────────────────────────────────────────────────

function FeatureBubble({ feature, accent, onBack, onClose, onAction, panelRef }: {
  feature:  GuideFeature;
  accent:   string;
  onBack:   () => void;
  onClose:  () => void;
  onAction: () => void;
  panelRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [r, g, b] = hexToRgb(accent);
  const { Preview } = feature;

  return (
    <div
      ref={panelRef}
      style={{
        background:          'rgba(14,10,6,0.88)',
        backdropFilter:      'blur(24px)',
        WebkitBackdropFilter:'blur(24px)',
        borderLeft:          `2px solid rgba(${r},${g},${b},0.50)`,
        borderRadius:        '0 14px 14px 0',
        padding:             '16px 16px 14px 18px',
        width:               274,
        animation:           'hg-bubble-in 0.5s cubic-bezier(0.16,1,0.3,1) both',
      }}
    >
      {/* Feature label + close */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{
          fontSize: 9, fontWeight: 800,
          letterSpacing: '0.20em', textTransform: 'uppercase',
          color: `rgba(${r},${g},${b},0.75)`,
        }}>
          {feature.label}
        </span>
        <button
          onClick={onClose}
          aria-label="Close guide"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,248,235,0.20)', fontSize: 16, lineHeight: 1, padding: '0 2px', transition: 'color 0.15s' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,248,235,0.50)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,248,235,0.20)'; }}
        >×</button>
      </div>

      {/* Headline */}
      <h3 style={{
        fontFamily: 'Georgia, serif', fontStyle: 'italic', fontWeight: 400,
        fontSize: 16, color: 'rgba(255,248,235,0.90)',
        margin: '0 0 7px', lineHeight: 1.35,
      }}>
        {feature.headline}
      </h3>

      {/* Body */}
      <p style={{
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
        fontSize: 12, lineHeight: 1.62,
        color: 'rgba(255,248,235,0.40)',
        margin: '0 0 10px',
      }}>
        {feature.body}
      </p>

      {/* Micro-preview */}
      <div style={{
        borderRadius: 8, overflow: 'hidden',
        background:   'rgba(255,255,255,0.025)',
        border:       '1px solid rgba(255,255,255,0.06)',
        padding:      '8px 6px',
        marginBottom: 12,
      }}>
        <Preview />
      </div>

      {/* Navigation */}
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <button
          onClick={onBack}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,248,235,0.24)', fontSize: 11.5, padding: 0, transition: 'color 0.15s' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,248,235,0.55)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,248,235,0.24)'; }}
        >← All features</button>
        <button
          onClick={onAction}
          style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: `rgba(${r},${g},${b},0.85)`, fontSize: 12, fontWeight: 500, transition: 'color 0.15s' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#fbbf24'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = `rgba(${r},${g},${b},0.85)`; }}
        >
          {feature.action.label} →
        </button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export interface HomeGuideCompanionProps {
  isOpen:  boolean;
  onClose: () => void;
  accent:  string;
}

export function HomeGuideCompanion({ isOpen, onClose, accent }: HomeGuideCompanionProps) {
  const [mode,          setMode]          = useState<'menu' | 'detail'>('menu');
  const [selectedId,    setSelectedId]    = useState<string | null>(null);
  const [spotlightRect, setSpotlightRect] = useState<SpotlightRect | null>(null);
  const [narratorZone,  setNarratorZone]  = useState<'top' | 'bottom'>('bottom');
  const [bubbleDomRect, setBubbleDomRect] = useState<DOMRect | null>(null);
  const [eyeDir,        setEyeDir]        = useState({ x: 0.6, y: 0 });
  const [blink,         setBlink]         = useState(false);

  const panelRef     = useRef<HTMLDivElement | null>(null);
  const prevOpenRef  = useRef(false);
  const blinkTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedFeature = selectedId
    ? GUIDE_FEATURES.find(f => f.id === selectedId) ?? null
    : null;

  // Reset on open
  useEffect(() => {
    if (isOpen && !prevOpenRef.current) {
      setMode('menu');
      setSelectedId(null);
      setSpotlightRect(null);
      setNarratorZone('bottom');
      setEyeDir({ x: 0.6, y: 0 });
    }
    prevOpenRef.current = isOpen;
  }, [isOpen]);

  // Blink cycle
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    const scheduleBlink = () => {
      if (cancelled) return;
      blinkTimeout.current = setTimeout(() => {
        if (cancelled) return;
        setBlink(true);
        setTimeout(() => { if (!cancelled) { setBlink(false); scheduleBlink(); } }, 120);
      }, 3500 + Math.random() * 2500);
    };
    scheduleBlink();
    return () => { cancelled = true; if (blinkTimeout.current) clearTimeout(blinkTimeout.current); };
  }, [isOpen]);

  // Measure target + zone + eye direction
  const measureTarget = useCallback(() => {
    const target = mode === 'detail' ? (selectedFeature?.target ?? null) : null;
    if (!target) {
      setSpotlightRect(null);
      if (mode === 'menu') setEyeDir({ x: 0.6, y: 0 });
      return;
    }
    const el = document.querySelector(target);
    if (!el) { setSpotlightRect(null); return; }
    const rect    = el.getBoundingClientRect();
    const centerX = rect.left + rect.width  / 2;
    const centerY = rect.top  + rect.height / 2;
    setSpotlightRect({ top: rect.top, left: rect.left, width: rect.width, height: rect.height, centerX, centerY });
    setNarratorZone(centerY > window.innerHeight / 2 ? 'top' : 'bottom');
    const companionX = 34;
    const companionY = narratorZone === 'bottom'
      ? window.innerHeight * 0.65 + 30
      : window.innerHeight * 0.18 + 30;
    const dx = centerX - companionX;
    const dy = centerY - companionY;
    const mag = Math.hypot(dx, dy) || 1;
    setEyeDir({
      x: Math.sign(dx) * Math.min(Math.abs(dx / mag), 1.0),
      y: Math.sign(dy) * Math.min(Math.abs(dy / mag), 0.5),
    });
  }, [mode, selectedFeature?.target, narratorZone]);

  useEffect(() => {
    if (!isOpen) return;
    measureTarget();
    window.addEventListener('resize', measureTarget);
    return () => window.removeEventListener('resize', measureTarget);
  }, [isOpen, measureTarget]);

  // Track panel DOM rect for smear
  useEffect(() => {
    if (!isOpen) return;
    const el = panelRef.current;
    if (!el) return;
    const update = () => setBubbleDomRect(el.getBoundingClientRect());
    update();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [isOpen, mode, selectedId]);

  const handleSelect  = (id: string) => { setSelectedId(id); setMode('detail'); setSpotlightRect(null); };
  const handleBack    = () => { setMode('menu'); setSelectedId(null); setSpotlightRect(null); setEyeDir({ x: 0.6, y: 0 }); };

  const narratorTop = mode === 'menu'
    ? 'calc(65vh)'
    : narratorZone === 'bottom' ? 'calc(65vh)' : 'calc(18vh)';

  return (
    <>
      <style>{HOME_GUIDE_KEYFRAMES}</style>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div onClick={onClose} aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 990, background: 'rgba(14,10,6,0.10)' }}/>

          <TargetRadiance spotlightRect={spotlightRect} accent={accent}/>
          <AtmosphericSmear bubbleRect={bubbleDomRect} spotlightRect={spotlightRect} accent={accent}/>

          {/* Zone container */}
          <div style={{
            position: 'fixed', top: narratorTop, left: 8, zIndex: 995,
            display: 'flex', alignItems: 'flex-end', gap: 8,
            transition: 'top 0.7s cubic-bezier(0.16,1,0.3,1)',
          }}>
            <CompanionFigure accent={accent} blink={blink} eyeDir={eyeDir}/>

            {mode === 'menu' && (
              <FeatureMenu
                key="menu"
                accent={accent}
                onSelect={handleSelect}
                onClose={onClose}
                panelRef={panelRef}
              />
            )}

            {mode === 'detail' && selectedFeature && (
              <FeatureBubble
                key={selectedFeature.id}
                feature={selectedFeature}
                accent={accent}
                onBack={handleBack}
                onClose={onClose}
                onAction={onClose}
                panelRef={panelRef}
              />
            )}
          </div>
        </>
      )}
    </>
  );
}

// ── Trigger button ────────────────────────────────────────────────────────────

export function HomeGuideTrigger({ onClick, accent }: {
  onClick: () => void;
  accent:  string;
}) {
  const [hovered,        setHovered]        = useState(false);
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const tooltipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [r, g, b]    = hexToRgb(accent);

  const handleEnter = () => {
    setHovered(true);
    tooltipTimer.current = setTimeout(() => setTooltipVisible(true), 380);
  };
  const handleLeave = () => {
    setHovered(false);
    setTooltipVisible(false);
    if (tooltipTimer.current) clearTimeout(tooltipTimer.current);
  };

  return (
    <div style={{
      position: 'relative', flexShrink: 0, display: 'inline-flex',
      borderRadius: '50%',
      animation: hovered ? 'none' : 'hg-trig-pulse 4s ease-in-out infinite',
    }}>
      <span aria-hidden style={{
        position: 'absolute', bottom: 'calc(100% + 8px)', left: '50%',
        transform: 'translateX(-50%)', whiteSpace: 'nowrap',
        fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: 10,
        letterSpacing: '0.04em', color: accent, pointerEvents: 'none',
        opacity: tooltipVisible ? 1 : 0, transition: 'opacity 0.25s ease',
      }}>
        Guide me
      </span>

      <button
        onClick={onClick}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        aria-label="Open workspace guide"
        style={{
          position: 'relative', borderRadius: '50%', width: 30, height: 30,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', flexShrink: 0,
          background:  hovered ? `rgba(${r},${g},${b},0.18)` : `rgba(${r},${g},${b},0.13)`,
          border:      hovered ? `1px solid rgba(${r},${g},${b},0.72)` : `1px solid rgba(${r},${g},${b},0.50)`,
          boxShadow:   hovered ? `0 0 22px rgba(${r},${g},${b},0.22), 0 2px 10px rgba(0,0,0,0.22)` : 'none',
          transition:  'background 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease',
        }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" style={{ display: 'block', overflow: 'visible' }} aria-hidden>
          <defs>
            <radialGradient id="hg-trig-body" cx="40%" cy="36%" r="60%">
              <stop offset="0%"   stopColor={`rgb(${r},${g},${b})`} stopOpacity={hovered ? 1 : 0.85}/>
              <stop offset="60%"  stopColor={`rgba(${Math.round(r*.70)},${Math.round(g*.52)},0,0.75)`}/>
              <stop offset="100%" stopColor={`rgba(${Math.round(r*.38)},${Math.round(g*.25)},0,0.20)`}/>
            </radialGradient>
            <radialGradient id="hg-trig-aura" cx="50%" cy="50%" r="50%">
              <stop offset="0%"   stopColor={`rgba(${r},${g},${b},${hovered ? 0.22 : 0.12})`}/>
              <stop offset="100%" stopColor="transparent"/>
            </radialGradient>
            <filter id="hg-trig-blur">
              <feGaussianBlur stdDeviation="2"/>
            </filter>
          </defs>
          <circle cx="8" cy="8"   r="8" fill="url(#hg-trig-aura)" filter="url(#hg-trig-blur)"/>
          <circle cx="8" cy="8.5" r="6" fill="url(#hg-trig-body)"/>
          <ellipse cx="6" cy="6.5" rx="1.8" ry="1.1" fill="rgba(255,248,235,0.22)" transform="rotate(-15 6 6.5)"/>
          <circle cx="6.2" cy="8.8" r="1.05" fill="rgba(14,10,6,0.85)"/>
          <circle cx="9.8" cy="8.8" r="1.05" fill="rgba(14,10,6,0.85)"/>
          {hovered && (<>
            <circle cx="6.6"  cy="8.4" r="0.38" fill="rgba(255,248,235,0.55)"/>
            <circle cx="10.2" cy="8.4" r="0.38" fill="rgba(255,248,235,0.55)"/>
          </>)}
        </svg>
      </button>
    </div>
  );
}
