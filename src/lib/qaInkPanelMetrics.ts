/**
 * Pure pass/fail gates for on-device ink QA panel (no ink behavior changes).
 */

import type { StrokeDiagSnapshot } from './handwritingStrokeDiag';

export type InkQaGate = {
  id: string;
  label: string;
  pass: boolean | null;
  detail: string;
};

export function strokeDiagGates(snapshot: StrokeDiagSnapshot | null): InkQaGate[] {
  if (!snapshot) {
    return [{ id: 'stroke', label: 'Last stroke', pass: null, detail: 'draw a stroke' }];
  }

  const pressureSpread =
    snapshot.pressureMin !== null && snapshot.pressureMax !== null
      ? snapshot.pressureMax - snapshot.pressureMin
      : null;

  const dropRate =
    snapshot.moveEvents > 0 ? snapshot.droppedByMinDist / snapshot.moveEvents : null;

  return [
    {
      id: 'sawPen',
      label: 'sawPen',
      pass: snapshot.sawPen,
      detail: snapshot.pointerTypes.join(', ') || '—',
    },
    {
      id: 'pressure',
      label: 'pressure',
      pass:
        pressureSpread !== null
          ? pressureSpread >= 0.15
          : snapshot.sawMouse && !snapshot.sawPen
            ? null
            : false,
      detail:
        pressureSpread !== null
          ? `${snapshot.pressureMin?.toFixed(2) ?? '—'}–${snapshot.pressureMax?.toFixed(2) ?? '—'}`
          : 'no pressure',
    },
    {
      id: 'samplesPerMove',
      label: 'samples/move',
      pass:
        snapshot.moveEvents === 0
          ? null
          : (snapshot.samplesPerMove ?? 0) >= 1.3,
      detail:
        snapshot.samplesPerMove !== null
          ? snapshot.samplesPerMove.toFixed(2)
          : snapshot.moveEvents === 0
            ? 'tap only'
            : '—',
    },
    {
      id: 'lastBatchSize',
      label: 'lastBatch',
      pass: null,
      detail:
        snapshot.lastBatchSize !== null ? String(snapshot.lastBatchSize) : '—',
    },
    {
      id: 'droppedByMinDist',
      label: 'minDist drops',
      pass: dropRate === null ? null : dropRate < 0.25,
      detail: `${snapshot.droppedByMinDist}/${snapshot.moveEvents}`,
    },
    {
      id: 'layoutMismatch',
      label: 'layout Δpx',
      pass:
        snapshot.layoutMismatchPxAtEnd !== null
          ? snapshot.layoutMismatchPxAtEnd <= 2
          : null,
      detail:
        snapshot.layoutMismatchPxAtEnd !== null
          ? String(snapshot.layoutMismatchPxAtEnd)
          : '—',
    },
    {
      id: 'rectStable',
      label: 'rect stable',
      pass: snapshot.rectStableDownToMove,
      detail:
        snapshot.rectStableDownToMove === null
          ? '—'
          : snapshot.rectStableDownToMove
            ? 'yes'
            : 'no',
    },
    {
      id: 'bitmap',
      label: 'bitmap=css',
      pass: snapshot.bitmapMatchesCssAtEnd,
      detail:
        snapshot.bitmapMatchesCssAtEnd === null
          ? '—'
          : snapshot.bitmapMatchesCssAtEnd
            ? 'yes'
            : 'no',
    },
  ];
}

export function gateIndicator(pass: boolean | null): string {
  if (pass === true) return '✓';
  if (pass === false) return '✗';
  return '·';
}

export type InkQaExportPayload = {
  exportedAt: number;
  build: { commit: string; env: 'dev' | 'prod' };
  lastStroke: StrokeDiagSnapshot | null;
  recentStrokes: StrokeDiagSnapshot[];
  gates: InkQaGate[];
};

export function buildInkQaExportPayload(
  commit: string,
  env: 'dev' | 'prod',
  lastStroke: StrokeDiagSnapshot | null,
  recentStrokes: StrokeDiagSnapshot[],
): InkQaExportPayload {
  return {
    exportedAt: Date.now(),
    build: { commit, env },
    lastStroke,
    recentStrokes,
    gates: strokeDiagGates(lastStroke),
  };
}
