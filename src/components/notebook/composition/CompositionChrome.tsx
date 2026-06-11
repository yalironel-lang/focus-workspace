import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { AtmosphereTokens } from '../../../hooks/useAtmosphere';
import {
  ensureCoachFirstSeen,
  loadCompositionCoachState,
  mathChipOpacity,
  saveCompositionCoachState,
} from '../../../lib/compositionCoachPrefs';
import { loadCompositionFavorite, saveCompositionFavorite } from '../../../lib/compositionFavoritePrefs';
import { loadCompositionRecents, pushCompositionRecent } from '../../../lib/compositionRecents';
import {
  type CompositionFavoriteId,
  type CompositionStructureId,
  compositionInsertSnippet,
  isMathCapableBlockKind,
  isMathTemplateId,
  isPinnableStructureId,
} from '../../../lib/compositionStructureCatalog';
import { BlockGutterInsert } from './BlockGutterInsert';
import { CaretStructureBubble } from './CaretStructureBubble';
import { CompositionCoach } from './CompositionCoach';
import { MathEntryChip } from './MathEntryChip';
import { MathStructureSheet } from './MathStructureSheet';

export type CompositionChromeProps = {
  tokens: AtmosphereTokens;
  notebookMode: string;
  active: boolean;
  editorMode: 'edit' | 'preview';
  editorRoot: HTMLElement | null;
  writingColumnEl: HTMLElement | null;
  /** Pinned chip host (notebook body viewport); falls back to writing column. */
  chipAnchorEl: HTMLElement | null;
  surfaceFocusBlockId: string | null;
  lastFocusedMathBlockId: string | null;
  focusedBlockKind: string | null;
  showStarterCoach: boolean;
  onInsertSnippet: (snippet: string, blockId?: string | null) => void;
  onApplyTemplate: (
    templateId: 'fraction' | 'exponent' | 'root' | 'integral' | 'limit' | 'sum',
    values: Record<string, string>,
    blockId?: string | null,
  ) => void;
  onInsertEquationBlock: (afterIndex: number) => void;
  onGutterStep: (afterIndex: number) => void;
  onGutterEquation: (afterIndex: number) => void;
  onGutterHandwriting: (afterIndex: number) => void;
  onFocusBlock: (blockId: string) => void;
  onFindFirstEditableBlock: () => string | null;
  blockIndexById: (id: string) => number;
  onCompositionSuccess: () => void;
};

export function useCompositionChromeState(notebookMode: string) {
  const [favoriteId, setFavoriteId] = useState<CompositionFavoriteId>(() =>
    loadCompositionFavorite(notebookMode),
  );
  const [recents, setRecents] = useState<CompositionStructureId[]>(() => loadCompositionRecents());
  const [coachState, setCoachState] = useState(() => loadCompositionCoachState());
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    setCoachState(prev => {
      const next = ensureCoachFirstSeen(prev);
      if (next !== prev) saveCompositionCoachState(next);
      return next;
    });
  }, []);

  const chipOpacity = useMemo(() => mathChipOpacity(coachState), [coachState]);

  const pinFavorite = useCallback((id: CompositionFavoriteId) => {
    saveCompositionFavorite(id);
    setFavoriteId(id);
  }, []);

  const recordInsert = useCallback((id: CompositionStructureId) => {
    const nextRecents = pushCompositionRecent(id);
    setRecents(nextRecents);
    setCoachState(prev => {
      const next = { ...ensureCoachFirstSeen(prev), successfulInsert: true };
      saveCompositionCoachState(next);
      return next;
    });
  }, []);

  const dismissCoach = useCallback(() => {
    setCoachState(prev => {
      const next = { ...ensureCoachFirstSeen(prev), coachDismissed: true };
      saveCompositionCoachState(next);
      return next;
    });
  }, []);

  const markCompositionSuccess = useCallback(() => {
    setCoachState(prev => {
      const next = { ...ensureCoachFirstSeen(prev), successfulInsert: true };
      saveCompositionCoachState(next);
      return next;
    });
  }, []);

  return {
    favoriteId,
    pinFavorite,
    recents,
    recordInsert,
    coachState,
    chipOpacity,
    sheetOpen,
    setSheetOpen,
    dismissCoach,
    markCompositionSuccess,
  };
}

export function CompositionCoachSlot({
  tokens,
  showStarterCoach,
  coachDismissed,
  onDismiss,
}: {
  tokens: AtmosphereTokens;
  showStarterCoach: boolean;
  coachDismissed: boolean;
  onDismiss: () => void;
}) {
  return (
    <CompositionCoach
      tokens={tokens}
      visible={showStarterCoach && !coachDismissed}
      onDismiss={onDismiss}
    />
  );
}

export function CompositionGutter({
  tokens,
  afterIndex,
  onGutterStep,
  onGutterEquation,
  onGutterHandwriting,
}: {
  tokens: AtmosphereTokens;
  afterIndex: number;
  onGutterStep: (i: number) => void;
  onGutterEquation: (i: number) => void;
  onGutterHandwriting: (i: number) => void;
}) {
  return (
    <BlockGutterInsert
      tokens={tokens}
      afterIndex={afterIndex}
      onInsertStep={onGutterStep}
      onInsertEquation={onGutterEquation}
      onInsertHandwriting={onGutterHandwriting}
    />
  );
}

