import { useEffect, useState } from 'react';
import {
  inkPenTraceEntries,
  inkPenTraceGetSurface,
  isInkPenTraceEnabled,
} from '../../lib/inkPenTrace';
import { getNotebookInputPolicyDebugState } from '../../lib/notebookInputPolicy';

/** iPad-visible trace HUD — localStorage inkPenTrace=1 */
export function InkPenTraceHud() {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!isInkPenTraceEnabled()) return;
    const id = window.setInterval(() => setTick(n => n + 1), 350);
    return () => window.clearInterval(id);
  }, []);

  if (!isInkPenTraceEnabled()) return null;

  const s = inkPenTraceGetSurface();
  const policy = getNotebookInputPolicyDebugState();
  const entries = inkPenTraceEntries();
  const last = entries[entries.length - 1];
  void tick;

  return (
    <div
      data-ink-pen-trace-hud="1"
      style={{
        position: 'fixed',
        left: 8,
        bottom: 8,
        zIndex: 100001,
        maxWidth: 340,
        maxHeight: '42vh',
        overflowY: 'auto',
        padding: '8px 10px',
        borderRadius: 8,
        background: 'rgba(0,0,0,0.9)',
        color: '#7ee787',
        fontFamily: 'ui-monospace, Menlo, monospace',
        fontSize: 9,
        lineHeight: 1.4,
        pointerEvents: 'none',
        boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
      }}
    >
      <div style={{ color: '#ffa657', fontWeight: 700, marginBottom: 4 }}>INK PEN TRACE</div>
      <div>build: {String(s.build)}</div>
      <div>v1: {String(s.v1PagesRaw)} enabled={String(s.v1Enabled)}</div>
      <div>pres: {String(s.presentation)} card={String(s.cardMode ?? '—')}</div>
      <div>page: {String(s.pageKind)} inkMode={String(s.showInkMode)}</div>
      <div>
        policy: lastPtr={String(policy.lastPointerType)} blk={String(policy.penBlockActive)}
      </div>
      {last ? (
        <div style={{ marginTop: 6, color: '#79c0ff' }}>
          <div>
            last [{last.kind}] {last.surface}
          </div>
          <div>
            ptr={last.pointerType ?? '—'} in={last.inputType ?? '—'} penBlk={String(last.penBlock)}
          </div>
          <div>nbRoot={String(last.inNbRoot)} {last.detail}</div>
        </div>
      ) : (
        <div style={{ marginTop: 6, color: '#8b949e' }}>Write with Pencil on text…</div>
      )}
      <div style={{ marginTop: 6, color: '#d2a8ff' }}>
        {entries
          .slice(-6)
          .map(e => `${e.kind[0]}:${e.surface.slice(0, 18)} ${e.pointerType ?? e.inputType ?? ''}`)
          .join(' | ')}
      </div>
    </div>
  );
}
