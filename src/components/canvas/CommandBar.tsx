import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AtmosphereTokens, ATMOSPHERES } from '../../hooks/useAtmosphere';
import { BookOpenCheck, Sliders, Plus, ChevronDown, LogOut } from 'lucide-react';

interface Props {
  tokens:           AtmosphereTokens;
  atmosphereId:     string;
  designMode:       boolean;
  userName:         string;
  onToggleDesign:   () => void;
  onOpenAdd:        () => void;
  onSetAtmosphere:  (id: string) => void;
  onSignOut:        () => void;
}

// Shared nav-button style helpers
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
  color:           active ? tokens.accent : tokens.textGhost,
  transition:      'all 0.15s ease',
  whiteSpace:      'nowrap' as const,
});

export function CommandBar({
  tokens, atmosphereId, designMode, userName,
  onToggleDesign, onOpenAdd, onSetAtmosphere, onSignOut,
}: Props) {
  const [atmOpen, setAtmOpen] = useState(false);
  const currentAtm = ATMOSPHERES.find(a => a.id === atmosphereId) ?? ATMOSPHERES[0];

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

        {/* ── Left: Logo + breadcrumb ────────────────────────────────── */}
        <div className="flex items-center gap-2.5" style={{ flexShrink: 0 }}>
          <Link
            to="/dashboard"
            className="flex items-center gap-2"
            style={{ textDecoration: 'none' }}
          >
            <div
              style={{
                width:           '26px',
                height:          '26px',
                borderRadius:    '7px',
                backgroundColor: tokens.accent,
                boxShadow:       `0 0 12px ${tokens.accentGlow}`,
                display:         'flex',
                alignItems:      'center',
                justifyContent:  'center',
                flexShrink:      0,
              }}
            >
              <BookOpenCheck
                style={{ width: '14px', height: '14px', color: '#000' }}
                strokeWidth={2.5}
              />
            </div>
            <span
              className="hidden sm:block"
              style={{
                fontFamily:   "'Plus Jakarta Sans', sans-serif",
                fontSize:     '14px',
                fontWeight:   700,
                letterSpacing: '-0.02em',
                color:        tokens.textPrimary,
              }}
            >
              Focus
            </span>
          </Link>

          <span
            style={{
              color:      tokens.cardBorderHover,
              fontSize:   '16px',
              fontWeight: 200,
              lineHeight: 1,
              userSelect: 'none',
            }}
          >
            /
          </span>

          <span
            style={{
              fontSize:  '13px',
              fontWeight: 500,
              color:     tokens.textSecondary,
              maxWidth:  '160px',
              overflow:  'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {userName ? `${userName}'s workspace` : 'My workspace'}
          </span>
        </div>

        {/* ── Right: Controls ────────────────────────────────────────── */}
        <div className="flex items-center" style={{ gap: '2px' }}>

          {/* Schedule link */}
          <Link
            to="/schedule"
            className="hidden md:flex items-center"
            style={navBtn(tokens)}
            onMouseEnter={e => {
              Object.assign((e.currentTarget as HTMLElement).style, {
                backgroundColor: tokens.cardBorder,
                color: tokens.textSecondary,
                borderColor: tokens.cardBorder,
              });
            }}
            onMouseLeave={e => {
              Object.assign((e.currentTarget as HTMLElement).style, {
                backgroundColor: 'transparent',
                color: tokens.textGhost,
                borderColor: 'transparent',
              });
            }}
          >
            Schedule
          </Link>

          {/* Divider */}
          <div
            className="hidden md:block mx-1.5"
            style={{ width: '1px', height: '14px', backgroundColor: tokens.divider }}
          />

          {/* Atmosphere picker */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setAtmOpen(o => !o)}
              style={navBtn(tokens, atmOpen)}
              onMouseEnter={e => {
                if (!atmOpen) Object.assign((e.currentTarget as HTMLButtonElement).style, {
                  backgroundColor: tokens.cardBorder,
                  color: tokens.textSecondary,
                  borderColor: tokens.cardBorder,
                });
              }}
              onMouseLeave={e => {
                if (!atmOpen) Object.assign((e.currentTarget as HTMLButtonElement).style, {
                  backgroundColor: 'transparent',
                  color: tokens.textGhost,
                  borderColor: 'transparent',
                });
              }}
            >
              <span style={{ fontSize: '13px', lineHeight: 1 }}>{currentAtm.emoji}</span>
              <span className="hidden sm:inline">{currentAtm.name}</span>
              <ChevronDown
                style={{
                  width: '12px',
                  height: '12px',
                  transition: 'transform 0.2s ease',
                  transform: atmOpen ? 'rotate(180deg)' : 'none',
                }}
              />
            </button>

            {atmOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setAtmOpen(false)}
                />
                <div
                  className="absolute right-0 top-full z-50 animate-scale-in"
                  style={{
                    marginTop:       '8px',
                    width:           '252px',
                    backgroundColor: tokens.cardBg,
                    border:          `1px solid ${tokens.cardBorder}`,
                    borderRadius:    `${Math.min(tokens.radius, 18)}px`,
                    boxShadow:       tokens.shadowLg,
                    backdropFilter:  'blur(24px)',
                    WebkitBackdropFilter: 'blur(24px)',
                    overflow:        'hidden',
                  }}
                >
                  {/* Header label */}
                  <div
                    style={{
                      padding:      '10px 14px 6px',
                      fontFamily:   "'Space Grotesk', sans-serif",
                      fontSize:     '9px',
                      fontWeight:   700,
                      letterSpacing: '0.14em',
                      textTransform: 'uppercase',
                      color:        tokens.textGhost,
                      borderBottom: `1px solid ${tokens.divider}`,
                    }}
                  >
                    Atmosphere
                  </div>

                  <div style={{ padding: '6px' }}>
                    {ATMOSPHERES.map(atm => {
                      const isActive = atm.id === atmosphereId;
                      return (
                        <button
                          key={atm.id}
                          onClick={() => { onSetAtmosphere(atm.id); setAtmOpen(false); }}
                          style={{
                            width:           '100%',
                            display:         'flex',
                            alignItems:      'center',
                            gap:             '10px',
                            padding:         '8px 10px',
                            borderRadius:    '10px',
                            border:          `1px solid ${isActive ? tokens.accent + '30' : 'transparent'}`,
                            backgroundColor: isActive ? tokens.accentSubtle : 'transparent',
                            cursor:          'pointer',
                            textAlign:       'left' as const,
                            transition:      'all 0.12s ease',
                          }}
                          onMouseEnter={e => {
                            if (!isActive) Object.assign((e.currentTarget as HTMLElement).style, {
                              backgroundColor: tokens.cardBorder,
                            });
                          }}
                          onMouseLeave={e => {
                            if (!isActive) Object.assign((e.currentTarget as HTMLElement).style, {
                              backgroundColor: 'transparent',
                            });
                          }}
                        >
                          <span style={{ fontSize: '16px', lineHeight: 1, flexShrink: 0 }}>
                            {atm.emoji}
                          </span>
                          <div style={{ minWidth: 0 }}>
                            <p
                              style={{
                                fontSize:  '12px',
                                fontWeight: 600,
                                color:     isActive ? tokens.accent : tokens.textPrimary,
                                margin:    0,
                              }}
                            >
                              {atm.name}
                            </p>
                            <p
                              style={{
                                fontSize:  '10px',
                                color:     tokens.textGhost,
                                margin:    0,
                                marginTop: '1px',
                              }}
                            >
                              {atm.description}
                            </p>
                          </div>
                          {isActive && (
                            <div
                              style={{
                                width:           '6px',
                                height:          '6px',
                                borderRadius:    '50%',
                                backgroundColor: tokens.accent,
                                boxShadow:       `0 0 6px ${tokens.accentGlow}`,
                                marginLeft:      'auto',
                                flexShrink:      0,
                              }}
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Add to workspace (⌘K) */}
          <button
            onClick={onOpenAdd}
            title="Add to workspace  ⌘K"
            style={navBtn(tokens)}
            onMouseEnter={e => {
              Object.assign((e.currentTarget as HTMLButtonElement).style, {
                backgroundColor: tokens.accentSubtle,
                color: tokens.accent,
                borderColor: `${tokens.accent}30`,
              });
            }}
            onMouseLeave={e => {
              Object.assign((e.currentTarget as HTMLButtonElement).style, {
                backgroundColor: 'transparent',
                color: tokens.textGhost,
                borderColor: 'transparent',
              });
            }}
          >
            <Plus style={{ width: '13px', height: '13px' }} strokeWidth={2.5} />
            <span className="hidden sm:inline">Add</span>
          </button>

          {/* Design mode toggle */}
          <button
            onClick={onToggleDesign}
            style={{
              ...navBtn(tokens, designMode),
              ...(designMode ? {
                backgroundColor: tokens.accent,
                color:           '#000',
                fontWeight:      700,
                border:          'none',
                boxShadow:       `0 0 14px ${tokens.accentGlow}`,
              } : {}),
            }}
            onMouseEnter={e => {
              if (!designMode) Object.assign((e.currentTarget as HTMLButtonElement).style, {
                backgroundColor: tokens.cardBorder,
                color: tokens.textSecondary,
                borderColor: tokens.cardBorder,
              });
            }}
            onMouseLeave={e => {
              if (!designMode) Object.assign((e.currentTarget as HTMLButtonElement).style, {
                backgroundColor: 'transparent',
                color: tokens.textGhost,
                borderColor: 'transparent',
              });
            }}
          >
            <Sliders style={{ width: '12px', height: '12px' }} />
            <span>Design</span>
          </button>

          {/* Divider */}
          <div
            className="mx-1"
            style={{ width: '1px', height: '14px', backgroundColor: tokens.divider }}
          />

          {/* Sign out */}
          <button
            onClick={onSignOut}
            title="Sign out"
            style={{
              ...navBtn(tokens),
              padding: '5px 7px',
            }}
            onMouseEnter={e => {
              Object.assign((e.currentTarget as HTMLButtonElement).style, {
                backgroundColor: tokens.cardBorder,
                color: tokens.textMuted,
                borderColor: tokens.cardBorder,
              });
            }}
            onMouseLeave={e => {
              Object.assign((e.currentTarget as HTMLButtonElement).style, {
                backgroundColor: 'transparent',
                color: tokens.textGhost,
                borderColor: 'transparent',
              });
            }}
          >
            <LogOut style={{ width: '13px', height: '13px' }} />
          </button>

        </div>
      </div>
    </header>
  );
}
