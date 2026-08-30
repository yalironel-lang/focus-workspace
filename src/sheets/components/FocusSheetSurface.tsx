import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import type { FocusSheetDocument } from '../domain/FocusSheetDocument';
import { migrateFocusSheetDocument } from '../domain/migrateFocusSheetDocument';
import { isSheetEngineError } from '../domain/sheetEngineErrors';
import { validateFocusSheetDocument } from '../domain/validateFocusSheetDocument';
import { createUniverSpreadsheetEngine } from '../engine/UniverSpreadsheetEngine';
import type { SpreadsheetEngineAdapter } from '../engine/SpreadsheetEngineAdapter';
import { FocusSheetInvalidState } from './FocusSheetInvalidState';
import {
  getActiveSheetEngineCount,
  noteSheetEngineDisposed,
  noteSheetEngineMounted,
  setSheetCellEditing,
} from './sheetEngineLifecycle';
import { registerSheetFlush } from './sheetFlushRegistry';
import {
  createSheetExportScheduler,
  SHEET_EXPORT_DEBOUNCE_MS,
} from './sheetExportScheduler';

export { SHEET_EXPORT_DEBOUNCE_MS };

export type FocusSheetSurfaceProps = {
  objectId: string;
  document: unknown;
  tokens: AtmosphereTokens;
  onDocumentCommit: (document: FocusSheetDocument) => void;
};

export function FocusSheetSurface({
  objectId,
  document: storedDocument,
  tokens,
  onDocumentCommit,
}: FocusSheetSurfaceProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<SpreadsheetEngineAdapter | null>(null);
  const aliveRef = useRef(true);
  const parsed = validateFocusSheetDocument(storedDocument);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'failed'>(
    parsed.ok ? 'loading' : 'failed',
  );
  const [errorReason, setErrorReason] = useState(
    parsed.ok ? '' : parsed.reason,
  );

  const commitRef = useRef(onDocumentCommit);
  commitRef.current = onDocumentCommit;

  const schedulerRef = useRef(
    createSheetExportScheduler({
      exportDocument: () => engineRef.current?.exportDocument() ?? storedDocument,
      commit: (doc) => {
        const next = validateFocusSheetDocument(doc);
        if (next.ok) commitRef.current(next.document);
      },
      isAlive: () => aliveRef.current,
    }),
  );

  useLayoutEffect(() => {
    aliveRef.current = true;
    return registerSheetFlush(objectId, () => {
      schedulerRef.current.flush();
    });
  }, [objectId]);

  useLayoutEffect(() => {
    aliveRef.current = true;
    return () => {
      schedulerRef.current.flush();
      aliveRef.current = false;
      setSheetCellEditing(objectId, false);
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, [objectId]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') schedulerRef.current.flush();
    };
    const onPageHide = () => schedulerRef.current.flush();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, []);

  useEffect(() => {
    if (!parsed.ok) return;
    const el = hostRef.current;
    if (!el) return;
    let cancelled = false;
    const engine = createUniverSpreadsheetEngine();
    engineRef.current = engine;
    noteSheetEngineMounted(objectId);
    setPhase('loading');

    const unsub = engine.onDocumentChanged(() => {
      schedulerRef.current.schedule();
    });
    const unsubEdit = engine.onCellEditingChanged?.((editing) => {
      setSheetCellEditing(objectId, editing);
    });

    void engine
      .mount(el, migrateFocusSheetDocument(parsed.document))
      .then(() => {
        if (cancelled) {
          engine.dispose();
          return;
        }
        setPhase('ready');
        engine.resize();
        if (import.meta.env.DEV) {
          const w = window as unknown as {
            __focusSheetSurfaceEngine?: SpreadsheetEngineAdapter;
            __focusSheetEnginesByObject?: Map<string, SpreadsheetEngineAdapter>;
            __focusSheetActiveEngineCount?: (id?: string) => number;
          };
          w.__focusSheetSurfaceEngine = engine;
          w.__focusSheetEnginesByObject = w.__focusSheetEnginesByObject ?? new Map();
          w.__focusSheetEnginesByObject.set(objectId, engine);
          w.__focusSheetActiveEngineCount = getActiveSheetEngineCount;
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const reason = isSheetEngineError(err)
          ? err.message
          : err instanceof Error
            ? err.message
            : String(err);
        setErrorReason(reason);
        setPhase('failed');
      });

    return () => {
      cancelled = true;
      unsub();
      unsubEdit?.();
      schedulerRef.current.flush();
      setSheetCellEditing(objectId, false);
      if (engineRef.current === engine) {
        engine.dispose();
        engineRef.current = null;
        if (import.meta.env.DEV) {
          const w = window as unknown as {
            __focusSheetSurfaceEngine?: SpreadsheetEngineAdapter;
            __focusSheetEnginesByObject?: Map<string, SpreadsheetEngineAdapter>;
          };
          if (w.__focusSheetSurfaceEngine === engine) w.__focusSheetSurfaceEngine = undefined;
          w.__focusSheetEnginesByObject?.delete(objectId);
        }
      } else {
        engine.dispose();
      }
      noteSheetEngineDisposed(objectId);
    };
  }, [objectId, parsed.ok]);

  useEffect(() => {
    const el = hostRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      engineRef.current?.resize();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [parsed.ok, phase]);

  if (!parsed.ok || phase === 'failed') {
    return (
      <FocusSheetInvalidState
        tokens={tokens}
        reason={errorReason || (!parsed.ok ? parsed.reason : 'Engine failed to mount')}
      />
    );
  }

  return (
    <div
      className="relative h-full w-full min-h-0"
      data-fw-cmd-ignore="1"
      data-fw-sheet-surface="1"
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {phase === 'loading' ? (
        <div
          className="absolute inset-0 z-[1] flex items-center justify-center text-[11px]"
          style={{ color: tokens.textMuted, backgroundColor: `${tokens.cardBg}cc` }}
        >
          Loading Sheet…
        </div>
      ) : null}
      <div
        ref={hostRef}
        className="h-full w-full min-h-[240px]"
        style={{ overflow: 'hidden' }}
        data-fw-sheet-host={objectId}
      />
    </div>
  );
}
