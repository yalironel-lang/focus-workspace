import { useCallback, useState, type KeyboardEvent } from 'react';
import type { AtmosphereTokens } from '../../../hooks/useAtmosphere';
import type { DeskComputeHistoryEntry } from '../../../lib/mathDesk/types';
import { safeEvaluateExpression } from '../../../lib/safeMathExpr';

interface Props {
  tokens: AtmosphereTokens;
  history: DeskComputeHistoryEntry[];
  onHistoryChange: (next: DeskComputeHistoryEntry[]) => void;
}

function formatResult(n: number): string {
  if (Math.abs(n) >= 1e6 || (Math.abs(n) > 0 && Math.abs(n) < 1e-4)) return n.toPrecision(6);
  const r = Math.round(n * 1e8) / 1e8;
  return String(r);
}

export function DeskComputeBar({ tokens, history, onHistoryChange }: Props) {
  const [expr, setExpr] = useState('');
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(() => {
    const trimmed = expr.trim();
    if (!trimmed) return;
    const r = safeEvaluateExpression(trimmed);
    if (!r.ok) {
      setError(r.error);
      setLastResult(null);
      return;
    }
    setError(null);
    const result = formatResult(r.value);
    setLastResult(result);
    const entry = { expr: trimmed, result };
    onHistoryChange([...history.filter(h => h.expr !== trimmed), entry].slice(-6));
  }, [expr, history, onHistoryChange]);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      run();
    }
  };

  return (
    <div className="desk-tool-panel desk-tool-panel--calc">
      <div className="desk-tool-panel__header">
        <span className="desk-tool-panel__title">Calculator</span>
        <span className="desk-tool-panel__hint">Enter ↵</span>
      </div>
      <p className="desk-tool-panel__sub">
        Off-paper scratch — use <strong>Check line</strong> on your work.
      </p>
      <label className="desk-tool-calc__label">
        Expression
        <input
          type="text"
          className="desk-tool-calc__input"
          value={expr}
          onChange={e => {
            setExpr(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={onKeyDown}
          placeholder="2*3+5, sqrt(2)"
          autoComplete="off"
          spellCheck={false}
          style={{ color: tokens.textPrimary, borderColor: tokens.cardBorder }}
        />
      </label>
      {error ? <div className="desk-tool-calc__error">{error}</div> : null}
      <div className="desk-tool-calc__result-block" aria-live="polite">
        <span className="desk-tool-calc__result-label">Result</span>
        {lastResult !== null ? (
          <span className="desk-tool-calc__result-value">= {lastResult}</span>
        ) : (
          <span className="desk-tool-calc__result-placeholder">—</span>
        )}
      </div>
      {history.length > 0 ? (
        <div className="desk-tool-calc__history">
          <span className="desk-tool-calc__history-label">Recent</span>
          <ul className="desk-tool-calc__history-list">
            {history
              .slice()
              .reverse()
              .map(h => (
                <li key={`${h.expr}-${h.result}`}>
                  <button
                    type="button"
                    className="desk-tool-calc__history-item"
                    onClick={() => setExpr(h.expr)}
                  >
                    <span className="desk-tool-calc__history-expr">{h.expr}</span>
                    <span className="desk-tool-calc__history-eq">=</span>
                    <span className="desk-tool-calc__history-res">{h.result}</span>
                  </button>
                </li>
              ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
