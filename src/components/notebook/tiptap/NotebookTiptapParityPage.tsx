/**
 * DEV-only TipTap Notebook visual parity + editable sandbox harness.
 * A: dialect preview | B: TipTap read-only | C: TipTap editable sandbox (memory only)
 * Gated by VITE_NOTEBOOK_TIPTAP_EDITOR / localStorage flag.
 */

import { useMemo, useState, type CSSProperties } from 'react';
import { isNotebookTiptapEditorEnabled } from '../../../lib/notebookTiptap/featureFlag';
import {
  PARITY_FIXTURE_BODY,
  RTL_OBSERVATION_LINES,
  RTL_PHASE_A_FIXTURE_BODY,
} from '../../../lib/notebookTiptap/parityFixture';
import { NotebookDialectPreview } from './NotebookDialectPreview';
import { NotebookTiptapReadonlyViewer } from './NotebookTiptapReadonlyViewer';
import { NotebookTiptapSandboxEditor } from './NotebookTiptapSandboxEditor';

const panelStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  overflow: 'auto',
  maxHeight: 'calc(50vh - 80px)',
  padding: 16,
  borderRadius: 12,
  background: 'rgba(15,23,42,0.92)',
  border: '1px solid rgba(148,163,184,0.18)',
};

const sandboxPanel: CSSProperties = {
  ...panelStyle,
  maxHeight: 'calc(50vh - 40px)',
  marginTop: 12,
};

export default function NotebookTiptapParityPage() {
  const enabled = isNotebookTiptapEditorEnabled();
  const [body, setBody] = useState(PARITY_FIXTURE_BODY);
  const [resetToken, setResetToken] = useState(0);
  const bodySnapshot = useMemo(() => body, [body]);

  if (!enabled) {
    return (
      <div style={{ minHeight: '100vh', padding: 32, color: '#e2e8f0', background: '#0f172a', fontFamily: 'ui-sans-serif, system-ui' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Notebook TipTap shadow parity</h1>
        <p style={{ color: '#94a3b8', maxWidth: 560 }}>
          Feature flag is OFF. The production Notebook editor is unchanged. Enable the shadow
          comparison surface for this DEV page:
        </p>
        <ol style={{ color: '#cbd5e1', lineHeight: 1.8 }}>
          <li>
            DevTools console: <code>localStorage.setItem(&apos;notebookTiptapEditor&apos;, &apos;1&apos;)</code>
          </li>
          <li>Reload this page</li>
          <li>
            Or set <code>VITE_NOTEBOOK_TIPTAP_EDITOR=true</code> in <code>.env.local</code> and restart{' '}
            <code>npm run dev</code>
          </li>
        </ol>
        <p style={{ color: '#64748b', fontSize: 13 }}>
          Disable: <code>localStorage.setItem(&apos;notebookTiptapEditor&apos;, &apos;0&apos;)</code> then reload.
        </p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', padding: 20, color: '#e2e8f0', background: '#020617', fontFamily: 'ui-sans-serif, system-ui' }}>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>
          Notebook TipTap parity + editable sandbox (DEV)
        </h1>
        <p style={{ color: '#94a3b8', margin: '8px 0 0', fontSize: 13, maxWidth: 800 }}>
          A = CE dialect preview · B = TipTap read-only · C = TipTap editable sandbox (memory only).
          Sandbox never writes <code>documentBody</code>, Supabase, or Free Space. Refresh resets to fixture.
        </p>
        <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => {
              setBody(PARITY_FIXTURE_BODY);
              setResetToken(t => t + 1);
            }}
            style={btnStyle}
          >
            Reset fixture (+ sandbox)
          </button>
          <button
            type="button"
            data-nb-load-rtl-fixture="1"
            onClick={() => {
              setBody(RTL_PHASE_A_FIXTURE_BODY);
              setResetToken(t => t + 1);
            }}
            style={btnStyle}
          >
            Load RTL Phase A fixture
          </button>
          <button
            type="button"
            data-nb-load-math-fixture="1"
            onClick={() => {
              setBody('⟨m⟩[{"s":12,"e":15,"t":"m"}]⟨/m⟩he is worth 3/5 today');
              setResetToken(t => t + 1);
            }}
            style={btnStyle}
          >
            Load Inline Math fixture
          </button>
          <span style={{ color: '#64748b', fontSize: 12, alignSelf: 'center' }}>
            RTL Phase A — Auto/LTR/RTL in sandbox toolbar · {RTL_OBSERVATION_LINES.length} mixed samples
          </span>
        </div>
      </header>

      <section
        data-nb-rtl-harness="1"
        style={{
          marginBottom: 12,
          padding: 12,
          borderRadius: 12,
          border: '1px solid rgba(251,191,36,0.35)',
          background: 'rgba(30,41,59,0.75)',
          fontSize: 12,
          color: '#cbd5e1',
        }}
      >
        <strong style={{ color: '#fbbf24' }}>RTL QA harness (DEV)</strong>
        <p style={{ margin: '6px 0 0', color: '#94a3b8' }}>
          Use panel C Dir control (Auto / LTR / RTL). Check Hebrew-only, English-first, Hebrew-first mixed,
          numbers/%, parentheses, inline math isolation, lists, callouts. Direction is not persisted to body.
        </p>
      </section>
      <div style={{ display: 'flex', gap: 12, alignItems: 'stretch' }}>
        <section style={panelStyle} data-nb-parity-pane="ce-preview">
          <h2 style={paneTitle}>A · CE dialect preview</h2>
          <NotebookDialectPreview documentBody={bodySnapshot} />
        </section>
        <section style={panelStyle} data-nb-parity-pane="tiptap-readonly">
          <h2 style={paneTitle}>B · TipTap read-only</h2>
          <NotebookTiptapReadonlyViewer documentBody={bodySnapshot} />
        </section>
      </div>

      <section style={sandboxPanel} data-nb-parity-pane="tiptap-sandbox">
        <h2 style={paneTitle}>C · TipTap editable sandbox (no persistence)</h2>
        <NotebookTiptapSandboxEditor
          initialDocumentBody={bodySnapshot}
          resetToken={resetToken}
        />
      </section>

      <details style={{ marginTop: 16, color: '#94a3b8', fontSize: 12 }}>
        <summary>Fixture documentBody (read-only display)</summary>
        <pre
          style={{
            whiteSpace: 'pre-wrap',
            background: '#0f172a',
            padding: 12,
            borderRadius: 8,
            maxHeight: 240,
            overflow: 'auto',
          }}
        >
          {bodySnapshot}
        </pre>
      </details>
    </div>
  );
}

const paneTitle: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: '#64748b',
  margin: '0 0 12px',
};

const btnStyle: CSSProperties = {
  background: 'rgba(51,65,85,0.8)',
  color: '#e2e8f0',
  border: '1px solid rgba(148,163,184,0.25)',
  borderRadius: 8,
  padding: '6px 12px',
  fontSize: 12,
  cursor: 'pointer',
};
