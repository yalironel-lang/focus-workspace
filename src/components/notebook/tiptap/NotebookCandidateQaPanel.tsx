import React, { useState, useCallback } from 'react';
import type { NotebookQaDiagSnapshot } from '../../../lib/notebookTiptap/candidateQaDiagnostics';

interface Props {
  getSnapshot: () => NotebookQaDiagSnapshot;
  failClosed?: boolean;
}

export const NotebookCandidateQaPanel: React.FC<Props> = ({ getSnapshot, failClosed }) => {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  const handleCopy = useCallback(async () => {
    try {
      const snapshot = getSnapshot();
      const text = JSON.stringify(snapshot, null, 2);

      // 1. Console log
      console.info('[NOTEBOOK-QA-JSON]', snapshot);

      // 2. Global window hook for dev console access
      if (typeof window !== 'undefined') {
        (window as any).__fwNotebookQaSnapshot = () => snapshot;
      }

      // 3. Clipboard copy
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback for non-secure contexts
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }

      setCopied(true);
      setCopyError(null);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      console.error('Failed to copy Notebook QA JSON:', err);
      setCopyError(err instanceof Error ? err.message : String(err));
      setTimeout(() => setCopyError(null), 3000);
    }
  }, [getSnapshot]);

  return (
    <div
      data-nb-candidate-qa-panel="1"
      style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 8,
        padding: '6px 10px',
        marginBottom: 8,
        borderRadius: 6,
        background: failClosed ? 'rgba(239, 68, 68, 0.15)' : 'rgba(30, 41, 59, 0.75)',
        border: `1px solid ${failClosed ? 'rgba(239, 68, 68, 0.4)' : 'rgba(100, 116, 139, 0.3)'}`,
        fontSize: 11,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      }}
    >
      <button
        type="button"
        data-nb-candidate-copy-btn="1"
        onClick={handleCopy}
        style={{
          background: copied
            ? '#10b981'
            : failClosed
            ? '#ef4444'
            : '#f59e0b',
          color: copied ? '#ffffff' : failClosed ? '#ffffff' : '#1e1b4b',
          border: 'none',
          borderRadius: 4,
          padding: '4px 10px',
          fontWeight: 700,
          fontSize: 11,
          letterSpacing: '0.04em',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
          transition: 'background 0.15s ease',
        }}
      >
        <span>{copied ? '✓ COPIED NOTEBOOK QA JSON!' : 'COPY NOTEBOOK QA JSON'}</span>
      </button>

      {failClosed ? (
        <span
          style={{
            color: '#fca5a5',
            fontWeight: 600,
            fontSize: 10,
            letterSpacing: '0.02em',
          }}
        >
          FAIL-CLOSED ACTIVE
        </span>
      ) : null}

      {copyError ? (
        <span style={{ color: '#fca5a5', fontSize: 10 }}>Error: {copyError}</span>
      ) : null}
    </div>
  );
};
