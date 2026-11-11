/**
 * Temporary owner-scoped PDF recovery diagnostic panel.
 * Mount only when `isOwnerPdfRecoveryDiagEnabled` is true (staging/DEV + opt-in).
 * Displays status booleans only — never PDF text or identifiers.
 */

import { useCallback, useState } from 'react';
import {
  diagnoseOwnerPdfRecovery,
  type OwnerPdfRecoveryDiagResult,
} from '../../lib/ai/tutor/diagnoseOwnerPdfRecovery';

type Props = {
  sectionId: string;
  sourceObjectId: string;
  pageNumber: number;
};

function StatusLine({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
      <span>{label}</span>
      <strong style={{ fontFamily: 'ui-monospace, monospace' }}>{value}</strong>
    </div>
  );
}

export function OwnerPdfRecoveryDiagPanel({
  sectionId,
  sourceObjectId,
  pageNumber,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<OwnerPdfRecoveryDiagResult | null>(null);

  const run = useCallback(async () => {
    setBusy(true);
    try {
      const next = await diagnoseOwnerPdfRecovery({
        sectionId,
        sourceObjectId,
        pageNumber,
      });
      setResult(next);
    } finally {
      setBusy(false);
    }
  }, [sectionId, sourceObjectId, pageNumber]);

  return (
    <div
      data-testid="owner-pdf-recovery-diag"
      style={{
        margin: 0,
        padding: '8px 10px',
        borderTop: '1px dashed #94a3b8',
        background: 'rgba(248, 250, 252, 0.98)',
        fontSize: 12,
        color: '#334155',
        lineHeight: 1.45,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ fontWeight: 600 }}>PDF recovery diag (owner / staging)</span>
        <button
          type="button"
          onClick={() => void run()}
          disabled={busy}
          style={{
            marginLeft: 'auto',
            padding: '2px 10px',
            borderRadius: 4,
            border: '1px solid #64748b',
            background: '#fff',
            cursor: busy ? 'wait' : 'pointer',
          }}
        >
          {busy ? 'Running…' : `Run page ${pageNumber}`}
        </button>
      </div>
      {result && !result.ok ? (
        <StatusLine label="Status" value={`error:${result.code}`} />
      ) : null}
      {result && result.ok ? (
        <div style={{ display: 'grid', gap: 2 }}>
          <StatusLine label="Source found" value={result.sourceFound ? 'yes' : 'no'} />
          <StatusLine label="Page row found" value={result.pageRowFound ? 'yes' : 'no'} />
          <StatusLine label="Extraction method" value={result.extractionMethod} />
          <StatusLine
            label="Recovered text available"
            value={result.recoveredTextAvailable ? 'yes' : 'no'}
          />
          <StatusLine
            label="Capture recovery usable"
            value={result.captureRecoveryUsable ? 'yes' : 'no'}
          />
          <StatusLine label="Recovery job status" value={result.recoveryJobStatus} />
          <StatusLine label="Mapping valid" value={result.mappingValid ? 'yes' : 'no'} />
          <StatusLine
            label="Detector reasons"
            value={
              result.detectorReasons.length > 0 ? result.detectorReasons.join(',') : '(none)'
            }
          />
          <StatusLine label="Fallback result" value={result.fallbackResult} />
          <StatusLine label="Cause hint" value={result.causeHint} />
        </div>
      ) : null}
    </div>
  );
}
