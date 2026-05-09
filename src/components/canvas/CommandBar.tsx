/**
 * CommandBar — main navigation bar.
 *
 * UX Hierarchy (left→right, primary→secondary):
 *   Logo  |  + Add  |  Customize ▾  |  ?  |  Schedule  |  Sign out
 *
 * "Customize" collapses three previously top-level controls:
 *   - Atmosphere (theme)
 *   - Layout mode (Guided Layout / Free Space)
 *   - Edit layout toggle
 *
 * This keeps the default nav calm and focused on the ONE primary action: Add.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AtmosphereTokens, ATMOSPHERES } from '../../hooks/useAtmosphere';
import {
  BookOpenCheck, Plus, ChevronDown, LogOut,
  LayoutDashboard, Move, Sliders, Settings2,
} from 'lucide-react';
import type { CanvasMode } from '../../hooks/useCanvasMode';

interface Props {
  tokens:           AtmosphereTokens;
  atmosphereId:     string;
  designMode:       boolean;
  canvasMode:       CanvasMode;
  userName:         string;
  onToggleDesign:   () => void;
  onToggleCanvas:   () => void;
  onOpenAdd:        () => void;
  onSetAtmosphere:  (id: string) => void;
  onSignOut:        () => void;
}

// ── Shared style helpers ──────────────────────────────────────────────────────

const navBtn = (
  tokens: AtmosphereTokens,
  active = false,
): React.CSSProperties => ({
  display:         'flex',
  alignItems:      'center',
  gap:             '5px',
  padding:         '5px 9px',
  borderRadius:    '8px',
  fontSize:        '12px',
  fontWeight:      500,
  cursor:          'pointer',
  border:          active ? `1px solid ${tokens.accent}35` : '1px solid transparent',
  backgroundColor: active ? tokens.accentSubtle : 'transparent',
  color:           active ? tokens.accent : tokens.textSecondary,
  transition:      'all 0.15s ease',
  whiteSpace:      'nowrap' as const,
});

// ── Sub-components ────────────────────────────────────────────────────────────

function Divider({ tokens }: { tokens: AtmosphereTokens }) {
  return (
    <div
      style={{ width: '1px', height: '14px', backgroundColor: tokens.divider, margin: '0 3px', flexShrink: 0 }}
    />
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function CommandBar({
  tokens, atmosphereId, designMode, canvasMode, userName,
  onToggleDesign, onToggleCanvas, onOpenAdd, onSetAtmosphere, onSignOut,
}: Props) {
  const [customizeOpen, setCustomizeOpen] = useState(false);

  return (
    <header
      className="sticky top-0 z-50 w-full"
      style={{
        backgroundColor: tokens.navBg,
        borderBottom:    `1px solid ${tokens.cardBorder}`,
        backdropFilter:  `blur(${Math.max(tokens.blur, 20)}px) saturate(1.4)`,
        WebkitBackdropFilter: `blur(${Math.max(tokens.blur, 20)}px) saturate(1.4)`,
        transition:      'background-color 0.35s ease, border-color 0.35s ease',
      }}
    >
      <div
        className="flex items-center justify-between"
        style={{ height: '48px', padding: '0 20px' }}
      >

        {/* ── Left: Logo ────────────────────────────────────────── */}
        <div className="flex items-center gap-2.5" style={{ flexShrink: 0 }}>
          <Link
            to="/dashboard"
            className="flex items-center gap-2.5"
            style={{ textDecoration: 'none' }}
          >
            <div style={{
              width:           '26px',
              height:          '26px',
              borderRadius:    '7px',
              backgroundColor: tokens.accent,
              display:         'flex',
              alignItems:      'center',
              justifyContent:  'center',
              flexShrink:      0,
            }}>
              <BookOpenCheck style={{ width: '14px', height: '14px', color: '#000' }} strokeWidth={2.5} />
            </div>
            <span
              style={{
                fontFamily:    "'Plus Jakarta Sans', sans-serif",
                fontSize:      '13px',
                fontWeight:    600,
                color:         tokens.textSecondary,
                maxWidth:      '140px',
                overflow:      'hidden',
                textOverflow:  'ellipsis',
                whiteSpace:    'nowrap',
              }}
            >
              {userName ? `${userName}'s space` : 'My space'}
            </span>
          </Link>
        </div>

        {/* ── Right: Controls ───────────────────────────────────── */}
        <div className="flex items-center" style={{ gap: '2px' }}>

          {/* Mode toggle — Space (primary) / Organize view (secondary) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1px' }}>
            {([
              // Space is first — it's the product
              { mode: 'freeform', icon: Move,            title: 'Space' },
              // Organize view is secondary — a tool, not the destination
              { mode: 'grid',     icon: LayoutDashboard, title: 'Organize view' },
            ] as const).map(({ mode, icon: Icon, title }) => {
              const isActive  = canvasMode === mode;
              const isPrimary = mode === 'freeform';
              return (
                <button
                  key={mode}
                  onClick={() => { if (!isActive) onToggleCanvas(); }}
                  title={title}
                  style={{
                    width:           '30px',
                    height:          '30px',
                    display:         'flex',
                    alignItems:      'center',
                    justifyContent:  'center',
                    borderRadius:    '8px',
                    // Active Space = accent. Active Organize = muted (it's secondary).
                    border:          isActive
                      ? isPrimary
                        ? `1px solid ${tokens.accent}30`
                        : `1px solid ${tokens.cardBorder}`
                      : '1px solid transparent',
                    backgroundColor: isActive
                      ? isPrimary ? tokens.accentSubtle : tokens.cardBorder
                      : 'transparent',
                    color:           isActive
                      ? isPrimary ? tokens.accent : tokens.textMuted
                      : tokens.textGhost,
                    cursor:          isActive ? 'default' : 'pointer',
                    transition:      'all 0.15s ease',
                    opacity:         !isActive && !isPrimary ? 0.6 : 1,
                  }}
                  onMouseEnter={e => { if (!isActive) Object.assign((e.currentTarget as HTMLElement).style, { backgroundColor: tokens.cardBorder, color: tokens.textSecondary, opacity: '1' }); }}
                  onMouseLeave={e => { if (!isActive) Object.assign((e.currentTarget as HTMLElement).style, { backgroundColor: 'transparent', color: tokens.textGhost, opacity: (!isPrimary ? '0.6' : '1') }); }}
                >
                  <Icon style={{ width: '13px', height: '13px' }} />
                </button>
              );
            })}
          </div>

          <Divider tokens={tokens} />

          {/* PRIMARY: Add to space */}
          <button
            onClick={onOpenAdd}
            title="Add to your space  ⌘K"
            style={{
              ...navBtn(tokens),
              backgroundColor: tokens.accentSubtle,
              color:           tokens.accent,
              border:          `1px solid ${tokens.accent}30`,
              fontWeight:      600,
            }}
            onMouseEnter={e => {
              Object.assign((e.currentTarget as HTMLButtonElement).style, {
                backgroundColor: `${tokens.accent}25`,
                borderColor:     `${tokens.accent}50`,
              });
            }}
            onMouseLeave={e => {
              Object.assign((e.currentTarget as HTMLButtonElement).style, {
                backgroundColor: tokens.accentSubtle,
                borderColor:     `${tokens.accent}30`,
              });
            }}
          >
            <Plus style={{ width: '13px', height: '13px' }} strokeWidth={2.5} />
            <span className="hidden sm:inline">Add</span>
          </button>

          <Divider tokens={tokens} />

          {/* CUSTOMIZE dropdown — atmosphere + edit layout only */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setCustomizeOpen(o => !o)}
              title="Atmosphere"
              style={{
                ...navBtn(tokens, customizeOpen || designMode),
                ...(customizeOpen ? {
                  backgroundColor: tokens.accentSubtle,
                  color:           tokens.accent,
                  borderColor:     `${tokens.accent}35`,
                } : {}),
              }}
              onMouseEnter={e => {
                if (!customizeOpen) Object.assign((e.currentTarget as HTMLButtonElement).style, {
                  backgroundColor: tokens.cardBorder,
                  color:           tokens.textSecondary,
                  borderColor:     tokens.cardBorder,
                });
              }}
              onMouseLeave={e => {
                if (!customizeOpen) Object.assign((e.currentTarget as HTMLButtonElement).style, {
                  backgroundColor: 'transparent',
                  color:           tokens.textSecondary,
                  borderColor:     'transparent',
                });
              }}
            >
              <Settings2 style={{ width: '12px', height: '12px' }} />
              <ChevronDown style={{
                width:      '11px',
                height:     '11px',
                transition: 'transform 0.2s ease',
                transform:  customizeOpen ? 'rotate(180deg)' : 'none',
              }} />
            </button>

            {customizeOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setCustomizeOpen(false)} />
                <div
                  className="absolute right-0 top-full z-50"
                  style={{
                    marginTop:       '8px',
                    width:           '260px',
                    backgroundColor: tokens.cardBg,
                    border:          `1px solid ${tokens.cardBorder}`,
                    borderRadius:    `${Math.min(tokens.radius, 18)}px`,
                    boxShadow:       tokens.shadowLg,
                    backdropFilter:  'blur(24px)',
                    WebkitBackdropFilter: 'blur(24px)',
                    overflow:        'hidden',
                  }}
                >
                  {/* ── Atmosphere ────────────────────────────────── */}
                  <div style={{ padding: '10px 14px 8px', borderBottom: `1px solid ${tokens.divider}` }}>
                    <p style={{
                      fontFamily:    "'Space Grotesk', sans-serif",
                      fontSize:      '9px',
                      fontWeight:    700,
                      letterSpacing: '0.14em',
                      textTransform: 'uppercase',
                      color:         tokens.textGhost,
                      margin:        '0 0 7px',
                    }}>
                      Atmosphere
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                      {ATMOSPHERES.map(atm => {
                        const isActive = atm.id === atmosphereId;
                        return (
                          <button
                            key={atm.id}
                            onClick={() => { onSetAtmosphere(atm.id); }}
                            style={{
                              display:         'flex',
                              alignItems:      'center',
                              gap:             '7px',
                              padding:         '6px 8px',
                              borderRadius:    '8px',
                              border:          `1px solid ${isActive ? tokens.accent + '35' : 'transparent'}`,
                              backgroundColor: isActive ? tokens.accentSubtle : 'transparent',
                              cursor:          'pointer',
                              textAlign:       'left' as const,
                              transition:      'all 0.1s ease',
                            }}
                            onMouseEnter={e => { if (!isActive) Object.assign((e.currentTarget as HTMLElement).style, { backgroundColor: tokens.cardBorder }); }}
                            onMouseLeave={e => { if (!isActive) Object.assign((e.currentTarget as HTMLElement).style, { backgroundColor: 'transparent' }); }}
                          >
                            <span style={{ fontSize: '13px', lineHeight: 1, flexShrink: 0 }}>{atm.emoji}</span>
                            <p style={{ fontSize: '11px', fontWeight: 600, color: isActive ? tokens.accent : tokens.textPrimary, margin: 0, flex: 1 }}>
                              {atm.name}
                            </p>
                            {isActive && (
                              <div style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: tokens.accent, flexShrink: 0 }} />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* ── Edit layout ───────────────────────────────── */}
                  <div style={{ padding: '8px 14px 10px' }}>
                    <button
                      onClick={() => { onToggleDesign(); setCustomizeOpen(false); }}
                      style={{
                        width:           '100%',
                        display:         'flex',
                        alignItems:      'center',
                        gap:             '7px',
                        padding:         '7px 10px',
                        borderRadius:    '8px',
                        border:          `1px solid ${designMode ? tokens.accent + '40' : tokens.cardBorder}`,
                        backgroundColor: designMode ? tokens.accentSubtle : 'transparent',
                        cursor:          'pointer',
                        textAlign:       'left' as const,
                        transition:      'all 0.12s ease',
                      }}
                      onMouseEnter={e => { if (!designMode) Object.assign((e.currentTarget as HTMLElement).style, { backgroundColor: tokens.cardBorder }); }}
                      onMouseLeave={e => { if (!designMode) Object.assign((e.currentTarget as HTMLElement).style, { backgroundColor: 'transparent' }); }}
                    >
                      <Sliders style={{ width: '11px', height: '11px', color: designMode ? tokens.accent : tokens.textSecondary }} />
                      <span style={{ fontSize: '11px', fontWeight: 600, color: designMode ? tokens.accent : tokens.textPrimary }}>
                        {designMode ? 'Done editing' : 'Edit layout'}
                      </span>
                      {designMode && (
                        <div style={{ marginLeft: 'auto', width: '6px', height: '6px', borderRadius: '50%', backgroundColor: tokens.accent }} />
                      )}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          <Divider tokens={tokens} />

          {/* Schedule link */}
          <Link
            to="/schedule"
            className="hidden md:flex items-center"
            style={navBtn(tokens)}
            onMouseEnter={e => Object.assign((e.currentTarget as HTMLElement).style, { backgroundColor: tokens.cardBorder, color: tokens.textSecondary, borderColor: tokens.cardBorder })}
            onMouseLeave={e => Object.assign((e.currentTarget as HTMLElement).style, { backgroundColor: 'transparent', color: tokens.textSecondary, borderColor: 'transparent' })}
          >
            Schedule
          </Link>

          {/* Sign out */}
          <button
            onClick={onSignOut}
            title="Sign out"
            style={{ ...navBtn(tokens), padding: '5px 7px' }}
            onMouseEnter={e => Object.assign((e.currentTarget as HTMLButtonElement).style, { backgroundColor: tokens.cardBorder, color: tokens.textSecondary, borderColor: tokens.cardBorder })}
            onMouseLeave={e => Object.assign((e.currentTarget as HTMLButtonElement).style, { backgroundColor: 'transparent', color: tokens.textSecondary, borderColor: 'transparent' })}
          >
            <LogOut style={{ width: '13px', height: '13px' }} />
          </button>
        </div>
      </div>
    </header>
  );
}