export function CompositionOverlays({
  props,
  favoriteId,
  pinFavorite,
  recents,
  recordInsert,
  chipOpacity,
  sheetOpen,
  setSheetOpen,
}: {
  props: CompositionChromeProps;
  favoriteId: CompositionFavoriteId;
  pinFavorite: (id: CompositionFavoriteId) => void;
  recents: CompositionStructureId[];
  recordInsert: (id: CompositionStructureId) => void;
  chipOpacity: number;
  sheetOpen: boolean;
  setSheetOpen: (v: boolean) => void;
}) {
  const {
    tokens,
    active,
    editorMode,
    editorRoot,
    writingColumnEl,
    chipAnchorEl,
    surfaceFocusBlockId,
    lastFocusedMathBlockId,
    focusedBlockKind,
    onInsertSnippet,
    onApplyTemplate,
    onInsertEquationBlock,
    onFocusBlock,
    onFindFirstEditableBlock,
    blockIndexById,
    onCompositionSuccess,
  } = props;

  const bubbleVisible =
    active &&
    editorMode === 'edit' &&
    surfaceFocusBlockId != null &&
    focusedBlockKind != null &&
    isMathCapableBlockKind(focusedBlockKind) &&
    focusedBlockKind !== 'handwriting';

  const resolveInsertBlockId = useCallback((): string | null => {
    if (surfaceFocusBlockId && focusedBlockKind && isMathCapableBlockKind(focusedBlockKind)) {
      return surfaceFocusBlockId;
    }
    if (lastFocusedMathBlockId) return lastFocusedMathBlockId;
    return onFindFirstEditableBlock();
  }, [surfaceFocusBlockId, focusedBlockKind, lastFocusedMathBlockId, onFindFirstEditableBlock]);

  const guidanceText = useMemo(() => {
    if (surfaceFocusBlockId && focusedBlockKind && isMathCapableBlockKind(focusedBlockKind)) {
      return null;
    }
    if (lastFocusedMathBlockId) return null;
    return 'Tap a line to insert, or we will focus the first editable line.';
  }, [surfaceFocusBlockId, focusedBlockKind, lastFocusedMathBlockId]);

  const insertStructure = useCallback(
    (id: CompositionStructureId) => {
      let targetId = resolveInsertBlockId();
      if (!targetId) {
        targetId = onFindFirstEditableBlock();
        if (targetId) onFocusBlock(targetId);
      }
      if (!targetId) return;

      if (id === 'equation-block') {
        const idx = blockIndexById(targetId);
        if (idx >= 0) onInsertEquationBlock(idx);
        recordInsert(id);
        onCompositionSuccess();
        setSheetOpen(false);
        return;
      }

      if (isMathTemplateId(id)) {
        const templateDefaults: Record<typeof id, Record<string, string>> = {
          fraction: { num: '', den: '' },
          exponent: { base: 'x', exp: 'n' },
          root: { x: 'x' },
          integral: { lo: '0', hi: '1', expr: 'x^2', var: 'x' },
          limit: { var: 'x', to: '0' },
          sum: { i: 'i', lo: '1', hi: 'n', expr: 'i' },
        };
        onApplyTemplate(id, templateDefaults[id], targetId);
      } else {
        onInsertSnippet(compositionInsertSnippet(id), targetId);
      }
      recordInsert(id);
      onCompositionSuccess();
      setSheetOpen(false);
    },
    [
      resolveInsertBlockId,
      surfaceFocusBlockId,
      onFocusBlock,
      blockIndexById,
      onInsertEquationBlock,
      recordInsert,
      onCompositionSuccess,
      setSheetOpen,
      onApplyTemplate,
      onInsertSnippet,
    ],
  );

  const paneRect = writingColumnEl?.getBoundingClientRect() ?? editorRoot?.getBoundingClientRect() ?? null;

  if (!active || editorMode !== 'edit') return null;

  const chipHost = chipAnchorEl ?? writingColumnEl;

  return (
    <>
      {chipHost
        ? createPortal(
            <MathEntryChip
              tokens={tokens}
              opacity={chipOpacity}
              active={sheetOpen || bubbleVisible}
              onOpenSheet={() => setSheetOpen(true)}
            />,
            chipHost,
          )
        : null}
      <CaretStructureBubble
        tokens={tokens}
        visible={bubbleVisible}
        blockId={surfaceFocusBlockId}
        editorRoot={editorRoot}
        favoriteId={favoriteId}
        onInsertFraction={() => {
          const tid = surfaceFocusBlockId ?? lastFocusedMathBlockId;
          if (!tid) return;
          onApplyTemplate('fraction', { num: '', den: '' }, tid);
          recordInsert('fraction');
          onCompositionSuccess();
        }}
        onInsertExponent={() => {
          const tid = surfaceFocusBlockId ?? lastFocusedMathBlockId;
          if (!tid) return;
          onApplyTemplate('exponent', { base: 'x', exp: 'n' }, tid);
          recordInsert('exponent');
          onCompositionSuccess();
        }}
        onInsertSubscript={() => {
          const tid = surfaceFocusBlockId ?? lastFocusedMathBlockId;
          if (!tid) return;
          onInsertSnippet(compositionInsertSnippet('subscript'), tid);
          recordInsert('subscript');
          onCompositionSuccess();
        }}
        onInsertFavorite={() => {
          insertStructure(favoriteId);
        }}
        onInsertStructure={insertStructure}
        onPinFavorite={pinFavorite}
      />
      <MathStructureSheet
        tokens={tokens}
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        recents={recents}
        favoriteId={favoriteId}
        paneRect={paneRect}
        guidanceText={guidanceText}
        onSelect={insertStructure}
        onPinFavorite={id => {
          if (isPinnableStructureId(id)) pinFavorite(id);
        }}
      />
    </>
  );
}
