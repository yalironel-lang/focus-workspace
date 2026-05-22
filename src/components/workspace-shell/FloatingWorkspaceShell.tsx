/**
 * Floating spatial OS controls — no full-width nav slab.
 */

import { useState } from 'react';
import { ArrowLeft, Palette, Search, Sliders } from 'lucide-react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import type { FocusMode } from '../../focusMode/focusModeTypes';
import { FOCUS_MODE_BADGE } from '../../focusMode/focusModeTypes';
import type { FreeSpaceBoard } from '../../hooks/useSectionFreeSpaceBoards';
import { EXPLORE_FOCUS_SECTION_TITLE } from '../../lib/exploreFocus';
import { glassIsland, shellIconBtn } from './shellGlass';

const VIEW_MODES = [
  { id: 'free-space' as const, label: 'Workspace' },
  { id: 'work-surface' as const, label: 'Mission Control' },
];

export const WORKSPACE_CHROME_Z = 600;

interface Props {
  title: string;
  accent: string;
  tokens: AtmosphereTokens;
  isCustomizing: boolean;
  isExploreFocus?: boolean;
  backLabel?: string;
  onBack: () => void;
  onOpenSearch: () => void;
  onOpenAppearance: () => void;
  onCustomize: () => void;
  onExitCustomize: () => void;
  onResetCustomize: () => void;
  sectionViewMode: 'work-surface' | 'free-space';
  onViewModeChange: (mode: 'work-surface' | 'free-space') => void;
  focusMode: FocusMode | null;
  boards?: FreeSpaceBoard[];
  activeBoardId?: string;
  onSelectBoard?: (id: string) => void;
  onCreateBoard?: (name: string) => void;
}

