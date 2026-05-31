import { useEffect, useMemo, useState } from 'react';
import type { AtmosphereTokens } from '../../../hooks/useAtmosphere';
import { DESK_GRAPH_DEFAULT } from '../../../lib/mathDesk/types';
import { buildDeskGraphPath, defaultDeskGraphYRange, deskGraphViewBox } from '../../../lib/mathDesk/deskGraphPlot';
import { safeEvaluateAtX, validateGraphExpression } from '../../../lib/safeMathExpr';

export type DeskPlotPaperStatus = 'from_line' | 'last_valid' | 'awaiting' | 'manual';

interface Props {
  tokens: AtmosphereTokens;
  expression: string;
  onExpressionChange: (expr: string) => void;
  onManualEdit?: () => void;
  paperStatus: DeskPlotPaperStatus;
  focusedLinePreview?: string;
}

export function DeskMiniGraph({
  tokens,
  expression,
  onExpressionChange,
  onManualEdit,
  paperStatus,
  focusedLinePreview,
}: Props) {
  const [draft, setDraft] = useState(expression || DESK_GRAPH_DEFAULT.expression);

  useEffect(() => {
    setDraft(expression || DESK_GRAPH_DEFAULT.expression);
  }, [expression]);

  const committed = expression.trim();

  const { pathD, err, xmin, xmax, ymin, ymax, displayExpr } = useMemo(() => {
    if (!committed) {
      return {
        pathD: '',
        err: null as string | null,
        ...DESK_GRAPH_DEFAULT,
        displayExpr: '',
      };
    }
    const v = validateGraphExpression(committed);
    if (!v.ok) {
      return { pathD: '', err: v.error, ...DESK_GRAPH_DEFAULT, displayExpr: committed };
    }
    const xmin = DESK_GRAPH_DEFAULT.xmin;
    const xmax = DESK_GRAPH_DEFAULT.xmax;
    const fit = defaultDeskGraphYRange(v.normalized, xmin, xmax);
    const ymin = fit.ymin;
    const ymax = fit.ymax;
    const mid = (xmin + xmax) / 2;
    const probe = safeEvaluateAtX(v.normalized, mid);
    if (!probe.ok) {
      return { pathD: '', err: probe.error, xmin, xmax, ymin, ymax, displayExpr: v.normalized };
    }
    return {
      pathD: buildDeskGraphPath(v.normalized, xmin, xmax, ymin, ymax),
      err: null as string | null,
      xmin,
      xmax,
      ymin,
      ymax,
      displayExpr: v.normalized,
    };
  }, [committed]);

  const { w, h, pad } = deskGraphViewBox();

  const commit = () => {
    const v = validateGraphExpression(draft);
    if (!v.ok) return;
    onManualEdit?.();
    onExpressionChange(v.normalized);
  };

  const statusMessage = (() => {
    if (paperStatus === 'from_line' && focusedLinePreview) {
      return `From line: ${focusedLinePreview.trim().slice(0, 48)}${focusedLinePreview.length > 48 ? '…' : ''}`;
    }
    if (paperStatus === 'last_valid') {
      return 'Current line isn’t graphable — showing last plot.';
    }
    if (paperStatus === 'awaiting') {
      return 'Select a graphable line.';
    }
    if (paperStatus === 'manual') {
      return 'Manual expression';
    }
    return null;
  })();

  const showNeutralOnly = paperStatus === 'awaiting' && !committed;

  return (
    <div className="desk-tool-panel desk-tool-panel--plot">
      <div className="desk-tool-panel__header">
        <span className="desk-tool-panel__title">Plot</span>
        {paperStatus === 'from_line' ? (
          <span className="desk-tool-panel__badge">from line</span>
        ) : null}
      </div>
      {statusMessage ? (
        <p
          className={`desk-tool-plot__status${
            paperStatus === 'awaiting' ? ' desk-tool-plot__status--neutral' : ''
          }`}
        >
          {statusMessage}
        </p>
      ) : null}
      <label className="desk-tool-plot__label">
        Expression in x
        <input
          type="text"
          className="desk-tool-plot__input"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
            }
          }}
          onBlur={commit}
          placeholder="y = x^2, sin(x)"
          autoComplete="off"
          spellCheck={false}
          style={{ color: tokens.textPrimary, borderColor: tokens.cardBorder }}
        />
      </label>
      {showNeutralOnly ? (
        <p className="desk-tool-plot__status desk-tool-plot__status--neutral">
          Try lines like <code>y=x^2</code> or <code>sin(x)</code> on the paper.
        </p>
      ) : null}
      {err && !showNeutralOnly ? <div className="desk-tool-plot__error">{err}</div> : null}
      {!showNeutralOnly ? (
        <div className="desk-tool-plot__chart-wrap">
          {displayExpr ? (
            <div className="desk-tool-plot__expr-chip" title={displayExpr}>
              y = {displayExpr}
            </div>
          ) : null}
          <svg viewBox={`0 0 ${w} ${h}`} className="desk-tool-plot__chart" aria-label="Function plot">
            {xmin <= 0 && xmax >= 0 ? (
              <line
                x1={pad + ((0 - xmin) / (xmax - xmin)) * (w - pad * 2)}
                y1={pad}
                x2={pad + ((0 - xmin) / (xmax - xmin)) * (w - pad * 2)}
                y2={h - pad}
                stroke="rgba(180,170,160,0.4)"
                strokeWidth={1}
              />
            ) : null}
            {ymin <= 0 && ymax >= 0 ? (
              <line
                x1={pad}
                y1={pad + (h - pad * 2) - ((0 - ymin) / (ymax - ymin)) * (h - pad * 2)}
                x2={w - pad}
                y2={pad + (h - pad * 2) - ((0 - ymin) / (ymax - ymin)) * (h - pad * 2)}
                stroke="rgba(180,170,160,0.4)"
                strokeWidth={1}
              />
            ) : null}
            {pathD ? (
              <path
                d={pathD}
                fill="none"
                stroke={tokens.accent}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ) : null}
          </svg>
        </div>
      ) : null}
    </div>
  );
}
