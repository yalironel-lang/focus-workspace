import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  BookOpen,
  BookOpenCheck,
  Calendar,
  ChevronRight,
  FileText,
  Hash,
  LayoutDashboard,
  Play,
  Plus,
  Search,
  StickyNote,
  Table2,
  X,
  Zap,
} from 'lucide-react';
import { SessionModal } from '../components/SessionModal';
import { isCommandPaletteBlockedTarget } from './isBlockedTarget';
import { filterAndSortCommands } from './matchCommands';
import { useCommandPalette, getFreeSpaceHandlersSnapshot } from './CommandPaletteContext';
import { LIBRARY_OPEN_CREATE_FLAG } from './constants';
import type { CommandItem } from './types';

function Kbd({ children }: { children: string }) {
  return (
    <kbd
      className="tabular-nums px-1.5 py-0.5 rounded text-[10px] font-semibold"
      style={{
        border: '1px solid rgba(255,255,255,0.1)',
        backgroundColor: 'rgba(255,255,255,0.06)',
        color: 'rgba(255,255,255,0.45)',
      }}
    >
      {children}
    </kbd>
  );
}

export function GlobalCommandPalette() {
  const ctx = useCommandPalette();
  const {
    paletteOpen,
    closePalette,
    togglePalette,
    freeSpaceVersion,
    sections,
    recentIdsOrdered,
    lastSession,
    isRecentSession,
    tokens,
    sectionIdFromRoute,
    navigate,
    openSessionModal,
    sessionModalOpen,
    setSessionModalOpen,
  } = ctx;

  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const commands = useMemo((): CommandItem[] => {
    const list: CommandItem[] = [];
    const fs = getFreeSpaceHandlersSnapshot();
    const inSection = !!sectionIdFromRoute;

    list.push(
      {
        id: 'nav-dashboard',
        group: 'navigation',
        groupLabel: 'Navigation',
        label: 'Go to Dashboard',
        subtitle: 'Workspace library',
        keywords: ['home', 'library', 'spaces'],
        icon: BookOpenCheck,
        priority: 2,
        run: () => {
          closePalette();
          navigate('/dashboard');
        },
      },
      {
        id: 'nav-desk',
        group: 'navigation',
        groupLabel: 'Navigation',
        label: 'Open Personal Desk',
        subtitle: 'Canvas & modules',
        keywords: ['desk', 'canvas', 'space'],
        icon: LayoutDashboard,
        priority: 3,
        run: () => {
          closePalette();
          navigate('/desk');
        },
      },
      {
        id: 'nav-schedule',
        group: 'navigation',
        groupLabel: 'Navigation',
        label: 'Open Schedule',
        keywords: ['calendar', 'week'],
        icon: Calendar,
        priority: 4,
        run: () => {
          closePalette();
          navigate('/schedule');
        },
      },
      {
        id: 'nav-session',
        group: 'navigation',
        groupLabel: 'Navigation',
        label: 'Start Focus Session',
        subtitle: 'Full-screen focus run',
        keywords: ['focus', 'timer'],
        icon: Play,
        priority: 5,
        run: () => {
          closePalette();
          navigate('/session');
        },
      },
    );

    list.push(
      {
        id: 'quick-new-session',
        group: 'quick',
        groupLabel: 'Quick actions',
        label: 'New session',
        subtitle: 'Pick a workspace to enter focus',
        keywords: ['session', 'modal'],
        icon: Zap,
        priority: 6,
        run: () => {
          if (sections.length === 0) {
            toast.error('Create a workspace first');
            return;
          }
          openSessionModal();
        },
      },
      {
        id: 'quick-last-ws',
        group: 'quick',
        groupLabel: 'Quick actions',
        label: 'Return to last workspace',
        subtitle: isRecentSession && lastSession ? lastSession.sectionTitle : 'Open your most recent space',
        keywords: ['recent', 'continue', 'back'],
        icon: BookOpen,
        priority: 7,
        disabled: !isRecentSession || !lastSession,
        disabledHint: 'No recent workspace on this device',
        run: () => {
          if (!lastSession) return;
          closePalette();
          navigate(`/section/${lastSession.sectionId}`);
        },
      },
    );

    list.push({
      id: 'ws-create',
      group: 'workspace',
      groupLabel: 'Workspaces',
      label: 'Create workspace',
      subtitle: 'Opens library with name field',
      keywords: ['new', 'add', 'course', 'project'],
      icon: Plus,
      priority: 8,
      run: () => {
        try {
          sessionStorage.setItem(LIBRARY_OPEN_CREATE_FLAG, '1');
        } catch {
          /* ignore */
        }
        closePalette();
        navigate('/dashboard');
      },
    });

    const byId = new Map(sections.map(s => [s.id, s]));
    for (const rid of recentIdsOrdered) {
      const s = byId.get(rid);
      if (!s) continue;
      list.push({
        id: `ws-open-${s.id}`,
        group: 'search',
        groupLabel: 'Recent',
        label: s.title,
        subtitle: 'Recently opened',
        keywords: [s.title],
        icon: Hash,
        priority: 10,
        run: () => {
          closePalette();
          navigate(`/section/${s.id}`);
        },
      });
    }

    for (const s of [...sections].sort((a, b) => a.title.localeCompare(b.title))) {
      if (recentIdsOrdered.includes(s.id)) continue;
      list.push({
        id: `ws-all-${s.id}`,
        group: 'workspace',
        groupLabel: 'Workspaces',
        label: s.title,
        subtitle: 'Open workspace',
        keywords: [s.title],
        icon: BookOpen,
        priority: 20,
        run: () => {
          closePalette();
          navigate(`/section/${s.id}`);
        },
      });
    }

    if (inSection) {
      const hasFs = !!fs;
      list.push(
        {
          id: 'fs-notebook',
          group: 'free-space',
          groupLabel: 'Free Space',
          label: 'Add notebook',
          subtitle: hasFs ? 'Place on canvas' : 'Switching to Free Space…',
          keywords: ['note', 'write'],
          icon: FileText,
          priority: 12,
          disabled: !hasFs,
          disabledHint: 'Open Free Space in a workspace',
          run: () => {
            const h = getFreeSpaceHandlersSnapshot();
            if (!h?.addNotebook) return;
            closePalette();
            h.addNotebook();
          },
        },
        {
          id: 'fs-text',
          group: 'free-space',
          groupLabel: 'Free Space',
          label: 'Add text card',
          subtitle: 'Quick note object',
          keywords: ['note', 'card'],
          icon: StickyNote,
          priority: 13,
          disabled: !hasFs,
          disabledHint: 'Open Free Space in a workspace',
          run: () => {
            const h = getFreeSpaceHandlersSnapshot();
            if (!h?.addTextCard) return;
            closePalette();
            h.addTextCard();
          },
        },
        {
          id: 'fs-calc',
          group: 'free-space',
          groupLabel: 'Free Space',
          label: 'Add calculator',
          subtitle: 'Placeholder — coming soon',
          keywords: ['math'],
          icon: Table2,
          priority: 14,
          disabled: !hasFs,
          disabledHint: 'Open Free Space in a workspace',
          run: () => {
            const h = getFreeSpaceHandlersSnapshot();
            if (!h?.addCalculator) return;
            closePalette();
            h.addCalculator();
          },
        },
        {
          id: 'fs-graph',
          group: 'free-space',
          groupLabel: 'Free Space',
          label: 'Add graph',
          subtitle: 'Placeholder — coming soon',
          keywords: ['chart', 'plot'],
          icon: Table2,
          priority: 15,
          disabled: !hasFs,
          disabledHint: 'Open Free Space in a workspace',
          run: () => {
            const h = getFreeSpaceHandlersSnapshot();
            if (!h?.addGraph) return;
            closePalette();
            h.addGraph();
          },
        },
      );
    }

    return list;
  }, [
    sections,
    recentIdsOrdered,
    lastSession,
    isRecentSession,
    sectionIdFromRoute,
    closePalette,
    navigate,
    openSessionModal,
    freeSpaceVersion,
  ]);

  const filtered = useMemo(() => filterAndSortCommands(query, commands), [commands, query]);

  useEffect(() => {
    if (!paletteOpen) return;
    setActiveIndex(0);
    setQuery('');
    const t = window.setTimeout(() => inputRef.current?.focus(), 10);
    return () => window.clearTimeout(t);
  }, [paletteOpen]);

  useEffect(() => {
    setActiveIndex(i => {
      if (filtered.length === 0) return 0;
      return Math.min(i, filtered.length - 1);
    });
  }, [filtered.length, query]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key !== 'k') return;
      if (isCommandPaletteBlockedTarget(e.target)) return;
      e.preventDefault();
      togglePalette();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePalette]);

  useEffect(() => {
    if (!paletteOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closePalette();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex(i => (filtered.length === 0 ? 0 : (i + 1) % filtered.length));
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex(i =>
          filtered.length === 0 ? 0 : (i - 1 + filtered.length) % filtered.length,
        );
      }
      if (e.key === 'Enter') {
        const item = filtered[activeIndex];
        if (!item || item.disabled) return;
        e.preventDefault();
        item.run();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [paletteOpen, filtered, activeIndex, closePalette]);

  useEffect(() => {
    if (!paletteOpen || !listRef.current) return;
    const row = listRef.current.querySelector<HTMLElement>(`[data-cmd-index="${activeIndex}"]`);
    row?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, paletteOpen]);

  const runIndex = useCallback(
    (idx: number) => {
      const item = filtered[idx];
      if (!item || item.disabled) return;
      item.run();
    },
    [filtered],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, { label: string; items: { item: CommandItem; index: number }[] }>();
    filtered.forEach((item, index) => {
      const key = item.group;
      if (!map.has(key)) map.set(key, { label: item.groupLabel, items: [] });
      map.get(key)!.items.push({ item, index });
    });
    return [...map.entries()];
  }, [filtered]);

  return (
    <>
      {paletteOpen && (
        <div
          className="fixed inset-0 z-[300] flex justify-center pt-[10vh] px-4 pb-8"
          style={{ pointerEvents: 'auto' }}
          role="presentation"
          onMouseDown={e => {
            if (e.target === e.currentTarget) closePalette();
          }}
        >
          <div
            className="absolute inset-0"
            style={{ backgroundColor: 'rgba(2,6,14,0.55)', backdropFilter: 'blur(6px)' }}
            aria-hidden
          />
          <div
            className="relative w-full max-w-[520px] rounded-2xl overflow-hidden flex flex-col max-h-[min(72vh,560px)]"
            data-fw-command-palette-root="1"
            style={{
              backgroundColor: 'rgba(12,16,28,0.92)',
              border: `1px solid ${tokens.cardBorder}`,
              boxShadow: `0 24px 80px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.04) inset`,
              backdropFilter: 'blur(20px) saturate(1.2)',
              animation: 'fwCmdPaletteIn 0.16s ease-out',
            }}
          >
            <div
              className="flex items-center gap-3 px-4 py-3"
              style={{ borderBottom: `1px solid ${tokens.cardBorder}` }}
            >
              <Search className="w-4 h-4 shrink-0" style={{ color: tokens.textGhost }} strokeWidth={2} />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search commands and workspaces…"
                className="flex-1 min-w-0 bg-transparent outline-none text-sm"
                style={{ color: tokens.textPrimary }}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
              />
              <button
                type="button"
                onClick={() => closePalette()}
                className="p-1.5 rounded-lg transition-colors"
                style={{ color: tokens.textGhost }}
                aria-label="Close"
              >
                <X className="w-4 h-4" strokeWidth={2} />
              </button>
            </div>

            <div className="px-3 pt-2 pb-1 flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold tracking-widest uppercase" style={{ color: tokens.textGhost }}>
                Command
              </span>
              <div className="flex items-center gap-2">
                <Kbd>↑↓</Kbd>
                <Kbd>↵</Kbd>
                <Kbd>esc</Kbd>
              </div>
            </div>

            <div ref={listRef} className="flex-1 overflow-y-auto px-2 pb-3 min-h-[200px]">
              {filtered.length === 0 ? (
                <p className="text-sm px-3 py-8 text-center" style={{ color: tokens.textMuted }}>
                  No matches
                </p>
              ) : (
                grouped.map(([groupKey, { label, items }]) => (
                  <div key={groupKey} className="mb-2">
                    <p
                      className="text-[10px] font-bold tracking-[0.16em] uppercase px-2 py-1.5"
                      style={{ color: tokens.textGhost }}
                    >
                      {label}
                    </p>
                    {items.map(({ item, index }) => {
                      const active = index === activeIndex;
                      const Icon = item.icon ?? ChevronRight;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          data-cmd-index={index}
                          disabled={item.disabled}
                          onClick={() => runIndex(index)}
                          onMouseEnter={() => setActiveIndex(index)}
                          className="w-full flex items-start gap-3 px-2.5 py-2 rounded-xl text-left transition-colors disabled:opacity-35 disabled:cursor-not-allowed"
                          style={{
                            backgroundColor: active ? `${tokens.accent}12` : 'transparent',
                            border: active ? `1px solid ${tokens.accent}22` : '1px solid transparent',
                          }}
                        >
                          <div
                            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                            style={{
                              backgroundColor: active ? `${tokens.accent}18` : tokens.wellBg,
                              border: `1px solid ${active ? `${tokens.accent}30` : tokens.cardBorder}`,
                            }}
                          >
                            <Icon
                              className="w-3.5 h-3.5"
                              strokeWidth={2}
                              style={{ color: active ? tokens.accent : tokens.textMuted }}
                            />
                          </div>
                          <div className="flex-1 min-w-0 pt-0.5">
                            <div
                              className="text-[13px] font-medium leading-tight truncate"
                              style={{ color: item.disabled ? tokens.textGhost : tokens.textPrimary }}
                            >
                              {item.label}
                            </div>
                            <div className="text-[11px] leading-snug mt-0.5" style={{ color: tokens.textMuted }}>
                              {item.disabled ? item.disabledHint ?? item.subtitle : item.subtitle}
                            </div>
                          </div>
                          {active && !item.disabled && (
                            <ChevronRight className="w-4 h-4 shrink-0 mt-1.5" style={{ color: tokens.textGhost }} />
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {sessionModalOpen && (
        <SessionModal sections={sections} onClose={() => setSessionModalOpen(false)} />
      )}
    </>
  );
}
