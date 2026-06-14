import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { getGitCommit } from '../../lib/appBuildInfo';
import {
  buildInkQaExportPayload,
  gateIndicator,
  strokeDiagGates,
} from '../../lib/qaInkPanelMetrics';
import { isQaModeEnabled, qaBuildEnvLabel } from '../../lib/qaMode';
import {
  getLastHandwritingStrokeDiag,
  getRecentHandwritingStrokeDiags,
  type StrokeDiagSnapshot,
} from '../../lib/handwritingStrokeDiag';

const STROKE_DIAG_EVENT = 'fw-hw-stroke-diag';

const shellStyle: CSSProperties = {
  position: 'fixed',
  left: 6,
  bottom: 6,
  zIndex: 2147483000,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: 4,
  maxWidth: 'min(92vw, 280px)',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  pointerEvents: 'none',
};

const badgeStyle: CSSProperties = {
  fontSize: 9,
  lineHeight: 1.25,
  letterSpacing: '0.02em',
  color: 'rgba(255,255,255,0.55)',
  background: 'rgba(0,0,0,0.38)',
  padding: '2px 6px',
  borderRadius: 3,
  pointerEvents: 'none',
  userSelect: 'none',
};

const panelStyle: CSSProperties = {
  fontSize: 9,
  lineHeight: 1.35,
  color: 'rgba(255,255,255,0.72)',
  background: 'rgba(0,0,0,0.52)',
  padding: '6px 8px',
  borderRadius: 4,
  pointerEvents: 'auto',
  userSelect: 'none',
  backdropFilter: 'blur(4px)',
};

const rowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 8,
};

const copyBtnStyle: CSSProperties = {
  marginTop: 6,
  fontSize: 9,
  padding: '3px 8px',
  borderRadius: 3,
  border: '1px solid rgba(255,255,255,0.22)',
  background: 'rgba(255,255,255,0.08)',
  color: 'rgba(255,255,255,0.85)',
  cursor: 'pointer',
};

function readQaEnabled(): boolean {
  if (typeof window === 'undefined') return import.meta.env.DEV;
  return isQaModeEnabled({
    dev: import.meta.env.DEV,
    search: window.location.search,
    storage: localStorage,
  });
}

export function QaBuildOverlay() {
  const [qaEnabled, setQaEnabled] = useState(readQaEnabled);
  const [stroke, setStroke] = useState<StrokeDiagSnapshot | null>(() =>
    typeof window !== 'undefined' ? getLastHandwritingStrokeDiag() : null,
  );
  const [copyStatus, setCopyStatus] = useState<'idle' | 'ok' | 'fail'>('idle');

  const commit = getGitCommit();
  const env = qaBuildEnvLabel(import.meta.env.PROD);

  useEffect(() => {
    setQaEnabled(readQaEnabled());
  }, []);

  useEffect(() => {
    const onStroke = (ev: Event) => {
      const detail = (ev as CustomEvent<StrokeDiagSnapshot>).detail;
      setStroke(detail ?? getLastHandwritingStrokeDiag());
    };
    window.addEventListener(STROKE_DIAG_EVENT, onStroke);
    return () => window.removeEventListener(STROKE_DIAG_EVENT, onStroke);
  }, []);

  const gates = useMemo(() => strokeDiagGates(stroke), [stroke]);

  const copyJson = useCallback(async () => {
    const payload = buildInkQaExportPayload(
      commit,
      env,
      stroke ?? getLastHandwritingStrokeDiag(),
      getRecentHandwritingStrokeDiags(),
    );
    const text = JSON.stringify(payload, null, 2);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setCopyStatus('ok');
      } else {
        throw new Error('clipboard unavailable');
      }
    } catch {
      setCopyStatus('fail');
      try {
        window.prompt('Copy QA JSON:', text);
        setCopyStatus('ok');
      } catch {
        /* ignore */
      }
    }
    window.setTimeout(() => setCopyStatus('idle'), 2000);
  }, [commit, env, stroke]);

  if (!qaEnabled) return null;

  return (
    <div style={shellStyle} aria-hidden data-fw-qa-overlay>
      <div style={badgeStyle}>
        {commit} · {env}
      </div>
      <div style={panelStyle}>
        <div style={{ ...rowStyle, marginBottom: 4, opacity: 0.85 }}>
          <span>Ink QA</span>
          <span>{stroke?.gitCommit ?? commit}</span>
        </div>
        {gates.map(gate => (
          <div key={gate.id} style={rowStyle}>
            <span>
              {gateIndicator(gate.pass)} {gate.label}
            </span>
            <span style={{ opacity: 0.8, textAlign: 'right' }}>{gate.detail}</span>
          </div>
        ))}
        <button type="button" style={copyBtnStyle} onClick={() => void copyJson()}>
          {copyStatus === 'ok'
            ? 'Copied'
            : copyStatus === 'fail'
              ? 'Copy QA JSON (manual)'
              : 'Copy QA JSON'}
        </button>
      </div>
    </div>
  );
}
