/**
 * Floating spatial OS controls — single primary bar, minimal permanent chrome.
 */

import { useState, useRef, useEffect, type CSSProperties, type RefObject } from 'react';
import { ArrowLeft, ChevronDown, MoreHorizontal, Palette, Search, Sliders } from 'lucide-react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import type { FocusMode } from '../../focusMode/focusModeTypes';
import type { FreeSpaceBoard } from '../../hooks/useSectionFreeSpaceBoards';
import type { FreeSpaceTemplateId } from '../../lib/sectionFreeSpaceLayoutTemplates';
import type { ArrangeGoalId } from '../../lib/freeSpaceAutoArrange';
import { EXPLORE_FOCUS_SECTION_TITLE } from '../../lib/exploreFocus';
import { glassIsland, shellIconBtn } from './shellGlass';
import { OrganizeWorkspaceMenuPanel } from './OrganizeWorkspaceMenuPanel';
import { isMathZoneDestinationEnabled } from '../../lib/mathZoneDestinationConfig';

const VIEW_MODES_ALL = [
  { id: 'free-space' as const, label: 'Workspace' },
  { id: 'work-surface' as const, label: 'Mission Control' },
  { id: 'math-zone' as const, label: '∑ Studio' },
] as const;

const VIEW_MODES = VIEW_MODES_ALL.filter(
  opt => opt.id !== 'math-zone' || isMathZoneDestinationEnabled(),
);

export const WORKSPACE_CHROME_Z = 600;

const MENU_PANEL_STYLE: CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 6px)',
  right: 0,
  minWidth: 220,
  maxWidth: 360,
  padding: 6,
  borderRadius: 12,
  border: '1px solid rgba(255,255,255,0.06)',
  boxShadow: '0 16px 44px rgba(0,0,0,0.4)',
  zIndex: 2,
};

function useDismissOnOutside(open: boolean, onClose: () => void, rootRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open, onClose, rootRef]);
}

