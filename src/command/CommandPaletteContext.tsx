import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useSections } from '../hooks/useSections';
import { useDeadlines } from '../hooks/useDeadlines';
import { useSessionContinuity } from '../hooks/useSessionContinuity';
import { useRecentWorkspaces } from '../hooks/useRecentWorkspaces';
import { useAtmosphere } from '../hooks/useAtmosphere';
import { useWorkspaceTheme, mergeAccent } from '../hooks/useWorkspaceTheme';
import type { FreeSpaceCommandHandlers } from './types';
import type { AIWorkspaceHandlers } from './aiWorkspaceHandlersRef';
import type { FocusMode } from '../focusMode/focusModeTypes';
import type { WorkspaceStarterId } from '../workspaceStarter/workspaceStarterTypes';

const freeHandlersRef = { current: null as FreeSpaceCommandHandlers | null };
const aiWorkspaceRef = { current: null as AIWorkspaceHandlers | null };
const focusModeRef = { current: null as FocusModeHandlers | null };
const workspaceStarterRef = { current: null as WorkspaceStarterHandlers | null };

export interface FocusModeHandlers {
  getMode: () => FocusMode | null;
  setMode: (m: FocusMode | null) => void;
}

export function getFocusModeHandlersSnapshot(): FocusModeHandlers | null {
  return focusModeRef.current;
}

export interface WorkspaceStarterHandlers {
  applyStarter: (id: WorkspaceStarterId) => void;
}

export function getWorkspaceStarterHandlersSnapshot(): WorkspaceStarterHandlers | null {
  return workspaceStarterRef.current;
}

export function getFreeSpaceHandlersSnapshot(): FreeSpaceCommandHandlers | null {
  return freeHandlersRef.current;
}

export function getAIWorkspaceHandlersSnapshot(): AIWorkspaceHandlers | null {
  return aiWorkspaceRef.current;
}

export interface CommandPaletteContextValue {
  registerFreeSpace: (handlers: FreeSpaceCommandHandlers | null) => void;
  registerAIWorkspace: (handlers: AIWorkspaceHandlers | null) => void;
  registerFocusMode: (handlers: FocusModeHandlers | null) => void;
  registerWorkspaceStarter: (handlers: WorkspaceStarterHandlers | null) => void;
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
  intelligenceModalOpen: boolean;
  setIntelligenceModalOpen: (v: boolean) => void;
  openIntelligenceModal: () => void;
  aiWorkspaceVersion: number;
  focusModeVersion: number;
  workspaceStarterVersion: number;
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
  const [intelligenceModalOpen, setIntelligenceModalOpen] = useState(false);
  const [freeSpaceVersion, setFreeSpaceVersion] = useState(0);
  const [aiWorkspaceVersion, setAiWorkspaceVersion] = useState(0);
  const [focusModeVersion, setFocusModeVersion] = useState(0);
  const [workspaceStarterVersion, setWorkspaceStarterVersion] = useState(0);

  const registerFreeSpace = useCallback((handlers: FreeSpaceCommandHandlers | null) => {
    freeHandlersRef.current = handlers;
    setFreeSpaceVersion(v => v + 1);
  }, []);

  const registerAIWorkspace = useCallback((handlers: AIWorkspaceHandlers | null) => {
    aiWorkspaceRef.current = handlers;
    setAiWorkspaceVersion(v => v + 1);
  }, []);

  const registerFocusMode = useCallback((handlers: FocusModeHandlers | null) => {
    focusModeRef.current = handlers;
    setFocusModeVersion(v => v + 1);
  }, []);

  const registerWorkspaceStarter = useCallback((handlers: WorkspaceStarterHandlers | null) => {
    workspaceStarterRef.current = handlers;
    setWorkspaceStarterVersion(v => v + 1);
  }, []);

  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);
  const togglePalette = useCallback(() => setPaletteOpen(o => !o), []);

  const openSessionModal = useCallback(() => {
    setPaletteOpen(false);
    setSessionModalOpen(true);
  }, []);

  const openIntelligenceModal = useCallback(() => {
    setPaletteOpen(false);
    setIntelligenceModalOpen(true);
  }, []);

  const sectionIdFromRoute = useMemo(() => {
    const m = location.pathname.match(/^\/section\/([^/]+)/);
    return m?.[1];
  }, [location.pathname]);

  useEffect(() => {
    setPaletteOpen(false);
    setSessionModalOpen(false);
    setIntelligenceModalOpen(false);
  }, [location.pathname]);

  const value = useMemo(
    (): CommandPaletteContextValue => ({
      registerFreeSpace,
      registerAIWorkspace,
      registerFocusMode,
      registerWorkspaceStarter,
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
      intelligenceModalOpen,
      setIntelligenceModalOpen,
      openIntelligenceModal,
      aiWorkspaceVersion,
      focusModeVersion,
      workspaceStarterVersion,
    }),
    [
      registerFreeSpace,
      registerAIWorkspace,
      registerFocusMode,
      registerWorkspaceStarter,
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
      intelligenceModalOpen,
      openIntelligenceModal,
      aiWorkspaceVersion,
      focusModeVersion,
      workspaceStarterVersion,
    ],
  );

  return <CommandPaletteContext.Provider value={value}>{children}</CommandPaletteContext.Provider>;
}

export function useCommandPalette(): CommandPaletteContextValue {
  const ctx = useContext(CommandPaletteContext);
  if (!ctx) throw new Error('useCommandPalette must be used within CommandPaletteProvider');
  return ctx;
}
