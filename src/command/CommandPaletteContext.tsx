import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useSections } from '../hooks/useSections';
import { useDeadlines } from '../hooks/useDeadlines';
import { useSessionContinuity } from '../hooks/useSessionContinuity';
import { useRecentWorkspaces } from '../hooks/useRecentWorkspaces';
import { useAtmosphere } from '../hooks/useAtmosphere';
import { useWorkspaceTheme, mergeAccent } from '../hooks/useWorkspaceTheme';
import type { FreeSpaceCommandHandlers } from './types';

const freeHandlersRef = { current: null as FreeSpaceCommandHandlers | null };

export function getFreeSpaceHandlersSnapshot(): FreeSpaceCommandHandlers | null {
  return freeHandlersRef.current;
}

export interface CommandPaletteContextValue {
  registerFreeSpace: (handlers: FreeSpaceCommandHandlers | null) => void;
  paletteOpen: boolean;
  openPalette: () => void;
  closePalette: () => void;
  togglePalette: () => void;
  freeSpaceVersion: number;
  sections: ReturnType<typeof useSections>['sections'];
  deadlines: ReturnType<typeof useDeadlines>['deadlines'];
  recentIdsOrdered: string[];
  lastSession: ReturnType<typeof useSessionContinuity>['lastSession'];
  isRecentSession: boolean;
  tokens: ReturnType<typeof mergeAccent>;
  pathname: string;
  sectionIdFromRoute: string | undefined;
  navigate: ReturnType<typeof useNavigate>;
  openSessionModal: () => void;
  sessionModalOpen: boolean;
  setSessionModalOpen: (v: boolean) => void;
  createSection: ReturnType<typeof useSections>['createSection'];
}

const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(null);

export function CommandPaletteProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { sections, createSection } = useSections();
  const { deadlines } = useDeadlines();
  const continuity = useSessionContinuity();
  const { recentIdsOrdered } = useRecentWorkspaces();
  const { tokens: atmTokens } = useAtmosphere();
  const { design } = useWorkspaceTheme();
  const tokens = mergeAccent(atmTokens, design);

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [sessionModalOpen, setSessionModalOpen] = useState(false);
  const [freeSpaceVersion, setFreeSpaceVersion] = useState(0);

  const registerFreeSpace = useCallback((handlers: FreeSpaceCommandHandlers | null) => {
    freeHandlersRef.current = handlers;
    setFreeSpaceVersion(v => v + 1);
  }, []);

  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);
  const togglePalette = useCallback(() => setPaletteOpen(o => !o), []);

  const openSessionModal = useCallback(() => {
    setPaletteOpen(false);
    setSessionModalOpen(true);
  }, []);

  const sectionIdFromRoute = useMemo(() => {
    const m = location.pathname.match(/^\/section\/([^/]+)/);
    return m?.[1];
  }, [location.pathname]);

  const value = useMemo(
    (): CommandPaletteContextValue => ({
      registerFreeSpace,
      paletteOpen,
      openPalette,
      closePalette,
      togglePalette,
      freeSpaceVersion,
      sections,
      deadlines,
      recentIdsOrdered,
      lastSession: continuity.lastSession,
      isRecentSession: continuity.isRecent,
      tokens,
      pathname: location.pathname,
      sectionIdFromRoute,
      navigate,
      openSessionModal,
      sessionModalOpen,
      setSessionModalOpen,
      createSection,
    }),
    [
      registerFreeSpace,
      paletteOpen,
      freeSpaceVersion,
      sections,
      deadlines,
      recentIdsOrdered,
      continuity.lastSession,
      continuity.isRecent,
      tokens,
      location.pathname,
      sectionIdFromRoute,
      navigate,
      openSessionModal,
      sessionModalOpen,
      createSection,
    ],
  );

  return <CommandPaletteContext.Provider value={value}>{children}</CommandPaletteContext.Provider>;
}

export function useCommandPalette(): CommandPaletteContextValue {
  const ctx = useContext(CommandPaletteContext);
  if (!ctx) throw new Error('useCommandPalette must be used within CommandPaletteProvider');
  return ctx;
}
