/**
 * Workspace Universe — spatial home map of projects (sections).
 * Experimental entry over the flat library; uses existing Free Space stack.
 */
import { useCallback, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, LayoutGrid, Loader2, Plus, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../hooks/useAuth';
import { useSections } from '../hooks/useSections';
import { useAtmosphere } from '../hooks/useAtmosphere';
import { useWorkspaceTheme, mergeAccent } from '../hooks/useWorkspaceTheme';
import { useLivingEnvironment } from '../hooks/useLivingEnvironment';
import { usePerformanceCalm } from '../lib/performanceSafeMode';
import { useUniverseCanvas } from '../hooks/useUniverseCanvas';
import { useUniversePortalPositions } from '../hooks/useUniversePortalPositions';
import { useRecentWorkspaces } from '../hooks/useRecentWorkspaces';
import { FreeformCanvas } from '../components/canvas/FreeformCanvas';
import { FreeSpaceCanvasErrorBoundary } from '../components/canvas/FreeSpaceCanvasErrorBoundary';
import { ProjectPortalBlock } from '../components/universe/ProjectPortalBlock';
import { portalIdForSection, sectionIdFromPortalId } from '../lib/workspaceUniverse/portalIds';
import type { FreeSpaceBlockLite } from '../focusMode/objectRelevance';
import type { WorkspaceNavigationState } from '../lib/workspaceUniverse/types';
import { LIBRARY_ROUTE } from '../lib/workspaceUniverse/types';
function formatLastOpened(iso: string | null): string | undefined {
  if (!iso) return undefined;
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 90_000) return 'Opened just now';
  if (diff < 86_400_000) {
    const h = Math.floor(diff / 3_600_000);
    return h < 1 ? 'Opened recently' : `Opened ${h}h ago`;
  }
  const d = Math.floor(diff / 86_400_000);
  if (d === 1) return 'Opened yesterday';
  return `Opened ${d}d ago`;
}

