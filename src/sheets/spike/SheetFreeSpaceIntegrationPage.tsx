/**
 * DEV-only: Focus Sheet inside Free Space–style CSS transforms.
 * Also hosts PR 3A.1 hit-testing isolation cases A–E.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useSectionFreeSpaceObjects } from '../../hooks/useSectionFreeSpaceObjects';
import { useSectionBlockPositions } from '../../hooks/useSectionBlockPositions';
import { useSectionCanvasMode } from '../../hooks/useSectionCanvasMode';
import { inspectWorkbookEngineIds } from '../domain/FocusSheetDocument';
import { ProjectSpaceObjectRenderer } from '../../components/project-space/ProjectSpaceObjectRenderer';
import { FreeformCanvas } from '../../components/canvas/FreeformCanvas';
import { useAtmosphere } from '../../hooks/useAtmosphere';

const SECTION_ID = 'debug-sheet-pr3a';
const BOARD_ID = 'main';

type TransformCase = 'translateScale' | 'none' | 'scaleOnly' | 'originCenter' | 'hostSize';
type CanvasHost = 'synthetic' | 'freeform';

function worldStyle(mode: TransformCase, zoom: number): CSSProperties {
  const base: CSSProperties = {
    position: 'absolute',
    inset: 0,
    willChange: 'transform',
  };
  if (mode === 'none' || mode === 'hostSize') {
    return { ...base, transform: 'none' };
  }
  if (mode === 'scaleOnly') {
    return { ...base, transformOrigin: '0 0', transform: `scale(${zoom})` };
  }
  if (mode === 'originCenter') {
    return { ...base, transformOrigin: '50% 50%', transform: `scale(${zoom})` };
  }
  return { ...base, transformOrigin: '0 0', transform: `translate(24px, 24px) scale(${zoom})` };
}

export default function SheetFreeSpaceIntegrationPage() {
  const { tokens } = useAtmosphere();
  const store = useSectionFreeSpaceObjects(SECTION_ID, BOARD_ID, null);
  const positions = useSectionBlockPositions(SECTION_ID, BOARD_ID);
  const canvas = useSectionCanvasMode(SECTION_ID, BOARD_ID);
  const [zoom, setZoom] = useState(1);
  const [transformCase, setTransformCase] = useState<TransformCase>('translateScale');
  const [canvasHost, setCanvasHost] = useState<CanvasHost>('synthetic');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState('Idle');
  const worldRef = useRef<HTMLDivElement>(null);
  const lastPointerRef = useRef<Record<string, unknown> | null>(null);

  const sheets = store.objects.filter((o) => o.type === 'sheet');
  const hostScale = transformCase === 'hostSize' ? zoom : 1;
  const effectiveZoom = canvasHost === 'freeform' ? canvas.zoom : zoom;

  const addSheet = useCallback(() => {
    const obj = store.addObject('sheet');
    positions.initPos(obj.id, { x: 40, y: 40, w: 720, h: 480 });
    setSelectedId(obj.id);
    setStatus(`Created ${obj.id}`);
  }, [store, positions]);

  const duplicateFirst = useCallback(() => {
    const first = sheets[0];
    if (!first) return;
    const dup = store.duplicateObject(first.id);
    if (dup) {
      const p = positions.positions[first.id];
      positions.initPos(dup.id, p ? { x: p.x + 48, y: p.y + 40, w: p.w, h: p.h } : { x: 128, y: 120, w: 720, h: 480 });
      setSelectedId(dup.id);
    }
    setStatus(dup ? `Duplicated ${dup.id}` : 'Duplicate failed');
  }, [sheets, store, positions]);

  const deleteLast = useCallback(() => {
    const last = sheets[sheets.length - 1];
    if (!last) return;
    store.removeObject(last.id);
    positions.removePos(last.id);
    setStatus(`Deleted ${last.id}`);
  }, [sheets, store, positions]);

  const evidence = useMemo(() => {
    return sheets.map((o) => {
      const doc = o.content.type === 'sheet' ? o.content.document : null;
      const ids = doc ? inspectWorkbookEngineIds(doc.workbook) : { workbookId: null, worksheetId: null };
      return { focusId: o.id, title: o.title, ...ids, updatedAt: o.updatedAt };
    });
  }, [sheets]);

  useEffect(() => {
    const onPointer = (ev: PointerEvent) => {
      const canvas = document.querySelector('[id^="univer-sheet-main-canvas"]') as HTMLCanvasElement | null;
      const host = document.querySelector('[data-fw-sheet-host]') as HTMLElement | null;
      const world = (worldRef.current ?? document.querySelector('[data-fw-canvas-world]')) as HTMLElement | null;
      const crect = canvas?.getBoundingClientRect();
      const hrect = host?.getBoundingClientRect();
      lastPointerRef.current = {
        type: ev.type,
        clientX: ev.clientX,
        clientY: ev.clientY,
        pageX: ev.pageX,
        pageY: ev.pageY,
        offsetX: ev.offsetX,
        offsetY: ev.offsetY,
        targetTag: (ev.target as HTMLElement | null)?.tagName,
        targetId: (ev.target as HTMLElement | null)?.id,
        dpr: window.devicePixelRatio,
        zoom: effectiveZoom,
        transformCase,
        canvasHost,
        worldTransform: world ? getComputedStyle(world).transform : null,
        worldOrigin: world ? getComputedStyle(world).transformOrigin : null,
        canvas: canvas
          ? {
              id: canvas.id,
              cssW: canvas.clientWidth,
              cssH: canvas.clientHeight,
              offsetW: canvas.offsetWidth,
              offsetH: canvas.offsetHeight,
              backingW: canvas.width,
              backingH: canvas.height,
              rect: crect
                ? { x: crect.x, y: crect.y, w: crect.width, h: crect.height }
                : null,
            }
          : null,
        host: host
          ? {
              offsetW: host.offsetWidth,
              offsetH: host.offsetHeight,
              rect: hrect
                ? { x: hrect.x, y: hrect.y, w: hrect.width, h: hrect.height }
                : null,
            }
          : null,
        visualFromClient: crect
          ? { x: ev.clientX - crect.left, y: ev.clientY - crect.top }
          : null,
        layoutFromVisual: crect && canvas
          ? {
              x: ((ev.clientX - crect.left) / crect.width) * canvas.offsetWidth,
              y: ((ev.clientY - crect.top) / crect.height) * canvas.offsetHeight,
            }
          : null,
      };
    };
    document.addEventListener('pointerdown', onPointer, true);
    return () => document.removeEventListener('pointerdown', onPointer, true);
  }, [effectiveZoom, transformCase, canvasHost]);

  useEffect(() => {
    (window as unknown as { __focusSheetFs?: unknown }).__focusSheetFs = {
      zoom: effectiveZoom,
      transformCase,
      canvasHost,
      hostScale,
      sheets: evidence,
      objects: store.objects,
      positions: positions.positions,
      selectedId,
      lastPointer: () => lastPointerRef.current,
      setViewport: (z: number, panX?: number, panY?: number) =>
        canvas.setViewport(z, panX ?? canvas.panX, panY ?? canvas.panY),
      setPan: (x: number, y: number) => canvas.setPan(x, y),
      resizeEngine: () => {
        const e = (window as unknown as { __focusSheetSurfaceEngine?: { resize?: () => void } })
          .__focusSheetSurfaceEngine;
        e?.resize?.();
      },
    };
  }, [effectiveZoom, transformCase, canvasHost, hostScale, evidence, store.objects, positions.positions, selectedId, canvas]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4" data-fw-sheet-fs="1">
      <h1 className="text-lg font-semibold mb-2">PR 3A — Sheet in transformed Free Space</h1>
      <p className="text-xs text-slate-400 mb-3">
        Status: {status} · zoom {effectiveZoom.toFixed(2)} · case {transformCase} · host {canvasHost} · sheets {sheets.length}
      </p>
      <div className="flex flex-wrap gap-2 mb-3 text-sm">
        <button type="button" className="px-2 py-1 rounded bg-emerald-700" onClick={addSheet}>Add Sheet</button>
        <button type="button" className="px-2 py-1 rounded bg-slate-700" onClick={duplicateFirst}>Duplicate first</button>
        <button type="button" className="px-2 py-1 rounded bg-rose-800" onClick={deleteLast}>Delete last</button>
        {([0.5, 0.7, 0.85, 1, 1.15, 1.3, 1.5] as const).map((z) => (
          <button
            key={z}
            type="button"
            data-zoom={String(z)}
            className="px-2 py-1 rounded bg-slate-700"
            onClick={() => {
              setZoom(z);
              canvas.setViewport(z, canvas.panX, canvas.panY);
            }}
          >
            Zoom {z}
          </button>
        ))}
        <button type="button" className="px-2 py-1 rounded bg-slate-700" onClick={() => window.location.reload()}>Refresh</button>
        <button
          type="button"
          className="px-2 py-1 rounded bg-slate-700"
          onClick={() => {
            const e = (window as unknown as { __focusSheetSurfaceEngine?: { resize?: () => void } })
              .__focusSheetSurfaceEngine;
            e?.resize?.();
            setStatus('engine.resize()');
          }}
        >
          engine.resize()
        </button>
      </div>
      <div className="flex flex-wrap gap-2 mb-3 text-sm">
        {([
          ['synthetic', 'Synthetic transform'],
          ['freeform', 'Real FreeformCanvas'],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            data-canvas-host={id}
            className={`px-2 py-1 rounded ${canvasHost === id ? 'bg-emerald-800' : 'bg-slate-800'}`}
            onClick={() => {
              setCanvasHost(id);
              if (id === 'freeform') {
                for (const s of sheets) {
                  if (!positions.positions[s.id]) {
                    positions.initPos(s.id, { x: 80, y: 80, w: 720, h: 480 });
                  }
                }
                if (sheets[0]) setSelectedId(sheets[0].id);
              }
            }}
          >
            {label}
          </button>
        ))}
        {([
          ['translateScale', 'C translate+scale'],
          ['none', 'A no transform'],
          ['scaleOnly', 'B scale only'],
          ['originCenter', 'D origin 50%'],
          ['hostSize', 'E host size'],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            data-transform-case={id}
            className={`px-2 py-1 rounded ${transformCase === id ? 'bg-emerald-800' : 'bg-slate-800'}`}
            onClick={() => setTransformCase(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <pre className="text-[10px] mb-3 text-slate-400 overflow-auto max-h-24">{JSON.stringify(evidence, null, 2)}</pre>
      <div
        className="relative overflow-hidden rounded-xl"
        style={{ height: canvasHost === 'freeform' ? 900 : 1100, background: '#0b1220', border: '1px solid #1e293b' }}
        data-fw-sheet-viewport="1"
      >
        {canvasHost === 'freeform' ? (
          <FreeformCanvas
            tokens={tokens}
            fillParent
            modules={[]}
            blocks={store.objects}
            tools={[]}
            positions={positions.positions}
            canvasState={canvas}
            designMode
            selectedId={selectedId}
            onSetPos={(id, pos) => positions.setPos(id, pos)}
            onSelect={(id) => setSelectedId(id)}
            onRemoveModule={() => {}}
            onRemoveBlock={(id) => {
              store.removeObject(id);
              positions.removePos(id);
            }}
            onRemoveTool={() => {}}
            onDuplicateBlock={(id) => {
              const dup = store.duplicateObject(id);
              if (!dup) return;
              const p = positions.positions[id];
              positions.initPos(dup.id, p ? { x: p.x + 48, y: p.y + 40, w: p.w, h: p.h } : { x: 128, y: 120, w: 720, h: 480 });
              setSelectedId(dup.id);
            }}
            onOpenAdd={() => {}}
            renderModuleContent={(id) => {
              const obj = store.objects.find((o) => o.id === id);
              if (!obj) return null;
              return (
                <ProjectSpaceObjectRenderer
                  object={obj}
                  tokens={tokens}
                  onChange={(content) => store.updateObjectContent(obj.id, content)}
                />
              );
            }}
            getLabel={(id) => store.objects.find((o) => o.id === id)?.title ?? 'Sheet'}
          />
        ) : (
        <div ref={worldRef} data-fw-canvas-world data-fw-transform-case={transformCase} style={worldStyle(transformCase, zoom)}>
          {sheets.map((obj, i) => (
            <div
              key={obj.id}
              data-freeform-block={obj.id}
              style={{
                position: 'absolute',
                left: 40 + i * 40,
                top: 40 + i * 40,
                width: 720 * hostScale,
                height: 480 * hostScale,
                isolation: 'isolate',
                overflow: 'hidden',
                borderRadius: 12,
                background: tokens.cardBg,
                border: `1px solid ${tokens.cardBorder}`,
              }}
            >
              <div
                style={{ height: 28, display: 'flex', alignItems: 'center', padding: '0 10px', fontSize: 10, letterSpacing: '0.1em' }}
              >
                {obj.title.toUpperCase()}
              </div>
              <div style={{ height: 'calc(100% - 28px)', minHeight: 0 }}>
                <ProjectSpaceObjectRenderer
                  object={obj}
                  tokens={tokens}
                  onChange={(content) => store.updateObjectContent(obj.id, content)}
                />
              </div>
            </div>
          ))}
        </div>
        )}
      </div>
      <div className="mt-4 flex gap-2">
        <input aria-label="css-isolation-probe" className="px-2 py-1 rounded text-black" defaultValue="probe" />
        <button type="button" className="px-2 py-1 rounded bg-indigo-700">Note-like button</button>
      </div>
    </div>
  );
}
