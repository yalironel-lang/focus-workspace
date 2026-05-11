import { useCallback } from 'react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import type { ProjectObjectContent } from '../../hooks/useSectionFreeSpaceObjects';
import { safeEvaluateExpression } from '../../lib/safeMathExpr';
import { Copy, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

type CalcContent = Extract<ProjectObjectContent, { type: 'calculator' }>;

const MAX_HISTORY = 18;

function formatNum(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const a = Math.abs(n);
  if (a >= 1e10 || (a > 0 && a < 1e-9)) return n.toExponential(5);
  const rounded = Math.round(n * 1e8) / 1e8;
  return String(rounded);
}

interface Props {
  content: CalcContent;
  tokens: AtmosphereTokens;
  onChange: (next: ProjectObjectContent) => void;
}

export function FreeSpaceCalculator({ content, tokens, onChange }: Props) {
  const history = content.history ?? [];

  const runEvaluate = useCallback(() => {
    const raw = content.input.trim();
    if (!raw) return;
    const r = safeEvaluateExpression(raw, {});
    if (!r.ok) {
      toast.error(r.error, { duration: 2200 });
      return;
    }
    const resultStr = formatNum(r.value);
    const nextHist = [{ expr: raw, result: resultStr }, ...history].slice(0, MAX_HISTORY);
    onChange({ type: 'calculator', input: '', history: nextHist });
  }, [content.input, history, onChange]);

  const clearHistory = useCallback(() => {
    onChange({ type: 'calculator', input: content.input, history: [] });
  }, [content.input, onChange]);

  const copyLast = useCallback(() => {
    const last = history[0]?.result;
    if (!last) return;
    void navigator.clipboard.writeText(last).then(
      () => toast.success('Copied'),
      () => toast.error('Could not copy'),
    );
  }, [history]);

  return (
    <div
      className="flex flex-col h-full min-h-[200px] rounded-xl overflow-hidden"
      style={{
        backgroundColor: `${tokens.cardBg}ee`,
        border: `1px solid ${tokens.cardBorder}`,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
      }}
    >
      <div
        className="px-3 py-2 flex items-center justify-between"
        style={{ borderBottom: `1px solid ${tokens.cardBorder}` }}
      >
        <span className="text-[10px] font-bold tracking-[0.14em] uppercase" style={{ color: tokens.textGhost }}>
          Calculator
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={copyLast}
            disabled={!history.length}
            className="p-1 rounded-md disabled:opacity-30"
            style={{ color: tokens.textMuted }}
            title="Copy last result"
          >
            <Copy className="w-3.5 h-3.5" strokeWidth={2} />
          </button>
          <button
            type="button"
            onClick={clearHistory}
            disabled={!history.length}
            className="p-1 rounded-md disabled:opacity-30"
            style={{ color: tokens.textMuted }}
            title="Clear history"
          >
            <Trash2 className="w-3.5 h-3.5" strokeWidth={2} />
          </button>
        </div>
      </div>

      <div className="p-3 flex flex-col gap-2 flex-1 min-h-0">
        <label className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: tokens.textGhost }}>
          Expression
        </label>
        <input
          type="text"
          value={content.input}
          onChange={e => onChange({ type: 'calculator', input: e.target.value, history })}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault();
              runEvaluate();
            }
          }}
          placeholder="e.g. sqrt(16) + 2^3"
          className="w-full rounded-lg px-3 py-2 text-sm outline-none"
          style={{
            backgroundColor: tokens.wellBg,
            border: `1px solid ${tokens.cardBorder}`,
            color: tokens.textPrimary,
          }}
        />
        <p className="text-[10px] leading-snug" style={{ color: tokens.textGhost }}>
          + − × ÷ ^ ( ) · sqrt sin cos tan log ln abs exp · pi · e · Enter
        </p>
        <button
          type="button"
          onClick={runEvaluate}
          className="self-start text-xs font-semibold px-3 py-1.5 rounded-lg"
          style={{ backgroundColor: tokens.accent, color: '#0a0a0b' }}
        >
          Calculate
        </button>

        <div className="flex-1 min-h-[72px] overflow-y-auto mt-1 rounded-lg" style={{ backgroundColor: tokens.wellBg }}>
          {history.length === 0 ? (
            <p className="text-[11px] p-3 italic" style={{ color: tokens.textGhost }}>
              History appears here.
            </p>
          ) : (
            <ul className="p-2 space-y-1.5">
              {history.map((h, i) => (
                <li
                  key={`${h.expr}-${i}`}
                  className="text-[11px] rounded-md px-2 py-1.5"
                  style={{
                    backgroundColor: i === 0 ? `${tokens.accent}12` : 'transparent',
                    border: i === 0 ? `1px solid ${tokens.accent}22` : '1px solid transparent',
                  }}
                >
                  <div style={{ color: tokens.textMuted }} className="font-mono truncate">
                    {h.expr}
                  </div>
                  <div style={{ color: tokens.textPrimary }} className="font-mono font-semibold">
                    = {h.result}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
