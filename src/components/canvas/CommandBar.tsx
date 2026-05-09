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
  LayoutDashboard, Move, Sliders, Settings2, X,
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
            className="flex items-center gap-2"
            style={{ textDecoration: 'none' }}
          >
            <div style={{
              width:           '26px',
              height:          '26px',
              borderRadius:    '7px',
              backgroundColor: tokens.accent,
              boxShadow:       `0 0 12px ${tokens.accentGlow}`,
              display:         'flex',
              alignItems:      'center',
              justifyContent:  'center',
              flexShrink:      0,
            }}>
              <BookOpenCheck style={{ width: '14px', height: '14px', color: '#000' }} strokeWidth={2.5} />
            </div>
            <span
              className="hidden sm:block"
              style={{
                fontFamily:    "'Plus Jakarta Sans', sans-serif",
                fontSize:      '14px',
                fontWeight:    700,
                letterSpacing: '-0.02em',
                color:         tokens.textPrimary,
              }}
            >
              Focus
            </span>
          </Link>

          <span style={{
            color:      tokens.cardBorderHover,
            fontSize:   '16px',
            fontWeight: 200,
            lineHeight: 1,
            userSelect: 'none',
          }}>
            /
          </span>

          <span style={{
            fontSize:     '13px',
            fontWeight:   500,
            color:        tokens.textSecondary,
            maxWidth:     '160px',
            overflow:     'hidden',
            textOverflow: 'ellipsis',
            whiteSpace:   'nowrap',
          }}>
            {userName ? `${userName}'s workspace` : 'My workspace'}
          </span>
        </div>

        {/* ── Right: Controls ───────────────────────────────────── */}
        <div className="flex items-center" style={{ gap: '2px' }}>

          {/* PRIMARY: Add to workspace */}
          <button
            onClick={onOpenAdd}
            title="Add to workspace  ⌘K"
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
            <span>Add</span>
          </button>

          <Divider tokens={tokens} />

          {/* CUSTOMIZE dropdown — theme + mode + edit */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setCustomizeOpen(o => !o)}
              title="Customize workspace"
              style={{
                ...navBtn(tokens, customizeOpen || designMode || canvasMode === 'freeform'),
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
              <span className="hidden sm:inline">Customize</span>
              <ChevronDown style={{
                width:     '11px',
                height:    '11px',
                transition: 'transform 0.2s ease',
                transform: customizeOpen ? 'rotate(180deg)' : 'none',
              }} />
            </button>

            {customizeOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setCustomizeOpen(false)} />
                <div
                  className="absolute right-0 top-full z-50"
                  style={{
                    marginTop:       '8px',
                    width:           '280px',
                    backgroundColor: tokens.cardBg,
                    border:          `1px solid ${tokens.cardBorder}`,
                    borderRadius:    `${Math.min(tokens.radius, 18)}px`,
                    boxShadow:       tokens.shadowLg,
                    backdropFilter:  'blur(24px)',
                    WebkitBackdropFilter: 'blur(24px)',
                    overflow:        'hidden',
                  }}
                >

                  {/* ── Section: Layout mode ──────────────────────── */}
                  <div style={{ padding: '10px 14px 8px', borderBottom: `1px solid ${tokens.divider}` }}>
                    <p style={{
                      fontFamily:    "'Space Grotesk', sans-serif",
                      fontSize:      '9px',
                      fontWeight:    700,
                      letterSpacing: '0.14em',
                      textTransform: 'uppercase',
                      color:         tokens.textGhost,
                      margin:        '0 0 8px',
                    }}>
                      Layout
                    </p>

                    {/* Mode toggle */}
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {([
                        { mode: 'grid',     label: 'Guided Layout', icon: LayoutDashboard, tip: 'Organized daily workflow' },
                        { mode: 'freeform', label: 'Free Space',    icon: Move,           tip: 'Move anything anywhere' },
                      ] as const).map(({ mode, label, icon: Icon, tip }) => {
                        const isActive = canvasMode === mode;
                        return (
                          <button
                            key={mode}
                            onClick={() => { if (!isActive) onToggleCanvas(); }}
                            style={{
                              flex:            1,
                              display:         'flex',
                              flexDirection:   'column',
                              alignItems:      'flex-start',
                              gap:             '3px',
                              padding:         '8px 10px',
                              borderRadius:    '10px',
                              border:          `1px solid ${isActive ? tokens.accent + '40' : tokens.cardBorder}`,
                              backgroundColor: isActive ? tokens.accentSubtle : 'transparent',
                              cursor:          isActive ? 'default' : 'pointer',
                              textAlign:       'left' as const,
                              transition:      'all 0.12s ease',
                            }}
                            onMouseEnter={e => { if (!isActive) Object.assign((e.currentTarget as HTMLElement).style, { backgroundColor: tokens.cardBorder }); }}
                            onMouseLeave={e => { if (!isActive) Object.assign((e.currentTarget as HTMLElement).style, { backgroundColor: 'transparent' }); }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                              <Icon style={{ width: '11px', height: '11px', color: isActive ? tokens.accent : tokens.textSecondary }} />
                              <span style={{ fontSize: '11px', fontWeight: 600, color: isActive ? tokens.accent : tokens.textPrimary }}>
                                {label}
                              </span>
                            </div>
                            <span style={{ fontSize: '9px', color: tokens.textMuted, lineHeight: 1.3 }}>
                              {tip}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Edit layout toggle */}
                    <button
                      onClick={() => { onToggleDesign(); setCustomizeOpen(false); }}
                      style={{
                        marginTop:       '6px',
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
                        {designMode ? 'Exit edit mode' : 'Edit layout'}
                      </span>
                      {designMode && (
                        <span style={{
                          marginLeft: 'auto',
                          fontSize: '9px', fontWeight: 700, letterSpacing: '0.08em',
                          color: tokens.accent, opacity: 0.7,
                        }}>
                          ON
                        </span>
                      )}
                    </button>
                  </div>

                  {/* ── Section: Atmosphere ───────────────────────── */}
                  <div style={{ padding: '8px 14px 6px', borderBottom: `1px solid ${tokens.divider}` }}>
                    <p style={{
                      fontFamily:    "'Space Grotesk', sans-serif",
                      fontSize:      '9px',
                      fontWeight:    700,
                      letterSpacing: '0.14em',
                      textTransform: 'uppercase',
                      color:         tokens.textGhost,
                      margin:        '0 0 6px',
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
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <p style={{ fontSize: '11px', fontWeight: 600, color: isActive ? tokens.accent : tokens.textPrimary, margin: 0 }}>
                                {atm.name}
                              </p>
                            </div>
                            {isActive && (
                              <div style={{
                                width: '5px', height: '5px', borderRadius: '50%',
                                backgroundColor: tokens.accent,
                                flexShrink: 0,
                              }} />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Footer close */}
                  <div style={{ padding: '6px 14px 10px', display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => setCustomizeOpen(false)}
                      style={{
                        display:         'flex',
                        alignItems:      'center',
                        gap:             '4px',
                        padding:         '4px 10px',
                        borderRadius:    '7px',
                        border:          `1px solid ${tokens.cardBorder}`,
                        backgroundColor: 'transparent',
                        cursor:          'pointer',
                        fontSize:        '11px',
                        fontWeight:      500,
                        color:           tokens.textGhost,
                        transition:      'all 0.12s ease',
                      }}
                      onMouseEnter={e => Object.assign((e.currentTarget as HTMLElement).style, { backgroundColor: tokens.cardBorder, color: tokens.textSecondary })}
                      onMouseLeave={e => Object.assign((e.currentTarget as HTMLElement).style, { backgroundColor: 'transparent', color: tokens.textGhost })}
                    >
                      <X style={{ width: '10px', height: '10px' }} />
                      Close
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