export function UniversePage() {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { sections, loading, createSection } = useSections();
  const { tokens: atmTokens } = useAtmosphere();
  const { design, global } = useWorkspaceTheme();
  const tokens = mergeAccent(atmTokens, design);
  const universeCanvas = useUniverseCanvas();
  const sectionIds = useMemo(() => sections.map(s => s.id), [sections]);
  const portalPositions = useUniversePortalPositions(sectionIds);
  const { touch, openedAt } = useRecentWorkspaces();
  const performanceCalm = usePerformanceCalm();
  const [selectedPortalId, setSelectedPortalId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const livingEnvironment = useLivingEnvironment(global, tokens, {
    panX: universeCanvas.panX,
    panY: universeCanvas.panY,
    zoom: universeCanvas.zoom,
    selectedId: selectedPortalId,
    focusEditingId: null,
    focusMode: null,
    calmEffects: performanceCalm,
    reduceMotion: false,
    surfaceActive: true,
  });

  const portalBlocks: FreeSpaceBlockLite[] = useMemo(
    () =>
      sections.map(s => ({
        id: portalIdForSection(s.id),
        type: 'portal',
        title: s.title,
      })),
    [sections],
  );

  const sectionsById = useMemo(() => new Map(sections.map(s => [s.id, s])), [sections]);

  const openProject = useCallback(
    (sectionId: string) => {
      touch(sectionId);
      const state: WorkspaceNavigationState = {
        returnTo: 'universe',
        hierarchyLevel: 'project',
        parentSectionId: sectionId,
        subspaceId: 'main',
      };
      navigate(`/section/${sectionId}`, { state });
    },
    [navigate, touch],
  );

  const renderPortal = useCallback(
    (portalId: string) => {
      const sectionId = sectionIdFromPortalId(portalId);
      if (!sectionId) return null;
      const section = sectionsById.get(sectionId);
      if (!section) return null;
      return (
        <ProjectPortalBlock
          section={section}
          tokens={tokens}
          lastOpenedLabel={formatLastOpened(openedAt(sectionId))}
          onOpen={() => openProject(sectionId)}
        />
      );
    },
    [sectionsById, tokens, openedAt, openProject],
  );

  const handleCreateProject = async () => {
    setCreating(true);
    try {
      const section = await createSection('New project');
      if (section) {
        toast.success('Project created');
        openProject(section.id);
      }
    } catch {
      toast.error('Could not create project');
    } finally {
      setCreating(false);
    }
  };

  const canvasState = useMemo(
    () => ({
      zoom: universeCanvas.zoom,
      panX: universeCanvas.panX,
      panY: universeCanvas.panY,
      snapToGrid: false,
      gridSize: 24,
      setViewport: universeCanvas.setViewport,
      setPan: universeCanvas.setPan,
      resetView: universeCanvas.resetView,
      centerView: universeCanvas.centerView,
      toggleSnap: () => {},
    }),
    [universeCanvas],
  );

  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: tokens.pageBg,
        color: tokens.textPrimary,
      }}
    >
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 600,
          flexShrink: 0,
          height: 48,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 18px',
          backgroundColor: tokens.navBg,
          borderBottom: `1px solid ${tokens.divider}`,
        }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <Link
            to={LIBRARY_ROUTE}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-semibold shrink-0"
            style={{
              color: tokens.textSecondary,
              border: `1px solid ${tokens.cardBorder}`,
              backgroundColor: tokens.wellBg,
            }}
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={2.2} />
            Library
          </Link>
          <span style={{ width: 1, height: 18, backgroundColor: tokens.divider }} />
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: tokens.textGhost }}>
              Universe
            </p>
            <p className="text-[13px] font-semibold truncate" style={{ color: tokens.textPrimary }}>
              Workspace Universe
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={creating}
            onClick={() => void handleCreateProject()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-semibold"
            style={{
              backgroundColor: `${tokens.accent}22`,
              color: tokens.accent,
              border: `1px solid ${tokens.accent}44`,
            }}
          >
            {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            New project
          </button>
          <button
            type="button"
            onClick={() => void signOut()}
            className="text-[11px] px-2 py-1 rounded-lg"
            style={{ color: tokens.textMuted }}
          >
            Sign out
          </button>
        </div>
      </header>

      <p
        className="px-5 py-2 text-[11px] shrink-0"
        style={{
          color: tokens.textMuted,
          borderBottom: `1px solid ${tokens.divider}`,
          backgroundColor: `${tokens.wellBg}88`,
        }}
      >
        <Sparkles className="w-3 h-3 inline mr-1.5 opacity-70" />
        Spatial map of your projects — drag regions to arrange. Open a project to enter its workspace.
        <Link to={LIBRARY_ROUTE} className="ml-2 font-semibold" style={{ color: tokens.accent }}>
          List view
        </Link>
      </p>

      <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: tokens.textMuted }} />
          </div>
        ) : sections.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 px-6 text-center">
            <LayoutGrid className="w-10 h-10 opacity-40" style={{ color: tokens.textMuted }} />
            <p style={{ color: tokens.textSecondary }}>No projects yet. Create one to begin your universe.</p>
            <button
              type="button"
              onClick={() => void handleCreateProject()}
              className="px-4 py-2 rounded-xl text-[13px] font-semibold"
              style={{ backgroundColor: tokens.accent, color: '#0a0a0a' }}
            >
              Create first project
            </button>
          </div>
        ) : (
          <FreeSpaceCanvasErrorBoundary tokens={tokens} fillParent>
            <FreeformCanvas
              tokens={tokens}
              fillParent
              canvasBackgroundStyle={livingEnvironment.studio.canvasStyle}
              livingEnvironment={livingEnvironment}
              modules={[]}
              blocks={portalBlocks}
              tools={[]}
              positions={portalPositions.positions}
              canvasState={canvasState}
              designMode
              selectedId={selectedPortalId}
              spatialAmbient
              surfaceActive
              calmEffects={performanceCalm}
              workspaceClarity={livingEnvironment.clarity}
              onSetPos={portalPositions.setPos}
              onSelect={setSelectedPortalId}
              onRemoveModule={() => {}}
              onRemoveBlock={() => toast('Remove projects from the Library list view.')}
              onRemoveTool={() => {}}
              onDuplicateBlock={() => {}}
              onOpenAdd={() => void handleCreateProject()}
              renderModuleContent={renderPortal}
              getLabel={id => {
                const sid = sectionIdFromPortalId(id);
                return sid ? (sectionsById.get(sid)?.title ?? 'Project') : 'Project';
              }}
              spatialMinimapEnabled
            />
          </FreeSpaceCanvasErrorBoundary>
        )}
      </div>
    </div>
  );
}
