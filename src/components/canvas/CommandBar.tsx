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
        borderBottom: `1px solid ${tokens.cardBorder}`,
        backdropFilter: `blur(${tokens.blur}px)`,
        WebkitBackdropFilter: `blur(${tokens.blur}px)`,
        transition: 'background-color 0.35s ease',
      }}
    >
      <div className="flex items-center justify-between h-12 px-5 md:px-8">

        {/* ── Left: Logo + workspace identity ──────────────────────── */}
        <div className="flex items-center gap-3">
          <Link to="/dashboard" className="flex items-center gap-2 flex-shrink-0">
            <div
              className="w-6 h-6 rounded-lg flex items-center justify-center"
              style={{
                backgroundColor: tokens.accent,
                boxShadow: `0 0 10px ${tokens.accentGlow}`,
              }}
            >
              <BookOpenCheck className="w-3.5 h-3.5 text-black" strokeWidth={2.5} />
            </div>
            <span className="font-bold text-sm tracking-tight hidden sm:block"
              style={{ color: tokens.textPrimary }}>
              Focus
            </span>
          </Link>

          <span style={{ color: tokens.cardBorder, fontSize: '18px', fontWeight: 300 }}>/</span>

          <div className="flex items-center gap-1.5">
            <span
              className="text-sm font-semibold"
              style={{ color: tokens.textSecondary }}
            >
              {userName ? `${userName}'s workspace` : 'My workspace'}
            </span>
          </div>
        </div>

        {/* ── Right: controls ───────────────────────────────────────── */}
        <div className="flex items-center gap-1">

          {/* Schedule link */}
          <Link
            to="/schedule"
            className="hidden md:flex items-center text-xs px-2.5 py-1.5 rounded-lg font-medium transition-all"
            style={{ color: tokens.textGhost }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.color = tokens.textSecondary;
              (e.currentTarget as HTMLElement).style.backgroundColor = tokens.cardBorder;
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.color = tokens.textGhost;
              (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
            }}
          >
            Schedule
          </Link>

          <span className="w-px h-3.5 mx-1 hidden md:block" style={{ backgroundColor: tokens.divider }} />

          {/* Atmosphere picker */}
          <div className="relative">
            <button
              onClick={() => setAtmOpen(o => !o)}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg font-medium transition-all"
              style={{
                color:           atmOpen ? tokens.accent : tokens.textGhost,
                backgroundColor: atmOpen ? tokens.accentSubtle : 'transparent',
                border:          atmOpen ? `1px solid ${tokens.accent}40` : '1px solid transparent',
              }}
              onMouseEnter={e => {
                if (!atmOpen) {
                  (e.currentTarget as HTMLButtonElement).style.color = tokens.textSecondary;
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = tokens.cardBorder;
                }
              }}
              onMouseLeave={e => {
                if (!atmOpen) {
                  (e.currentTarget as HTMLButtonElement).style.color = tokens.textGhost;
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
                }
              }}
            >
              <span style={{ fontSize: '13px', lineHeight: 1 }}>{currentAtm.emoji}</span>
              <span className="hidden sm:inline">{currentAtm.name}</span>
              <ChevronDown className="w-3 h-3" />
            </button>

            {atmOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setAtmOpen(false)}
                />
                <div
                  className="absolute right-0 top-full mt-1.5 z-50 rounded-2xl overflow-hidden"
                  style={{
                    width: '240px',
                    backgroundColor: tokens.cardBg,
                    border: `1px solid ${tokens.cardBorder}`,
                    boxShadow: tokens.shadowLg,
                  }}
                >
                  <div className="p-1.5">
                    {ATMOSPHERES.map(atm => (
                      <button
                        key={atm.id}
                        onClick={() => { onSetAtmosphere(atm.id); setAtmOpen(false); }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left"
                        style={{
                          backgroundColor: atm.id === atmosphereId ? tokens.accentSubtle : 'transparent',
                          border: `1px solid ${atm.id === atmosphereId ? tokens.accent + '30' : 'transparent'}`,
                        }}
                        onMouseEnter={e => {
                          if (atm.id !== atmosphereId)
                            (e.currentTarget as HTMLElement).style.backgroundColor = tokens.cardBorder;
                        }}
                        onMouseLeave={e => {
                          if (atm.id !== atmosphereId)
                            (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
                        }}
                      >
                        <span style={{ fontSize: '16px', lineHeight: 1 }}>{atm.emoji}</span>
                        <div>
                          <p className="text-xs font-semibold" style={{ color: tokens.textPrimary }}>
                            {atm.name}
                          </p>
                          <p className="text-[10px]" style={{ color: tokens.textGhost }}>
                            {atm.description}
                          </p>
                        </div>
                        {atm.id === atmosphereId && (
                          <div
                            className="w-1.5 h-1.5 rounded-full ml-auto flex-shrink-0"
                            style={{ backgroundColor: tokens.accent }}
                          />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Add module */}
          <button
            onClick={onOpenAdd}
            className="flex items-center gap-1.5 text-xs font-bold px-2.5 py-1.5 rounded-lg transition-all"
            style={{ color: tokens.textGhost }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.color = tokens.accent;
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = tokens.accentSubtle;
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.color = tokens.textGhost;
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
            }}
            title="Add module"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Add</span>
          </button>

          {/* Design mode toggle — prominent */}
          <button
            onClick={onToggleDesign}
            className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-all"
            style={{
              color:           designMode ? '#000'           : tokens.textSecondary,
              backgroundColor: designMode ? tokens.accent    : tokens.cardBorder,
              border:          designMode ? 'none'           : `1px solid ${tokens.cardBorder}`,
              boxShadow:       designMode ? `0 0 12px ${tokens.accentGlow}` : 'none',
            }}
            onMouseEnter={e => {
              if (!designMode) {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = tokens.cardBorderHover;
                (e.currentTarget as HTMLButtonElement).style.color = tokens.textPrimary;
              }
            }}
            onMouseLeave={e => {
              if (!designMode) {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = tokens.cardBorder;
                (e.currentTarget as HTMLButtonElement).style.color = tokens.textSecondary;
              }
            }}
          >
            <Sliders className="w-3 h-3" />
            <span>Design</span>
          </button>

          <span className="w-px h-3.5 mx-1" style={{ backgroundColor: tokens.divider }} />

          {/* Sign out */}
          <button
            onClick={onSignOut}
            className="p-1.5 rounded-lg transition-all"
            style={{ color: tokens.textGhost }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.color = tokens.textMuted;
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = tokens.cardBorder;
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.color = tokens.textGhost;
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
            }}
            title="Sign out"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>

        </div>
      </div>
    </header>
  );
}
