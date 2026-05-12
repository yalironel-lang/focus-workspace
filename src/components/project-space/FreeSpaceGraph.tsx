import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
    const c = clampRange(
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

        <div className="rounded-lg overflow-hidden" style={{ backgroundColor: tokens.wellBg }}>
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
