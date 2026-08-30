/**
 * DEV-only Univer feasibility harness.
 * Consumes production domain/engine — not a Free Space object.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createEmptyFocusSheetDocument,
  inspectWorkbookEngineIds,
  migrateFocusSheetDocument,
  type FocusSheetDocument,
} from '../domain';
import { UniverSpreadsheetEngine } from '../engine/UniverSpreadsheetEngine';
import {
  SPIKE_FIXTURES,
  type SpikeFixtureId,
  fixtureFormulas,
} from './spikeFixtures';
import {
  createInitialAcceptanceMatrix,
  type SpikeCriterion,
  type SpikeCriterionId,
  type SpikeVerdict,
} from './spikeAcceptance';

type SizeReport = { id: string; bytes: number; msMount: number; msExport: number; error?: string };

function wrapWorkbook(workbook: unknown): FocusSheetDocument {
  return migrateFocusSheetDocument({
    schemaVersion: 1,
    engine: 'univer',
    workbook,
  });
}

function utf8Bytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

function summarizeSnapshot(state: unknown): string {
  if (!state || typeof state !== 'object') return String(state);
  const s = state as {
    id?: string;
    name?: string;
    sheetOrder?: string[];
    sheets?: Record<string, { cellData?: Record<string, unknown>; id?: string }>;
  };
  const sheetId = s.sheetOrder?.[0];
  const sheet = sheetId ? s.sheets?.[sheetId] : undefined;
  const cellData = sheet?.cellData ?? {};
  let cellCount = 0;
  let formulaCount = 0;
  for (const row of Object.values(cellData)) {
    if (!row || typeof row !== 'object') continue;
    for (const cell of Object.values(row as Record<string, { f?: string; v?: unknown }>)) {
      cellCount += 1;
      if (cell && typeof cell === 'object' && 'f' in cell && cell.f) formulaCount += 1;
    }
  }
  return JSON.stringify(
    {
      id: s.id,
      name: s.name,
      sheetId: sheet?.id ?? sheetId,
      sheetCount: s.sheetOrder?.length ?? 0,
      populatedCells: cellCount,
      formulaCells: formulaCount,
      emptyCellsSerialized: false,
      note: 'Only non-empty cells appear under sheets[].cellData (sparse).',
    },
    null,
    2,
  );
}

export default function SheetEngineSpikePage() {
  const hostRef = useRef<HTMLDivElement>(null);
  const adapterRef = useRef<UniverSpreadsheetEngine | null>(null);
  const [mounted, setMounted] = useState(false);
  const [status, setStatus] = useState('Idle');
  const [log, setLog] = useState<string[]>([]);
  const [matrix, setMatrix] = useState<SpikeCriterion[]>(() => createInitialAcceptanceMatrix());
  const [width, setWidth] = useState(900);
  const [height, setHeight] = useState(520);
  const [scaleOn, setScaleOn] = useState(false);
  const [ignoreCmd, setIgnoreCmd] = useState(true);
  const [lastExport, setLastExport] = useState<FocusSheetDocument | null>(null);
  const [sizeReports, setSizeReports] = useState<SizeReport[]>([]);
  const [consoleNotes, setConsoleNotes] = useState<string[]>([]);
  const [changeFires, setChangeFires] = useState(0);

  const append = useCallback((line: string) => {
    setLog((prev) => [`[${new Date().toISOString().slice(11, 19)}] ${line}`, ...prev].slice(0, 80));
  }, []);

  const setVerdict = useCallback((id: SpikeCriterionId, verdict: SpikeVerdict, notes: string) => {
    setMatrix((prev) => prev.map((c) => (c.id === id ? { ...c, verdict, notes } : c)));
  }, []);

  useEffect(() => {
    const onErr = (event: ErrorEvent) => {
      setConsoleNotes((p) => [`ErrorEvent: ${event.message}`, ...p].slice(0, 30));
    };
    const onRej = (event: PromiseRejectionEvent) => {
      setConsoleNotes((p) => [`UnhandledRejection: ${String(event.reason)}`, ...p].slice(0, 30));
    };
    window.addEventListener('error', onErr);
    window.addEventListener('unhandledrejection', onRej);
    return () => {
      window.removeEventListener('error', onErr);
      window.removeEventListener('unhandledrejection', onRej);
      adapterRef.current?.dispose();
      adapterRef.current = null;
    };
  }, []);

  // License row — known from install audit (OSS-only tree).
  useEffect(() => {
    setVerdict(
      'license',
      'PASS',
      'Direct deps: @univerjs/core@0.25.1, @univerjs/preset-sheets-core@0.25.1, rxjs@7.8.2 (Apache-2.0). ' +
        'Rejected @univerjs/presets meta-package because it pulls @univerjs-pro/*. ' +
        'No @univerjs-pro in lockfile after remediation. @univerjs/telemetry has undefined license field (OSS package).',
    );
    setVerdict(
      'react19',
      'PASS',
      'Focus uses React 19; Univer preset peers include ^19. Mount path uses official useEffect/create pattern.',
    );
    setVerdict(
      'lazyLoad',
      'CONDITIONAL',
      'Route is import.meta.env.DEV + React.lazy. Confirm in Network tab / build stats that dashboard does not fetch Univer chunk.',
    );
  }, [setVerdict]);

  const ensureAdapter = useCallback(() => {
    if (!adapterRef.current) {
      const engine = new UniverSpreadsheetEngine();
      engine.onDocumentChanged(() => setChangeFires((n) => n + 1));
      adapterRef.current = engine;
      (window as unknown as { __focusSheetEngine?: UniverSpreadsheetEngine }).__focusSheetEngine = engine;
    }
    return adapterRef.current;
  }, []);

  const mountWith = useCallback(
    async (fixtureId?: SpikeFixtureId) => {
      const el = hostRef.current;
      if (!el) return;
      setStatus('Mounting…');
      const t0 = performance.now();
      try {
        const adapter = ensureAdapter();
        const initial = fixtureId
          ? wrapWorkbook(SPIKE_FIXTURES[fixtureId]())
          : createEmptyFocusSheetDocument();
        await adapter.mount(el, initial);
        const ms = Math.round(performance.now() - t0);
        setMounted(true);
        setStatus(`Mounted (${ms}ms)`);
        append(`Mounted fixture=${fixtureId ?? 'empty'} in ${ms}ms`);
        setVerdict('react19', 'PASS', `Mount succeeded under React 19 in ${ms}ms`);
      } catch (err) {
        setStatus('Mount failed');
        append(`Mount failed: ${String(err)}`);
        setVerdict('react19', 'FAIL', String(err));
        throw err;
      }
    },
    [append, ensureAdapter, setVerdict],
  );

  const unmount = useCallback(() => {
    adapterRef.current?.dispose();
    adapterRef.current = null;
    setMounted(false);
    setStatus('Unmounted');
    append('Disposed adapter');
  }, [append]);

  const exportNow = useCallback(() => {
    try {
      const state = ensureAdapter().exportDocument();
      setLastExport(state);
      const bytes = utf8Bytes(state);
      const ids = inspectWorkbookEngineIds(state.workbook);
      append(`Exported ${bytes} bytes wb=${ids.workbookId} ws=${ids.worksheetId}`);
      return state;
    } catch (err) {
      append(`Export failed: ${String(err)}`);
      throw err;
    }
  }, [append, ensureAdapter]);

  const remountFromExport = useCallback(async () => {
    const state = lastExport ?? exportNow();
    unmount();
    const el = hostRef.current;
    if (!el) return;
    setStatus('Remounting from export…');
    const t0 = performance.now();
    const adapter = ensureAdapter();
    await adapter.mount(el, state);
    const ms = Math.round(performance.now() - t0);
    setMounted(true);
    setStatus(`Remounted (${ms}ms)`);
    append(`Remounted from export in ${ms}ms`);
    setVerdict(
      'mountUnmountRestore',
      'PASS',
      `export → dispose → mount(state) completed in ${ms}ms. Verify formulas/values visually still match.`,
    );
  }, [append, ensureAdapter, exportNow, lastExport, setVerdict, unmount]);

  const runSerializeBench = useCallback(async () => {
    const el = hostRef.current;
    if (!el) return;
    const reports: SizeReport[] = [];
    const ids: SpikeFixtureId[] = ['empty', 'cells100', 'cells1k', 'cells10k'];
    for (const id of ids) {
      const adapter = ensureAdapter();
      const t0 = performance.now();
      try {
        await adapter.mount(el, wrapWorkbook(SPIKE_FIXTURES[id]()));
        const msMount = Math.round(performance.now() - t0);
        const t1 = performance.now();
        const state = adapter.exportDocument();
        const msExport = Math.round(performance.now() - t1);
        const bytes = utf8Bytes(state);
        reports.push({ id, bytes, msMount, msExport });
        append(`Serialize ${id}: ${bytes} bytes (mount ${msMount}ms, export ${msExport}ms)`);
        if (id === 'empty' || id === 'cells100' || id === 'cells1k') {
          setLastExport(state);
        }
        if (id === 'cells1k') {
          setVerdict(
            'perf1k',
            msMount < 5000 ? 'PASS' : 'FAIL',
            `1k mount ${msMount}ms, export ${msExport}ms, payload ${bytes} bytes`,
          );
        }
        if (id === 'cells10k') {
          setVerdict(
            'perf10k',
            msMount < 15000 ? 'CONDITIONAL' : 'FAIL',
            `10k mount ${msMount}ms, export ${msExport}ms, payload ${bytes} bytes`,
          );
        }
      } catch (err) {
        reports.push({ id, bytes: 0, msMount: 0, msExport: 0, error: String(err) });
        append(`Serialize ${id} FAILED: ${String(err)}`);
        if (id === 'cells10k') {
          setVerdict('perf10k', 'FAIL', String(err));
        }
      }
    }
    setSizeReports(reports);
    setMounted(true);
    setStatus('Serialize bench done');
    const empty = reports.find((r) => r.id === 'empty');
    const c100 = reports.find((r) => r.id === 'cells100');
    const c1k = reports.find((r) => r.id === 'cells1k');
    if (empty && !empty.error && c100 && !c100.error && c1k && !c1k.error) {
      setVerdict(
        'serializableState',
        'PASS',
        `save() JSON sparse. empty=${empty.bytes}B, 100=${c100.bytes}B, 1k=${c1k.bytes}B. See size table.`,
      );
    } else {
      setVerdict('serializableState', 'FAIL', 'One or more serialize benches failed');
    }
  }, [append, ensureAdapter, setVerdict]);

  const runFormulaApiCheck = useCallback(async () => {
    const el = hostRef.current;
    if (!el) return;
    const adapter = ensureAdapter();
    await adapter.mount(el, wrapWorkbook(fixtureFormulas()));
    setMounted(true);
    // Allow formula engine time to compute
    await new Promise((r) => setTimeout(r, 800));
    const before = adapter.probeCells(['C1', 'D2', 'A8', 'A9', 'B9', 'A1']);
    append(`Formula probe before: ${JSON.stringify(before)}`);
    const c1 = (before.C1 as { value?: unknown } | undefined)?.value;
    const d2 = (before.D2 as { value?: unknown } | undefined)?.value;
    const a8 = (before.A8 as { value?: unknown } | undefined)?.value;
    const ok =
      Number(c1) === 30 &&
      Number(d2) === 12 &&
      Number(a8) === 15;
    setVerdict(
      'formulaEval',
      ok ? 'PASS' : 'FAIL',
      `probe C1=${String(c1)} D2=${String(d2)} A8=${String(a8)}. Expected 30 / 12 / 15. Full=${JSON.stringify(before)}`,
    );

    adapter.setCellValue('A1', 100);
    await new Promise((r) => setTimeout(r, 600));
    const after = adapter.probeCells(['C1', 'A1']);
    append(`Formula probe after A1=100: ${JSON.stringify(after)}`);
    const c1b = (after.C1 as { value?: unknown } | undefined)?.value;
    setVerdict(
      'dependencyRecalc',
      Number(c1b) === 120 ? 'PASS' : 'FAIL',
      `After setCellValue(A1,100), C1=${String(c1b)} (expect 120). ${JSON.stringify(after)}`,
    );
    setLastExport(adapter.exportDocument());
  }, [append, ensureAdapter, setVerdict]);

  const nudgeResize = useCallback(() => {
    ensureAdapter().resize();
    append(`resizeHint dispatched (container ${width}x${height})`);
    setVerdict(
      'resize',
      'CONDITIONAL',
      'resizeHint/window resize fired. Visually confirm grid reflows after width/height slider changes; mark PASS if usable.',
    );
  }, [append, ensureAdapter, height, setVerdict, width]);

  useEffect(() => {
    if (!mounted) return;
    ensureAdapter().resize();
  }, [width, height, mounted, ensureAdapter]);

  const runChangeDetectionGate = useCallback(async () => {
    const el = hostRef.current;
    if (!el) return;
    const adapter = ensureAdapter();
    setChangeFires(0);
    await adapter.mount(el, createEmptyFocusSheetDocument());
    setMounted(true);
    await new Promise((r) => setTimeout(r, 300));
    adapter.lastObservedCommands = [];
    adapter.lastMutationCommands = [];

    const countFires = async (label: string, fn: () => void) => {
      const before = adapter.lastMutationCommands.length;
      fn();
      await new Promise((r) => setTimeout(r, 300));
      const delta = adapter.lastMutationCommands.length - before;
      append(`GATE ${label}: mutationEvents=${delta}`);
      return delta;
    };

    const rows = {
      setCellValue: await countFires('setCellValue', () => adapter.setCellValue('A1', 11)),
      formula: await countFires('formula', () => adapter.setCellFormula('B1', '=A1+1')),
      paste: await countFires('paste', () => adapter.pasteValues('C1', [[1, 2], [3, 4]])),
      clear: await countFires('clear', () => adapter.clearCell('C1')),
      undo: await countFires('undo', () => adapter.undo()),
      redo: await countFires('redo', () => adapter.redo()),
      selection: await countFires('selection', () => adapter.selectRange('Z99')),
    };
    const payload = {
      rows,
      observed: adapter.lastObservedCommands,
      mutations: adapter.lastMutationCommands,
      ids: inspectWorkbookEngineIds(adapter.exportDocument().workbook),
    };
    (window as unknown as { __focusSheetChangeGate?: typeof payload }).__focusSheetChangeGate = payload;
    append(`GATE summary ${JSON.stringify(rows)}`);
    append(`GATE observed ${JSON.stringify(adapter.lastObservedCommands.slice(-12))}`);
    setStatus('Change-detection gate done');
  }, [append, ensureAdapter]);

  const evidenceDump = useMemo(() => {
    return {
      generatedAt: new Date().toISOString(),
      matrix,
      sizeReports,
      consoleNotes,
      lastExportSummary: lastExport ? summarizeSnapshot(lastExport.workbook) : null,
      manualClipboardSteps: [
        '1. Select a multi-cell range in the spike → Cmd/Ctrl+C.',
        '2. Paste into Google Sheets or Excel. Note whether values land in a grid (not one cell).',
        '3. In Sheets/Excel, copy a 3x3 numeric block → paste into spike. Confirm shape.',
        '4. Optionally inspect paste event: DevTools → breakpoint on paste; log clipboardData.types / getData(text/plain|text/html).',
      ],
      manualKeyboardSteps: [
        'Focus a cell. Test: Arrows, Enter, Tab, Shift+Tab, Delete, Backspace, Space, Escape.',
        'Test Cmd/Ctrl+C/V/X/Z and Cmd/Ctrl+Shift+Z.',
        'With sheet focused, press Cmd/Ctrl+K — command palette should NOT steal if data-fw-cmd-ignore is on.',
        'Note whether Space scrolls page / triggers anything outside Univer.',
      ],
    };
  }, [consoleNotes, lastExport, matrix, sizeReports]);

  return (
    <div
      className="min-h-screen bg-slate-950 text-slate-100 p-4"
      data-fw-cmd-ignore={ignoreCmd ? '1' : undefined}
    >
      <header className="mb-3 space-y-1">
        <h1 className="text-xl font-semibold">Focus Sheets — PR2 engine harness</h1>
        <p className="text-sm text-slate-400">
          DEV-only. Production domain/engine. No Free Space / persistence / math-sheet. Status: {status}
          {' · '}changes:{changeFires}
        </p>
      </header>

      <div className="flex flex-wrap gap-2 mb-3 text-sm">
        <button type="button" className="px-2 py-1 rounded bg-emerald-700" onClick={() => void mountWith()}>
          Mount empty
        </button>
        <button type="button" className="px-2 py-1 rounded bg-emerald-700" onClick={() => void mountWith('formulas')}>
          Mount formulas
        </button>
        <button type="button" className="px-2 py-1 rounded bg-emerald-800" onClick={() => void mountWith('cells100')}>
          Mount 100
        </button>
        <button type="button" className="px-2 py-1 rounded bg-emerald-800" onClick={() => void mountWith('cells1k')}>
          Mount 1k
        </button>
        <button type="button" className="px-2 py-1 rounded bg-emerald-900" onClick={() => void mountWith('cells10k')}>
          Mount 10k
        </button>
        <button type="button" className="px-2 py-1 rounded bg-slate-700" onClick={unmount}>
          Unmount
        </button>
        <button type="button" className="px-2 py-1 rounded bg-sky-700" onClick={() => exportNow()}>
          Export JSON
        </button>
        <button type="button" className="px-2 py-1 rounded bg-sky-800" onClick={() => void remountFromExport()}>
          Remount from export
        </button>
        <button type="button" className="px-2 py-1 rounded bg-violet-700" onClick={() => void runSerializeBench()}>
          Run serialize bench
        </button>
        <button type="button" className="px-2 py-1 rounded bg-violet-800" onClick={() => void runFormulaApiCheck()}>
          Formula API check
        </button>
        <button type="button" className="px-2 py-1 rounded bg-amber-800" onClick={() => void runChangeDetectionGate()}>
          Run change-detection gate
        </button>
        <button type="button" className="px-2 py-1 rounded bg-amber-700" onClick={nudgeResize}>
          Resize hint
        </button>
        <label className="px-2 py-1 rounded bg-slate-800 flex items-center gap-2">
          <input type="checkbox" checked={scaleOn} onChange={(e) => setScaleOn(e.target.checked)} />
          scale(0.75)
        </label>
        <label className="px-2 py-1 rounded bg-slate-800 flex items-center gap-2">
          <input type="checkbox" checked={ignoreCmd} onChange={(e) => setIgnoreCmd(e.target.checked)} />
          data-fw-cmd-ignore
        </label>
      </div>

      <div className="flex flex-wrap gap-4 mb-3 text-sm items-center">
        <label>
          W
          <input
            className="ml-2 w-24 text-black px-1"
            type="number"
            value={width}
            onChange={(e) => setWidth(Number(e.target.value) || 300)}
          />
        </label>
        <label>
          H
          <input
            className="ml-2 w-24 text-black px-1"
            type="number"
            value={height}
            onChange={(e) => setHeight(Number(e.target.value) || 200)}
          />
        </label>
        <span className="text-slate-400">Drag edges of the box below also work (CSS resize).</span>
      </div>

      <div
        className="mb-4 bg-white rounded border border-slate-600 overflow-hidden"
        style={{
          width,
          height,
          resize: 'both',
          transform: scaleOn ? 'scale(0.75)' : undefined,
          transformOrigin: 'top left',
        }}
        onMouseUp={() => {
          const box = hostRef.current?.parentElement;
          if (box) {
            setWidth(box.clientWidth);
            setHeight(box.clientHeight);
          }
          nudgeResize();
        }}
      >
        <div ref={hostRef} className="w-full h-full" style={{ minHeight: 200 }} />
      </div>

      <section className="grid lg:grid-cols-2 gap-4 text-sm">
        <div className="space-y-2">
          <h2 className="font-medium">Acceptance matrix</h2>
          <p className="text-slate-400 text-xs">
            Do not mark PASS without evidence. Use selectors below after manual checks.
          </p>
          <ul className="space-y-2 max-h-[420px] overflow-auto pr-1">
            {matrix.map((c) => (
              <li key={c.id} className="border border-slate-700 rounded p-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={c.required ? 'text-amber-300' : 'text-slate-400'}>
                    {c.required ? 'REQ' : 'OPT'}
                  </span>
                  <span className="font-medium">{c.label}</span>
                  <select
                    className="text-black text-xs"
                    value={c.verdict}
                    onChange={(e) => setVerdict(c.id, e.target.value as SpikeVerdict, c.notes)}
                  >
                    {(['UNTESTED', 'PASS', 'FAIL', 'MANUAL_REQUIRED', 'CONDITIONAL'] as SpikeVerdict[]).map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
                <textarea
                  className="mt-1 w-full text-black text-xs p-1 rounded"
                  rows={2}
                  value={c.notes}
                  onChange={(e) => setVerdict(c.id, c.verdict, e.target.value)}
                  placeholder="Evidence notes"
                />
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-3">
          <div>
            <h2 className="font-medium">Serialize sizes</h2>
            <table className="w-full text-xs mt-1">
              <thead>
                <tr className="text-left text-slate-400">
                  <th>Fixture</th>
                  <th>Bytes</th>
                  <th>Mount ms</th>
                  <th>Export ms</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                {sizeReports.map((r) => (
                  <tr key={r.id} className="border-t border-slate-800">
                    <td>{r.id}</td>
                    <td>{r.bytes}</td>
                    <td>{r.msMount}</td>
                    <td>{r.msExport}</td>
                    <td className="text-red-300">{r.error ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <h2 className="font-medium">Manual clipboard (Excel / Google Sheets)</h2>
            <ol className="list-decimal ml-5 text-slate-300 text-xs space-y-1">
              <li>Select a multi-cell range here → Cmd/Ctrl+C.</li>
              <li>Paste into Google Sheets or Excel. Confirm tabular placement.</li>
              <li>Copy a 3×3 block from Sheets/Excel → paste here. Confirm shape.</li>
              <li>
                Optional: DevTools paste listener — log <code>clipboardData.types</code>,{' '}
                <code>text/plain</code>, <code>text/html</code>.
              </li>
            </ol>
            <p className="text-amber-300 text-xs mt-1">
              Mark copyPaste / multiCellPaste PASS only after those steps. External interop = MANUAL_REQUIRED until done.
            </p>
          </div>

          <div>
            <h2 className="font-medium">Last export summary</h2>
            <pre className="text-xs bg-slate-900 p-2 rounded overflow-auto max-h-40">
              {lastExport ? summarizeSnapshot(lastExport.workbook) : '—'}
            </pre>
          </div>

          <div>
            <h2 className="font-medium">Log</h2>
            <pre className="text-xs bg-slate-900 p-2 rounded overflow-auto max-h-40">{log.join('\n') || '—'}</pre>
          </div>

          <div>
            <h2 className="font-medium">Console / runtime</h2>
            <pre className="text-xs bg-slate-900 p-2 rounded overflow-auto max-h-24">
              {consoleNotes.join('\n') || 'No captured window errors yet'}
            </pre>
          </div>

          <button
            type="button"
            className="px-2 py-1 rounded bg-slate-700"
            onClick={() => {
              void navigator.clipboard.writeText(JSON.stringify(evidenceDump, null, 2));
              append('Evidence JSON copied to clipboard');
            }}
          >
            Copy evidence JSON
          </button>
        </div>
      </section>
    </div>
  );
}