export function FloatingWorkspaceShell({
  title,
  accent,
  tokens,
  isCustomizing,
  isExploreFocus = false,
  backLabel = 'Library',
  onBack,
  onOpenSearch,
  onOpenAppearance,
  onCustomize,
  onExitCustomize,
  onResetCustomize,
  sectionViewMode,
  onViewModeChange,
  focusMode,
  boards,
  activeBoardId,
  onSelectBoard,
  onCreateBoard,
}: Props) {
  const [libHover, setLibHover] = useState(false);
  const [searchHover, setSearchHover] = useState(false);
  const [sceneHover, setSceneHover] = useState(false);
  const [settingsHover, setSettingsHover] = useState(false);

  const displayTitle = isExploreFocus ? EXPLORE_FOCUS_SECTION_TITLE : title;
  const osLabel = isExploreFocus ? 'Guided environment' : 'Workspace';

  return (
    <div
      role="banner"
      aria-label="Workspace controls"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: WORKSPACE_CHROME_Z,
        pointerEvents: 'none',
        padding: 'max(10px, env(safe-area-inset-top)) 16px 0',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        {/* Primary — orientation */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: '1 1 280px' }}>
          <button
            type="button"
            onClick={onBack}
            aria-label={`Back to ${backLabel}`}
            style={glassIsland(tokens, 'primary', libHover ? 'hover' : 'idle')}
            onMouseEnter={() => setLibHover(true)}
            onMouseLeave={() => setLibHover(false)}
          >
            <ArrowLeft size={16} strokeWidth={2.25} style={{ color: tokens.textPrimary, flexShrink: 0 }} />
            <span style={{ fontSize: 13, fontWeight: 650, color: tokens.textPrimary, letterSpacing: '-0.02em' }}>
              {backLabel}
            </span>
          </button>

          <div
            style={{
              ...glassIsland(tokens, 'primary', 'idle'),
              flexDirection: 'column',
              alignItems: 'flex-start',
              gap: 2,
              padding: '7px 14px 8px',
              borderRadius: 14,
              maxWidth: 280,
            }}
          >
            <span
              style={{
                fontSize: 9,
                fontWeight: 750,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: tokens.textGhost,
              }}
            >
              {osLabel}
            </span>
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: tokens.textSecondary,
                letterSpacing: '-0.02em',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: 240,
              }}
            >
              {displayTitle}
            </span>
          </div>

          {isExploreFocus && (
            <span
              style={{
                ...glassIsland(tokens, 'primary', 'active'),
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: accent,
              }}
            >
              Explore Focus
            </span>
          )}
        </div>

        {/* Spaces — free-space only */}
        {sectionViewMode === 'free-space' && boards && activeBoardId != null && onSelectBoard && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              flexWrap: 'wrap',
              flex: '0 1 auto',
            }}
          >
            <span
              style={{
                fontSize: 9,
                fontWeight: 750,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: tokens.textGhost,
                marginRight: 2,
              }}
            >
              Spaces
            </span>
            {boards.map(board => {
              const active = board.id === activeBoardId;
              return (
                <button
                  key={board.id}
                  type="button"
                  onClick={() => onSelectBoard(board.id)}
                  style={{
                    ...glassIsland(tokens, active ? 'primary' : 'secondary', active ? 'active' : 'idle'),
                    fontSize: 11,
                    fontWeight: active ? 700 : 550,
                    color: active ? tokens.textPrimary : tokens.textMuted,
                    padding: '6px 12px',
                  }}
                >
                  {board.name}
                </button>
              );
            })}
            {onCreateBoard && (
              <button
                type="button"
                onClick={() => {
                  const name = window.prompt('New space name', 'Space');
                  if (name?.trim()) onCreateBoard(name.trim());
                }}
                style={{
                  ...glassIsland(tokens, 'secondary', 'idle'),
                  fontSize: 11,
                  fontWeight: 600,
                  color: tokens.textGhost,
                  padding: '6px 10px',
                }}
              >
                +
              </button>
            )}
          </div>
        )}

        {/* View mode + secondary tools */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {isCustomizing ? (
            <div style={{ ...glassIsland(tokens, 'primary', 'idle'), gap: 6 }}>
              <button type="button" onClick={onResetCustomize} style={shellIconBtn(tokens)}>
                <span style={{ fontSize: 11, color: tokens.textMuted }}>Reset</span>
              </button>
              <button
                type="button"
                onClick={onExitCustomize}
                style={{
                  ...shellIconBtn(tokens, 'hover'),
                  backgroundColor: accent,
                  color: '#0a0805',
                  borderRadius: 10,
                  padding: '0 12px',
                  minWidth: 56,
                }}
              >
                <span style={{ fontSize: 11, fontWeight: 700 }}>Done</span>
              </button>
            </div>
          ) : (
            <>
              <div style={{ ...glassIsland(tokens, 'primary', 'idle'), padding: 4, gap: 4 }}>
                {VIEW_MODES.map(opt => {
                  const active = sectionViewMode === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => onViewModeChange(opt.id)}
                      style={{
                        border: 'none',
                        borderRadius: 999,
                        padding: '6px 12px',
                        minHeight: 34,
                        cursor: 'pointer',
                        fontSize: 11,
                        fontWeight: active ? 750 : 580,
                        letterSpacing: '-0.01em',
                        backgroundColor: active
                          ? opt.id === 'free-space'
                            ? `${accent}cc`
                            : `${tokens.wellBg}ee`
                          : 'transparent',
                        color: active
                          ? opt.id === 'free-space'
                            ? '#0a0805'
                            : tokens.textPrimary
                          : tokens.textMuted,
                        transition: 'background 0.15s ease, color 0.15s ease',
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>

              <div style={{ ...glassIsland(tokens, 'secondary', 'idle'), padding: 4, gap: 2 }}>
                <button
                  type="button"
                  aria-label="Search notebooks"
                  title="Search (⌘K)"
                  onClick={onOpenSearch}
                  style={shellIconBtn(tokens, searchHover ? 'hover' : 'idle')}
                  onMouseEnter={() => setSearchHover(true)}
                  onMouseLeave={() => setSearchHover(false)}
                >
                  <Search size={17} strokeWidth={2} />
                </button>
                <button
                  type="button"
                  aria-label="Scene"
                  title="Appearance"
                  onClick={onOpenAppearance}
                  style={shellIconBtn(tokens, sceneHover ? 'hover' : 'idle')}
                  onMouseEnter={() => setSceneHover(true)}
                  onMouseLeave={() => setSceneHover(false)}
                >
                  <Palette size={17} strokeWidth={2} style={{ color: accent }} />
                </button>
                <button
                  type="button"
                  aria-label="Settings"
                  title="Customize"
                  onClick={onCustomize}
                  style={shellIconBtn(tokens, settingsHover ? 'hover' : 'idle')}
                  onMouseEnter={() => setSettingsHover(true)}
                  onMouseLeave={() => setSettingsHover(false)}
                >
                  <Sliders size={17} strokeWidth={2} />
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {focusMode && (
        <div
          style={{
            alignSelf: 'center',
            ...glassIsland(tokens, 'secondary', 'idle'),
            fontSize: 10,
            fontWeight: 650,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: tokens.textSecondary,
          }}
        >
          Focus · {FOCUS_MODE_BADGE[focusMode as keyof typeof FOCUS_MODE_BADGE] ?? focusMode}
        </div>
      )}
    </div>
  );
}