interface OrganizeProps {
  objectCount: number;
  selectedCount: number;
  onApplyTemplate: (id: FreeSpaceTemplateId) => void;
  onAutoArrange: () => void;
  onArrangeSelected: () => void;
  onArrangeByGoal: (goal: ArrangeGoalId) => void;
}

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
  onOpenNotebookControls?: () => void;
  notebookControlsOpen?: boolean;
  onExitCustomize: () => void;
  onResetCustomize: () => void;
  sectionViewMode: 'work-surface' | 'free-space' | 'math-zone';
  onViewModeChange: (mode: 'work-surface' | 'free-space' | 'math-zone') => void;
  focusMode: FocusMode | null;
  boards?: FreeSpaceBoard[];
  activeBoardId?: string;
  onSelectBoard?: (id: string) => void;
  onCreateBoard?: (name: string) => void;
  organize?: OrganizeProps;
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
  onOpenNotebookControls,
  notebookControlsOpen = false,
  onExitCustomize,
  onResetCustomize,
  sectionViewMode,
  onViewModeChange,
  focusMode,
  boards,
  activeBoardId,
  onSelectBoard,
  onCreateBoard,
  organize,
}: Props) {
  const [searchHover, setSearchHover] = useState(false);
  const [overflowHover, setOverflowHover] = useState(false);
  const [spaceOpen, setSpaceOpen] = useState(false);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [overflowView, setOverflowView] = useState<'root' | 'organize'>('root');

  const spaceRef = useRef<HTMLDivElement>(null);
  const overflowRef = useRef<HTMLDivElement>(null);

  const closeSpace = () => setSpaceOpen(false);
  const closeOverflow = () => {
    setOverflowOpen(false);
    setOverflowView('root');
  };

  useDismissOnOutside(spaceOpen, closeSpace, spaceRef);
  useDismissOnOutside(overflowOpen, closeOverflow, overflowRef);

  const displayTitle = isExploreFocus ? EXPLORE_FOCUS_SECTION_TITLE : title;
  const activeBoard = boards?.find(b => b.id === activeBoardId);
  const showSpace = sectionViewMode === 'free-space' && boards && activeBoardId != null && onSelectBoard;
  const showOrganize = sectionViewMode === 'free-space' && organize;

  const menuPanelBg = tokens.cardBg;

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
        padding: 'max(8px, env(safe-area-inset-top)) 16px 0',
      }}
    >
      <div
        style={{
          ...glassIsland(tokens, 'primary', 'idle'),
          pointerEvents: 'auto',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexWrap: 'nowrap',
          minHeight: 52,
          padding: '6px 10px 6px 8px',
          borderRadius: 16,
          maxWidth: '100%',
        }}
      >
        <button
          type="button"
          onClick={onBack}
          aria-label={`Back to ${backLabel}`}
          style={{
            ...shellIconBtn(tokens, 'idle'),
            flexShrink: 0,
            width: 36,
            minWidth: 36,
          }}
        >
          <ArrowLeft size={18} strokeWidth={2.25} style={{ color: tokens.textPrimary }} />
        </button>

        <div style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <h1
            style={{
              flex: '1 1 auto',
              minWidth: 0,
              margin: 0,
              padding: '0 4px',
              fontSize: 15,
              fontWeight: 650,
              letterSpacing: '-0.025em',
              color: tokens.textPrimary,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              lineHeight: 1.25,
            }}
            title={displayTitle}
          >
            {displayTitle}
          </h1>
          {isExploreFocus ? (
            <span
              style={{
                flexShrink: 0,
                fontSize: 9,
                fontWeight: 750,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: accent,
                padding: '3px 7px',
                borderRadius: 6,
                border: `1px solid ${accent}44`,
                background: `${accent}14`,
              }}
            >
              Explore
            </span>
          ) : null}
        </div>

        {isCustomizing ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <button type="button" onClick={onResetCustomize} style={shellIconBtn(tokens)}>
              <span style={{ fontSize: 11, color: tokens.textMuted, padding: '0 6px' }}>Reset</span>
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
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                flexShrink: 0,
                padding: 3,
                borderRadius: 12,
                background: `${tokens.wellBg}66`,
              }}
            >
              {VIEW_MODES.map(opt => {
                const active = sectionViewMode === opt.id;
                const lensActive = active && focusMode != null;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onViewModeChange(opt.id)}
                    style={{
                      position: 'relative',
                      border: 'none',
                      borderRadius: 999,
                      padding: '6px 10px',
                      minHeight: 32,
                      cursor: 'pointer',
                      fontSize: 11,
                      fontWeight: active ? 700 : 550,
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
                    {lensActive ? (
                      <span
                        aria-hidden
                        style={{
                          position: 'absolute',
                          top: 4,
                          right: 4,
                          width: 4,
                          height: 4,
                          borderRadius: '50%',
                          background: accent,
                          boxShadow: `0 0 6px ${accent}`,
                        }}
                      />
                    ) : null}
                  </button>
                );
              })}
            </div>

            {showSpace ? (
              <div ref={spaceRef} style={{ position: 'relative', flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={() => setSpaceOpen(o => !o)}
                  aria-expanded={spaceOpen}
                  aria-haspopup="listbox"
                  style={{
                    ...glassIsland(tokens, 'secondary', spaceOpen ? 'active' : 'idle'),
                    fontSize: 11,
                    fontWeight: 600,
                    color: tokens.textSecondary,
                    padding: '6px 10px',
                    gap: 4,
                  }}
                >
                  <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {activeBoard?.name ?? 'Space'}
                  </span>
                  <ChevronDown
                    size={14}
                    style={{
                      opacity: 0.7,
                      transform: spaceOpen ? 'rotate(180deg)' : 'none',
                      transition: 'transform 0.2s ease',
                    }}
                  />
                </button>
                {spaceOpen ? (
                  <div
                    role="listbox"
                    aria-label="Spaces"
                    style={{
                      ...MENU_PANEL_STYLE,
                      right: 0,
                      minWidth: 180,
                      backgroundColor: menuPanelBg,
                    }}
                  >
                    {boards!.map(board => {
                      const active = board.id === activeBoardId;
                      return (
                        <button
                          key={board.id}
                          type="button"
                          role="option"
                          aria-selected={active}
                          onClick={() => {
                            onSelectBoard!(board.id);
                            closeSpace();
                          }}
                          style={{
                            display: 'block',
                            width: '100%',
                            textAlign: 'left',
                            padding: '9px 10px',
                            border: 'none',
                            borderRadius: 8,
                            background: active ? `${tokens.accent}18` : 'transparent',
                            color: active ? tokens.textPrimary : tokens.textSecondary,
                            fontSize: 12,
                            fontWeight: active ? 650 : 500,
                            cursor: 'pointer',
                          }}
                        >
                          {board.name}
                        </button>
                      );
                    })}
                    {onCreateBoard ? (
                      <>
                        <div style={{ height: 1, margin: '4px 6px', background: 'rgba(255,255,255,0.06)' }} />
                        <button
                          type="button"
                          onClick={() => {
                            const name = window.prompt('New space name', 'Space');
                            if (name?.trim()) {
                              onCreateBoard(name.trim());
                              closeSpace();
                            }
                          }}
                          style={{
                            display: 'block',
                            width: '100%',
                            textAlign: 'left',
                            padding: '9px 10px',
                            border: 'none',
                            borderRadius: 8,
                            background: 'transparent',
                            color: tokens.textMuted,
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          New space…
                        </button>
                      </>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            <button
              type="button"
              aria-label="Search"
              title="Search (⌘K)"
              onClick={onOpenSearch}
              style={{
                ...shellIconBtn(tokens, searchHover ? 'hover' : 'idle'),
                flexShrink: 0,
                width: 36,
                minWidth: 36,
              }}
              onMouseEnter={() => setSearchHover(true)}
              onMouseLeave={() => setSearchHover(false)}
            >
              <Search size={18} strokeWidth={2} />
            </button>

            <div ref={overflowRef} style={{ position: 'relative', flexShrink: 0 }}>
              <button
                type="button"
                aria-label="More options"
                aria-expanded={overflowOpen}
                aria-haspopup="menu"
                onClick={() => setOverflowOpen(o => !o)}
                style={{
                  ...shellIconBtn(tokens, overflowHover ? 'hover' : 'idle'),
                  width: 36,
                  minWidth: 36,
                }}
                onMouseEnter={() => setOverflowHover(true)}
                onMouseLeave={() => setOverflowHover(false)}
              >
                <MoreHorizontal size={18} strokeWidth={2} />
              </button>
              {overflowOpen ? (
                <div
                  role="menu"
                  style={{
                    ...MENU_PANEL_STYLE,
                    backgroundColor: menuPanelBg,
                    maxHeight: 'min(70vh, 480px)',
                    overflowY: 'auto',
                  }}
                >
                  {overflowView === 'organize' && organize ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setOverflowView('root')}
                        style={{
                          display: 'block',
                          width: '100%',
                          textAlign: 'left',
                          padding: '8px 10px',
                          border: 'none',
                          borderRadius: 8,
                          background: 'transparent',
                          color: tokens.textMuted,
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: 'pointer',
                          marginBottom: 4,
                        }}
                      >
                        ← Back
                      </button>
                      <OrganizeWorkspaceMenuPanel
                        tokens={tokens}
                        objectCount={organize.objectCount}
                        selectedCount={organize.selectedCount}
                        onApplyTemplate={organize.onApplyTemplate}
                        onAutoArrange={organize.onAutoArrange}
                        onArrangeSelected={organize.onArrangeSelected}
                        onArrangeByGoal={organize.onArrangeByGoal}
                        onClose={closeOverflow}
                      />
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          onOpenAppearance();
                          closeOverflow();
                        }}
                        style={overflowMenuItemStyle(tokens)}
                      >
                        <Palette size={15} style={{ marginRight: 8, verticalAlign: -3, color: accent }} />
                        Appearance
                      </button>
                      {sectionViewMode === 'math-zone' ? (
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            (onOpenNotebookControls ?? onCustomize)();
                            closeOverflow();
                          }}
                          style={{
                            ...overflowMenuItemStyle(tokens),
                            color: notebookControlsOpen ? tokens.accent : tokens.textSecondary,
                          }}
                        >
                          <Sliders size={15} style={{ marginRight: 8, verticalAlign: -3 }} />
                          Notebook controls
                        </button>
                      ) : (
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            onCustomize();
                            closeOverflow();
                          }}
                          style={overflowMenuItemStyle(tokens)}
                        >
                          <Sliders size={15} style={{ marginRight: 8, verticalAlign: -3 }} />
                          Customize workspace
                        </button>
                      )}
                      {showOrganize ? (
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => setOverflowView('organize')}
                          style={overflowMenuItemStyle(tokens)}
                        >
                          Organize workspace…
                        </button>
                      ) : null}
                    </>
                  )}
                </div>
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function overflowMenuItemStyle(tokens: AtmosphereTokens): CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    textAlign: 'left',
    padding: '10px 10px',
    border: 'none',
    borderRadius: 8,
    background: 'transparent',
    color: tokens.textSecondary,
    fontSize: 12.5,
    fontWeight: 600,
    cursor: 'pointer',
  };
}
