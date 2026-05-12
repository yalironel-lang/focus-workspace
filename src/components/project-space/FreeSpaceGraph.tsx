import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type PointerEvent as GraphPointerEvent } from 'react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import type { ProjectObjectContent } from '../../hooks/useSectionFreeSpaceObjects';
import { safeEvaluateAtX, validateGraphExpression } from '../../lib/safeMathExpr';

type GraphContent = Extract<ProjectObjectContent, { type: 'graph' }>;

const PRESETS: { label: string; expression: string }[] = [
  { label: 'y = x', expression: 'x' },
  { label: 'y = x²', expression: 'x^2' },
  { label: 'y = sin(x)', expression: 'sin(x)' },
  { label: 'y = e^x', expression: 'exp(x)' },
];

const W = 300;
const H = 176;
const PAD = 28;
const PLOT_W = W - PAD * 2;
const PLOT_H = H - PAD * 2;

/** Matches `makeDefaults('graph')` in useSectionFreeSpaceObjects. */
const DEFAULT_GRAPH_VIEW = { xmin: -6, xmax: 6, ymin: -4, ymax: 8 } as const;
const MIN_AXIS_SPAN = 1e-10;
const MAX_AXIS_SPAN = 1e5;
const ZOOM_STEP_BUTTON = 1.2;
const ZOOM_STEP_WHEEL = 1.08;

interface Props {
  content: GraphContent;
  tokens: AtmosphereTokens;
  onChange: (next: ProjectObjectContent) => void;
}

function clampRange(xmin: number, xmax: number, ymin: number, ymax: number) {
  let xa = xmin;
  let xb = xmax;
  let ya = ymin;
  let yb = ymax;
  if (xb <= xa) xb = xa + 0.01;
  if (yb <= ya) yb = ya + 0.01;
  return { xmin: xa, xmax: xb, ymin: ya, ymax: yb };
}

/** Hard limits so zoom/pan cannot produce unusable or unstable ranges. */
function clampViewport(xmin: number, xmax: number, ymin: number, ymax: number) {
  let { xmin: xa, xmax: xb, ymin: ya, ymax: yb } = clampRange(xmin, xmax, ymin, ymax);
  let xw = xb - xa;
  let yh = yb - ya;
  if (xw > MAX_AXIS_SPAN) {
    const m = (xa + xb) / 2;
    xa = m - MAX_AXIS_SPAN / 2;
    xb = m + MAX_AXIS_SPAN / 2;
    xw = MAX_AXIS_SPAN;
  }
  if (yh > MAX_AXIS_SPAN) {
    const m = (ya + yb) / 2;
    ya = m - MAX_AXIS_SPAN / 2;
    yb = m + MAX_AXIS_SPAN / 2;
    yh = MAX_AXIS_SPAN;
  }
  if (xw < MIN_AXIS_SPAN) {
    const m = (xa + xb) / 2;
    xa = m - MIN_AXIS_SPAN / 2;
    xb = m + MIN_AXIS_SPAN / 2;
  }
  if (yh < MIN_AXIS_SPAN) {
    const m = (ya + yb) / 2;
    ya = m - MIN_AXIS_SPAN / 2;
    yb = m + MIN_AXIS_SPAN / 2;
  }
  return { xmin: xa, xmax: xb, ymin: ya, ymax: yb };
}

/** `factor` &lt; 1 zooms in (smaller window). Fixed point (cx, cy) in data space. */
function zoomAround(xmin: number, xmax: number, ymin: number, ymax: number, cx: number, cy: number, factor: number) {
  return {
    xmin: cx + (xmin - cx) * factor,
    xmax: cx + (xmax - cx) * factor,
    ymin: cy + (ymin - cy) * factor,
    ymax: cy + (ymax - cy) * factor,
  };
}

/** Map client coords to data (x,y) using plot inner area mapping. */
function clientToData(
  clientX: number,
  clientY: number,
  rect: DOMRect,
  xmin: number,
  xmax: number,
  ymin: number,
  ymax: number,
): { cx: number; cy: number } {
  const lx = rect.left + (PAD / W) * rect.width;
  const rx = rect.left + ((W - PAD) / W) * rect.width;
  const ty = rect.top + (PAD / H) * rect.height;
  const by = rect.top + ((H - PAD) / H) * rect.height;
  const u = Math.min(1, Math.max(0, (clientX - lx) / Math.max(1e-9, rx - lx)));
  const v = Math.min(1, Math.max(0, (clientY - ty) / Math.max(1e-9, by - ty)));
  const cx = xmin + u * (xmax - xmin);
  const cy = ymax - v * (ymax - ymin);
  return { cx, cy };
}

function fitYToCurve(
  expression: string,
  xmin: number,
  xmax: number,
  steps: number,
): { ymin: number; ymax: number } | null {
  let lo = Infinity;
  let hi = -Infinity;
  const dx = (xmax - xmin) / Math.max(2, steps - 1);
  for (let i = 0; i < steps; i++) {
    const x = xmin + dx * i;
    const r = safeEvaluateAtX(expression, x);
    if (!r.ok || !Number.isFinite(r.value)) continue;
    lo = Math.min(lo, r.value);
    hi = Math.max(hi, r.value);
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null;
  const span = hi - lo;
  const pad = span > 1e-12 ? span * 0.12 : Math.max(Math.abs(lo), Math.abs(hi), 1) * 0.15 + 1e-6;
  return { ymin: lo - pad, ymax: hi + pad };
}

function buildPathD(
  expression: string,
  xmin: number,
  xmax: number,
  ymin: number,
  ymax: number,
  steps: number,
): string {
  const { xmin: xa, xmax: xb, ymin: ya, ymax: yb } = clampRange(xmin, xmax, ymin, ymax);
  const plotW = W - PAD * 2;
  const plotH = H - PAD * 2;
  const dx = (xb - xa) / Math.max(2, steps - 1);
  const parts: string[] = [];
  let penUp = true;
  let lastYp: number | null = null;
  const ySpan = yb - ya;
  const jump = ySpan * 0.35;

  for (let i = 0; i < steps; i++) {
    const x = xa + dx * i;
    const r = safeEvaluateAtX(expression, x);
    if (!r.ok) {
      penUp = true;
      lastYp = null;
      continue;
    }
    const y = r.value;
    if (!Number.isFinite(y)) {
      penUp = true;
      lastYp = null;
      continue;
    }
    const xp = PAD + ((x - xa) / (xb - xa)) * plotW;
    const yp = PAD + plotH - ((y - ya) / ySpan) * plotH;
    if (lastYp !== null && Math.abs(yp - lastYp) > jump) {
      penUp = true;
    }
    if (penUp) {
      parts.push(`M ${xp.toFixed(2)} ${yp.toFixed(2)}`);
      penUp = false;
    } else {
      parts.push(`L ${xp.toFixed(2)} ${yp.toFixed(2)}`);
    }
    lastYp = yp;
  }

  return parts.join(' ');
}

export function FreeSpaceGraph({ content, tokens, onChange }: Props) {
  const [exprDraft, setExprDraft] = useState(content.expression);
  const lastCommittedExprRef = useRef<string | null>(null);

  const [rangeDraft, setRangeDraft] = useState({
    xmin: String(content.xmin),
    xmax: String(content.xmax),
    ymin: String(content.ymin),
    ymax: String(content.ymax),
  });

  useEffect(() => {
    setRangeDraft({
      xmin: String(content.xmin),
      xmax: String(content.xmax),
      ymin: String(content.ymin),
      ymax: String(content.ymax),
    });
  }, [content.xmin, content.xmax, content.ymin, content.ymax]);

  useEffect(() => {
    if (lastCommittedExprRef.current !== null && content.expression === lastCommittedExprRef.current) {
      lastCommittedExprRef.current = null;
      return;
    }
    setExprDraft(content.expression);
  }, [content.expression]);

  const patch = useCallback(
    (next: Partial<GraphContent>) => {
      onChange({
        type: 'graph',
        expression: next.expression ?? content.expression,
        xmin: next.xmin ?? content.xmin,
        xmax: next.xmax ?? content.xmax,
        ymin: next.ymin ?? content.ymin,
        ymax: next.ymax ?? content.ymax,
      });
    },
    [onChange, content],
  );

  const { d, err } = useMemo(() => {
    const mid = (content.xmin + content.xmax) / 2;
    const probe = safeEvaluateAtX(content.expression, mid);
    if (!probe.ok) return { d: '', err: probe.error };
    return {
      d: buildPathD(content.expression, content.xmin, content.xmax, content.ymin, content.ymax, 320),
      err: null as string | null,
    };
  }, [content.expression, content.xmin, content.xmax, content.ymin, content.ymax]);

  const draftErr = useMemo(() => {
    const v = validateGraphExpression(exprDraft);
    return v.ok ? null : v.error;
  }, [exprDraft]);

  const axes = useMemo(() => {
    const { xmin: xa, xmax: xb, ymin: ya, ymax: yb } = clampRange(
      content.xmin,
      content.xmax,
      content.ymin,
      content.ymax,
    );
    const plotW = W - PAD * 2;
    const plotH = H - PAD * 2;
    const lines: ReactNode[] = [];
    const gridColor = `${tokens.textGhost}22`;
    const axisColor = `${tokens.textMuted}55`;

    for (let g = 0; g <= 4; g++) {
      const gy = PAD + (plotH / 4) * g;
      lines.push(
        <line key={`h${g}`} x1={PAD} y1={gy} x2={PAD + plotW} y2={gy} stroke={gridColor} strokeWidth={1} />,
      );
    }
    for (let g = 0; g <= 4; g++) {
      const gx = PAD + (plotW / 4) * g;
      lines.push(
        <line key={`v${g}`} x1={gx} y1={PAD} x2={gx} y2={PAD + plotH} stroke={gridColor} strokeWidth={1} />,
      );
    }

    if (xa <= 0 && xb >= 0) {
      const x0 = PAD + ((0 - xa) / (xb - xa)) * plotW;
      lines.push(
        <line key="axisx" x1={x0} y1={PAD} x2={x0} y2={PAD + plotH} stroke={axisColor} strokeWidth={1.2} />,
      );
    }
    if (ya <= 0 && yb >= 0) {
      const y0 = PAD + plotH - ((0 - ya) / (yb - ya)) * plotH;
      lines.push(
        <line key="axisy" x1={PAD} y1={y0} x2={PAD + plotW} y2={y0} stroke={axisColor} strokeWidth={1.2} />,
      );
    }
    return lines;
  }, [content.xmin, content.xmax, content.ymin, content.ymax, tokens.textGhost, tokens.textMuted]);

  const applyRanges = useCallback(() => {
    const p = (s: string, fallback: number) => {
      const n = Number.parseFloat(s);
      return Number.isFinite(n) ? n : fallback;
    };
    const c = clampViewport(
      p(rangeDraft.xmin, content.xmin),
      p(rangeDraft.xmax, content.xmax),
      p(rangeDraft.ymin, content.ymin),
      p(rangeDraft.ymax, content.ymax),
    );
    patch({ xmin: c.xmin, xmax: c.xmax, ymin: c.ymin, ymax: c.ymax });
    setRangeDraft({
      xmin: String(c.xmin),
      xmax: String(c.xmax),
      ymin: String(c.ymin),
      ymax: String(c.ymax),
    });
  }, [rangeDraft, content, patch]);

  const plotInteractRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    xmin: number;
    xmax: number;
    ymin: number;
    ymax: number;
  } | null>(null);
  const [isPanning, setIsPanning] = useState(false);

  const commitViewport = useCallback(
    (r: { xmin: number; xmax: number; ymin: number; ymax: number }) => {
      const c = clampViewport(r.xmin, r.xmax, r.ymin, r.ymax);
      patch(c);
      setRangeDraft({
        xmin: String(c.xmin),
        xmax: String(c.xmax),
        ymin: String(c.ymin),
        ymax: String(c.ymax),
      });
    },
    [patch],
  );

  const viewCenterData = useCallback(
    () => ({
      cx: (content.xmin + content.xmax) / 2,
      cy: (content.ymin + content.ymax) / 2,
    }),
    [content.xmin, content.xmax, content.ymin, content.ymax],
  );

  const zoomInCenter = useCallback(() => {
    const { cx, cy } = viewCenterData();
    const f = 1 / ZOOM_STEP_BUTTON;
    commitViewport(zoomAround(content.xmin, content.xmax, content.ymin, content.ymax, cx, cy, f));
  }, [commitViewport, viewCenterData, content.xmin, content.xmax, content.ymin, content.ymax]);

  const zoomOutCenter = useCallback(() => {
    const { cx, cy } = viewCenterData();
    const f = ZOOM_STEP_BUTTON;
    commitViewport(zoomAround(content.xmin, content.xmax, content.ymin, content.ymax, cx, cy, f));
  }, [commitViewport, viewCenterData, content.xmin, content.xmax, content.ymin, content.ymax]);

  const resetView = useCallback(() => {
    commitViewport({ ...DEFAULT_GRAPH_VIEW });
  }, [commitViewport]);

  const fitCurve = useCallback(() => {
    const expr = content.expression;
    const mid = (content.xmin + content.xmax) / 2;
    if (!safeEvaluateAtX(expr, mid).ok) return;
    const yfit = fitYToCurve(expr, content.xmin, content.xmax, 280);
    if (!yfit) return;
    commitViewport({
      xmin: content.xmin,
      xmax: content.xmax,
      ymin: yfit.ymin,
      ymax: yfit.ymax,
    });
  }, [content.expression, content.xmin, content.xmax, content.ymin, content.ymax, commitViewport]);

  useEffect(() => {
    const el = plotInteractRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const rect = el.getBoundingClientRect();
      const { cx, cy } = clientToData(e.clientX, e.clientY, rect, content.xmin, content.xmax, content.ymin, content.ymax);
      const zoomIn = e.deltaY < 0;
      const factor = zoomIn ? 1 / ZOOM_STEP_WHEEL : ZOOM_STEP_WHEEL;
      const next = zoomAround(content.xmin, content.xmax, content.ymin, content.ymax, cx, cy, factor);
      commitViewport(next);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [content.xmin, content.xmax, content.ymin, content.ymax, commitViewport]);

  const onPlotPointerDown = useCallback(
    (e: GraphPointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
      setIsPanning(true);
      panRef.current = {
        pointerId: e.pointerId,
        startClientX: e.clientX,
        startClientY: e.clientY,
        xmin: content.xmin,
        xmax: content.xmax,
        ymin: content.ymin,
        ymax: content.ymax,
      };
    },
    [content.xmin, content.xmax, content.ymin, content.ymax],
  );

  const onPlotPointerMove = useCallback(
    (e: GraphPointerEvent<HTMLDivElement>) => {
      const p = panRef.current;
      if (!p || p.pointerId !== e.pointerId) return;
      const el = plotInteractRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const dx = e.clientX - p.startClientX;
      const dy = e.clientY - p.startClientY;
      const innerW = (PLOT_W / W) * rect.width;
      const innerH = (PLOT_H / H) * rect.height;
      const xw = p.xmax - p.xmin;
      const yh = p.ymax - p.ymin;
      const dxa = (-dx / Math.max(1e-9, innerW)) * xw;
      const dya = (dy / Math.max(1e-9, innerH)) * yh;
      commitViewport({
        xmin: p.xmin + dxa,
        xmax: p.xmax + dxa,
        ymin: p.ymin + dya,
        ymax: p.ymax + dya,
      });
    },
    [commitViewport],
  );

  const onPlotPointerEnd = useCallback((e: GraphPointerEvent<HTMLDivElement>) => {
    if (panRef.current?.pointerId !== e.pointerId) return;
    panRef.current = null;
    setIsPanning(false);
    try {
      (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  }, []);

  return (
    <div
      className="flex flex-col rounded-xl overflow-hidden"
      style={{
        backgroundColor: `${tokens.cardBg}ee`,
        border: `1px solid ${tokens.cardBorder}`,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
      }}
    >
      <div
        className="px-3 py-2 flex items-center justify-between gap-2"
        style={{ borderBottom: `1px solid ${tokens.cardBorder}` }}
      >
        <span className="text-[10px] font-bold tracking-[0.14em] uppercase" style={{ color: tokens.textGhost }}>
          Graph
        </span>
        <div className="flex flex-wrap gap-1 justify-end">
          {PRESETS.map(pr => (
            <button
              key={pr.label}
              type="button"
              onClick={() => {
                lastCommittedExprRef.current = pr.expression;
                patch({ expression: pr.expression });
                setExprDraft(pr.expression);
              }}
              className="text-[9px] font-semibold px-2 py-0.5 rounded-md"
              style={{
                backgroundColor: tokens.wellBg,
                color: tokens.textMuted,
                border: `1px solid ${tokens.cardBorder}`,
              }}
            >
              {pr.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-3 flex flex-col gap-2">
        <label className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: tokens.textGhost }}>
          y = … (x or X)
        </label>
        <input
          type="text"
          value={exprDraft}
          onChange={e => {
            const next = e.target.value;
            setExprDraft(next);
            const v = validateGraphExpression(next);
            if (v.ok) {
              lastCommittedExprRef.current = v.normalized;
              patch({ expression: v.normalized });
            }
          }}
          placeholder="2x + 1, y = sin x, 3(x+1)…"
          className="w-full rounded-lg px-3 py-2 text-sm outline-none font-mono"
          style={{
            backgroundColor: tokens.wellBg,
            border: `1px solid ${tokens.cardBorder}`,
            color: tokens.textPrimary,
          }}
        />

        <div className="grid grid-cols-4 gap-1.5">
          {(['xmin', 'xmax', 'ymin', 'ymax'] as const).map(key => (
            <div key={key} className="flex flex-col gap-0.5">
              <span className="text-[9px] uppercase" style={{ color: tokens.textGhost }}>
                {key}
              </span>
              <input
                type="text"
                value={rangeDraft[key]}
                onChange={e => setRangeDraft(d => ({ ...d, [key]: e.target.value }))}
                onBlur={applyRanges}
                className="w-full rounded px-1.5 py-1 text-[11px] font-mono outline-none"
                style={{
                  backgroundColor: tokens.wellBg,
                  border: `1px solid ${tokens.cardBorder}`,
                  color: tokens.textSecondary,
                }}
              />
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[9px] font-semibold uppercase tracking-wide" style={{ color: tokens.textGhost }}>
              View
            </span>
            <button
              type="button"
              title="Zoom out"
              onClick={zoomOutCenter}
              className="text-[11px] font-bold px-2 py-0.5 rounded-md leading-none"
              style={{
                backgroundColor: tokens.wellBg,
                color: tokens.textSecondary,
                border: `1px solid ${tokens.cardBorder}`,
              }}
            >
              −
            </button>
            <button
              type="button"
              title="Zoom in"
              onClick={zoomInCenter}
              className="text-[11px] font-bold px-2 py-0.5 rounded-md leading-none"
              style={{
                backgroundColor: tokens.wellBg,
                color: tokens.textSecondary,
                border: `1px solid ${tokens.cardBorder}`,
              }}
            >
              +
            </button>
            <button
              type="button"
              title="Reset axes to default window"
              onClick={resetView}
              className="text-[9px] font-semibold px-2 py-0.5 rounded-md uppercase tracking-wide"
              style={{
                backgroundColor: tokens.wellBg,
                color: tokens.textMuted,
                border: `1px solid ${tokens.cardBorder}`,
              }}
            >
              Reset
            </button>
            <button
              type="button"
              title="Fit vertical range to the curve in the current X window"
              onClick={fitCurve}
              disabled={!!err || !!draftErr}
              className="text-[9px] font-semibold px-2 py-0.5 rounded-md uppercase tracking-wide disabled:opacity-35"
              style={{
                backgroundColor: tokens.wellBg,
                color: tokens.textMuted,
                border: `1px solid ${tokens.cardBorder}`,
              }}
            >
              Fit Y
            </button>
          </div>
          <span className="text-[9px] leading-tight" style={{ color: tokens.textGhost, opacity: 0.72 }}>
            Scroll wheel zooms · drag plot to pan
          </span>
        </div>

        <div
          ref={plotInteractRef}
          data-fw-graph-plot="1"
          className="rounded-lg overflow-hidden select-none"
          style={{
            backgroundColor: tokens.wellBg,
            cursor: isPanning ? 'grabbing' : 'grab',
            touchAction: 'none',
          }}
          onPointerDown={onPlotPointerDown}
          onPointerMove={onPlotPointerMove}
          onPointerUp={onPlotPointerEnd}
          onPointerCancel={onPlotPointerEnd}
        >
          <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
            {axes}
            {d && (
              <path
                d={d}
                fill="none"
                stroke={tokens.accent}
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.92}
              />
            )}
          </svg>
        </div>
        {draftErr && (
          <p className="text-[10px] leading-snug" style={{ color: tokens.textMuted }}>
            {draftErr}
          </p>
        )}
        {!draftErr && err && (
          <p className="text-[10px] leading-snug" style={{ color: tokens.textMuted }}>
            {err}
          </p>
        )}
      </div>
    </div>
  );
}
