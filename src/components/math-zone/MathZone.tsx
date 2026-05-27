/**
 * MathZone — math notebook workspace.
 *
 * Model: one content string, two visual states.
 *
 * READING (default):
 *   Content is split line-by-line.
 *   Each line is tested independently with isLikelyMathLine():
 *     true  → centered KaTeX (display mode)
 *     false → readable prose (15px, lineHeight 1.8)
 *              with explicit $…$ inline KaTeX within prose
 *   Empty lines → visual breathing space. Nothing more.
 *
 * WRITING (click anywhere, or when empty):
 *   One transparent textarea — same font/size as reading.
 *   Blur → reading mode.
 *
 * Detection is conservative: isLikelyMathLine() has a PROSE_LEAD
 * filter that rejects lines starting with "the", "let", "note",
 * "at", "so", etc. The student writes freely without fear.
 *
 * Inline math in prose requires explicit $…$ — nothing auto-detected.
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import { renderKatexHtml } from '../../lib/notebookMath';
import { plainMathToLatex, isLikelyMathLine } from '../../lib/mathInputAssistant';

// ── Types ─────────────────────────────────────────────────────────────────────

interface RefCard      { id: string; content: string }
interface ScratchBlock { id: string; content: string }

interface MathZoneData {
  /** Free-form solution text. Lines separated by \n. */
  content:   string;
  refs:      RefCard[];
  scratches: ScratchBlock[];
}

export interface MathZoneProps {
  tokens:       AtmosphereTokens;
  sectionId:    string;
  sectionTitle: string;
  paddingTop?:  number;
}

// ── Persistence ───────────────────────────────────────────────────────────────

function storageKey(id: string) { return `fw_math_v1_${id}`; }

function defaultData(): MathZoneData {
  return { content: '', refs: [], scratches: [] };
}

function loadData(id: string): MathZoneData {
  try {
    const raw = localStorage.getItem(storageKey(id));
    if (!raw) return defaultData();
    const p = JSON.parse(raw) as Record<string, unknown>;

    // Migrate from old block-list formats (steps[] or blocks[])
    let content = '';
    if (typeof p.content === 'string') {
      content = p.content;
    } else if (Array.isArray(p.blocks)) {
      content = (p.blocks as Array<{ text?: string }>)
        .map(b => b.text ?? '').filter(Boolean).join('\n\n');
    } else if (Array.isArray(p.steps)) {
      content = (p.steps as Array<{ text?: string }>)
        .map(s => s.text ?? '').filter(Boolean).join('\n\n');
    }

    return {
      content,
      refs:      Array.isArray(p.refs)      ? (p.refs as RefCard[])          : [],
      scratches: Array.isArray(p.scratches) ? (p.scratches as ScratchBlock[]) : [],
    };
  } catch { return defaultData(); }
}

function useMathZoneData(sectionId: string) {
  const [data, setData] = useState<MathZoneData>(() => loadData(sectionId));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      try { localStorage.setItem(storageKey(sectionId), JSON.stringify(data)); } catch { /* quota */ }
    }, 300);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [data, sectionId]);

  return { data, setData };
}

// ── Dollar-marker parser ──────────────────────────────────────────────────────
// Used for explicit $…$ inline math within prose lines only.

type DollarSeg = { type: 'text' | 'math'; value: string };

function parseDollarMath(text: string): DollarSeg[] {
  const out: DollarSeg[] = [];
  const re = /\$([^$]+)\$/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push({ type: 'text', value: text.slice(last, m.index) });
    out.push({ type: 'math', value: m[1]! });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ type: 'text', value: text.slice(last) });
  return out.length ? out : [{ type: 'text', value: text }];
}

// ── Inline math renderer ──────────────────────────────────────────────────────

function InlineMath({ text, tokens }: { text: string; tokens: AtmosphereTokens }) {
  const parts = useMemo(() => {
    if (!text.includes('$')) return null;
    return parseDollarMath(text);
  }, [text]);

  if (!parts) return <>{text}</>;

  return (
    <>
      {parts.map((seg, i) => {
        if (seg.type === 'text') return <span key={i}>{seg.value}</span>;
        const latex = plainMathToLatex(seg.value);
        const { html, error } = renderKatexHtml(latex, false);
        if (error || !html) {
          return (
            <span key={i} style={{ color: '#f87171', fontFamily: 'monospace', fontSize: '0.88em' }}>
              ${seg.value}$
            </span>
          );
        }
        return (
          <span
            key={i}
            dangerouslySetInnerHTML={{ __html: html }}
            style={{ color: tokens.textPrimary }}
          />
        );
      })}
    </>
  );
}

// ── Line equation ─────────────────────────────────────────────────────────────
// A single line that looks like math → centered KaTeX, uniform 20px padding.

function LineEquation({ text, tokens }: { text: string; tokens: AtmosphereTokens }) {
  const latex = useMemo(() => plainMathToLatex(text), [text]);
  const { html, error } = useMemo(() => renderKatexHtml(latex, true), [latex]);

  return (
    <div style={{
      textAlign:      'center',
      padding:        '20px 0',
      overflowX:      'auto',
      overflowY:      'hidden',
      display:        'flex',
      alignItems:     'center',
      justifyContent: 'center',
    }}>
      {error ? (
        <code style={{ fontSize: 13, color: '#f87171', fontFamily: 'monospace', opacity: 0.8 }}>
          {text}
        </code>
      ) : (
        <div
          dangerouslySetInnerHTML={{ __html: html }}
          style={{ color: tokens.textPrimary }}
        />
      )}
    </div>
  );
}

// ── Document renderer ─────────────────────────────────────────────────────────
// Renders content line-by-line. Each line is independently classified.
// Empty lines → breathing space. No paragraph-group logic.

function RenderedDocument({
  content,
  tokens,
  onClick,
}: {
  content: string;
  tokens:  AtmosphereTokens;
  onClick: () => void;
}) {
  const lines = useMemo(() => content.split('\n'), [content]);

  if (!content.trim()) {
    return (
      <div
        onClick={onClick}
        style={{
          cursor:     'text',
          color:      tokens.textGhost,
          opacity:    0.3,
          fontSize:   15,
          lineHeight: 1.8,
          fontStyle:  'italic',
          fontFamily: 'var(--fw-font-body)',
          userSelect: 'none',
        }}
      >
        Write your solution here.
      </div>
    );
  }

  return (
    <div onClick={onClick} style={{ cursor: 'text' }}>
      {lines.map((line, i) => {
        const t = line.trim();

        // Empty line → breathing space
        if (!t) return <div key={i} style={{ height: '1.2em' }} />;

        // Math line → centered KaTeX
        if (isLikelyMathLine(t)) {
          return <LineEquation key={i} text={t} tokens={tokens} />;
        }

        // Prose line → left-aligned text, $…$ rendered inline
        return (
          <div
            key={i}
            style={{
              fontSize:   15,
              lineHeight: 1.8,
              color:      tokens.textPrimary,
              fontFamily: 'var(--fw-font-body)',
              minHeight:  '1.2em',
            }}
          >
            <InlineMath text={line} tokens={tokens} />
          </div>
        );
      })}
    </div>
  );
}

// ── Writing area ──────────────────────────────────────────────────────────────

const PLACEHOLDER = 'Write normally. Put equations on their own line.';

function WritingArea({
  content,
  tokens,
  onChange,
  onBlur,
}: {
  content:  string;
  tokens:   AtmosphereTokens;
  onChange: (s: string) => void;
  onBlur:   () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Auto-resize to content height
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  });

  // Auto-focus, cursor to end
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  return (
    <textarea
      ref={ref}
      value={content}
      onChange={e => onChange(e.target.value)}
      onBlur={onBlur}
      placeholder={PLACEHOLDER}
      style={{
        display:    'block',
        width:      '100%',
        resize:     'none',
        border:     'none',
        outline:    'none',
        overflow:   'hidden',
        background: 'transparent',
        fontSize:   15,
        lineHeight: 1.8,
        color:      tokens.textPrimary,
        fontFamily: 'var(--fw-font-body)',
        boxSizing:  'border-box',
        caretColor: tokens.accent,
        minHeight:  220,
      }}
    />
  );
}

// ── Help panel ────────────────────────────────────────────────────────────────

function HelpPanel({ tokens, onClose }: { tokens: AtmosphereTokens; onClose: () => void }) {
  const mono: React.CSSProperties = {
    fontFamily: "ui-monospace, 'JetBrains Mono', 'Courier New', monospace",
    fontSize:   11,
    color:      tokens.textMuted,
  };
  const label: React.CSSProperties = {
    fontSize:      9,
    fontWeight:    700,
    letterSpacing: '1.4px',
    textTransform: 'uppercase',
    color:         tokens.textGhost,
    opacity:       0.7,
    marginBottom:  8,
    marginTop:     14,
    fontFamily:    'var(--fw-font-label)',
  };
  const rule: React.CSSProperties = {
    fontSize:   13,
    lineHeight: 1.7,
    color:      tokens.textMuted,
    fontFamily: 'var(--fw-font-body)',
    marginBottom: 3,
  };
  const exLabel: React.CSSProperties = {
    fontSize:   10,
    color:      tokens.textGhost,
    opacity:    0.6,
    fontFamily: 'var(--fw-font-body)',
    marginBottom: 2,
    marginTop:  10,
  };
  const shortRow: React.CSSProperties = {
    display:       'flex',
    gap:           12,
    alignItems:    'baseline',
    marginBottom:  5,
  };

  return (
    <div
      style={{
        position:     'absolute',
        top:          40,
        right:        16,
        width:        320,
        zIndex:       30,
        background:   tokens.cardBg,
        border:       `1px solid ${tokens.cardBorder}`,
        borderRadius: 12,
        padding:      '14px 16px 16px',
        boxShadow:    '0 8px 32px rgba(0,0,0,0.45)',
        overflowY:    'auto',
        maxHeight:    'calc(100vh - 120px)',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: tokens.textMuted, fontFamily: 'var(--fw-font-body)' }}>
          How to write here
        </span>
        <button
          type="button"
          onClick={onClose}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 16, lineHeight: 1, color: tokens.textGhost,
            padding: '0 2px', opacity: 0.6,
          }}
        >×</button>
      </div>

      {/* Rules */}
      <div style={rule}>Write text as you normally would.</div>
      <div style={rule}>Put equations on their own line — they render automatically.</div>
      <div style={rule}>Use <span style={mono}>$…$</span> for math inside a sentence.</div>

      {/* Divider */}
      <div style={{ borderTop: `1px solid ${tokens.divider}`, margin: '12px 0 0', opacity: 0.5 }} />

      {/* Examples */}
      <div style={label}>Examples</div>

      <div style={exLabel}>Write text:</div>
      <div style={{ ...mono, background: `${tokens.wellBg}88`, borderRadius: 6, padding: '5px 8px' }}>
        The derivative of x squared is 2x.
      </div>

      <div style={exLabel}>Equation on its own line:</div>
      <div style={{ ...mono, background: `${tokens.wellBg}88`, borderRadius: 6, padding: '5px 8px' }}>
        y = x^2
      </div>

      <div style={exLabel}>Math inside a sentence:</div>
      <div style={{ ...mono, background: `${tokens.wellBg}88`, borderRadius: 6, padding: '5px 8px' }}>
        The answer is $x = 5$.
      </div>

      {/* Divider */}
      <div style={{ borderTop: `1px solid ${tokens.divider}`, margin: '12px 0 0', opacity: 0.5 }} />

      {/* Shortcuts */}
      <div style={label}>Shortcuts</div>
      {[
        ['sqrt x',               '√x'],
        ['1/2',                  'fraction'],
        ['x^2',                  'power'],
        ['int 0 to 1 x^2 dx',   'integral'],
        ['lim x->0',             'limit'],
      ].map(([from, to]) => (
        <div key={from} style={shortRow}>
          <span style={{ ...mono, flex: 1 }}>{from}</span>
          <span style={{ fontSize: 10, color: tokens.textGhost, opacity: 0.5 }}>→</span>
          <span style={{ fontSize: 11, color: tokens.textGhost, opacity: 0.7,
            fontFamily: 'var(--fw-font-body)' }}>{to}</span>
        </div>
      ))}
    </div>
  );
}

// ── Zone header ───────────────────────────────────────────────────────────────

function ZoneHeader({ label, description, tokens }: {
  label:       string;
  description: string;
  tokens:      AtmosphereTokens;
}) {
  return (
    <div style={{ padding: '14px 14px 6px', flexShrink: 0 }}>
      <div style={{
        fontSize:      9,
        fontWeight:    700,
        letterSpacing: '1.8px',
        textTransform: 'uppercase',
        color:         tokens.textGhost,
        fontFamily:    'var(--fw-font-label)',
        userSelect:    'none',
        marginBottom:  4,
      }}>
        {label}
      </div>
      <div style={{
        fontSize:   10,
        fontStyle:  'italic',
        color:      tokens.textGhost,
        opacity:    0.6,
        fontFamily: 'var(--fw-font-body)',
        lineHeight: 1.4,
        userSelect: 'none',
      }}>
        {description}
      </div>
    </div>
  );
}

// ── Panel add button ──────────────────────────────────────────────────────────

function PanelAddButton({ label, tokens, onClick }: {
  label:   string;
  tokens:  AtmosphereTokens;
  onClick: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background:    'none',
        border:        'none',
        cursor:        'pointer',
        fontSize:      11,
        padding:       '8px 14px',
        color:         hover ? tokens.textMuted : tokens.textGhost,
        transition:    'color 0.12s',
        textAlign:     'left',
        flexShrink:    0,
        fontFamily:    'var(--fw-font-label)',
        letterSpacing: '0.02em',
      }}
    >
      {label}
    </button>
  );
}

// ── Panel empty state ─────────────────────────────────────────────────────────

function PanelEmptyHint({ lines, tokens }: { lines: string[]; tokens: AtmosphereTokens }) {
  return (
    <div style={{ padding: '8px 14px 12px' }}>
      {lines.map((line, i) => (
        <div key={i} style={{
          fontSize:   11,
          fontStyle:  'italic',
          color:      tokens.textGhost,
          opacity:    0.55,
          lineHeight: 1.65,
          fontFamily: 'var(--fw-font-body)',
          userSelect: 'none',
        }}>
          {line}
        </div>
      ))}
    </div>
  );
}

// ── Reference card ────────────────────────────────────────────────────────────

function RefCardView({ card, tokens, onChange, onRemove }: {
  card:     RefCard;
  tokens:   AtmosphereTokens;
  onChange: (c: string) => void;
  onRemove: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      style={{
        position:        'relative',
        backgroundColor: tokens.cardBg,
        borderRadius:    Math.round(tokens.radius * 0.5),
        border:          `1px solid ${hover ? tokens.cardBorderHover : tokens.cardBorder}`,
        boxShadow:       tokens.shadowSm,
        marginBottom:    6,
        transition:      'border-color 0.12s',
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <button
        type="button"
        onClick={onRemove}
        style={{
          position:   'absolute',
          top:        5,
          right:      7,
          background: 'none',
          border:     'none',
          cursor:     'pointer',
          fontSize:   13,
          lineHeight: 1,
          padding:    '1px 3px',
          color:      hover ? tokens.textMuted : 'transparent',
          transition: 'color 0.12s',
        }}
      >×</button>
      <textarea
        value={card.content}
        onChange={e => onChange(e.target.value)}
        placeholder="Theorem, formula, or hint…"
        style={{
          display:    'block',
          width:      '100%',
          minHeight:  80,
          padding:    '10px 22px 10px 12px',
          resize:     'none',
          border:     'none',
          outline:    'none',
          fontSize:   12,
          lineHeight: 1.65,
          color:      tokens.textSecondary,
          background: 'transparent',
          fontFamily: 'var(--fw-font-body)',
          boxSizing:  'border-box',
        }}
      />
    </div>
  );
}

// ── Scratch block ─────────────────────────────────────────────────────────────

function ScratchBlockView({ block, tokens, onChange, onRemove }: {
  block:    ScratchBlock;
  tokens:   AtmosphereTokens;
  onChange: (c: string) => void;
  onRemove: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      style={{
        position:        'relative',
        backgroundColor: tokens.cardBg,
        backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px)',
        backgroundSize:  '18px 18px',
        borderRadius:    Math.round(tokens.radius * 0.5),
        border:          `1px solid ${hover ? tokens.cardBorderHover : tokens.cardBorder}`,
        boxShadow:       tokens.shadowSm,
        marginBottom:    6,
        transition:      'border-color 0.12s',
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <button
        type="button"
        onClick={onRemove}
        style={{
          position:   'absolute',
          top:        5,
          right:      7,
          background: 'none',
          border:     'none',
          cursor:     'pointer',
          fontSize:   13,
          lineHeight: 1,
          padding:    '1px 3px',
          color:      hover ? tokens.textMuted : 'transparent',
          transition: 'color 0.12s',
        }}
      >×</button>
      <textarea
        value={block.content}
        onChange={e => onChange(e.target.value)}
        placeholder="Try something…"
        style={{
          display:    'block',
          width:      '100%',
          minHeight:  80,
          padding:    '10px 22px 10px 12px',
          resize:     'none',
          border:     'none',
          outline:    'none',
          fontSize:   12,
          lineHeight: 1.7,
          color:      tokens.textSecondary,
          background: 'transparent',
          fontFamily: 'ui-monospace, "Courier New", monospace',
          boxSizing:  'border-box',
        }}
      />
    </div>
  );
}

// ── Panel collapse button ─────────────────────────────────────────────────────

function CollapseBtn({ onClick, title, children, tokens }: {
  onClick:  () => void;
  title:    string;
  children: React.ReactNode;
  tokens:   AtmosphereTokens;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background:     'none',
        border:         'none',
        cursor:         'pointer',
        color:          tokens.textGhost,
        opacity:        hover ? 0.65 : 0.3,
        fontSize:       15,
        padding:        '4px 6px',
        lineHeight:     1,
        flexShrink:     0,
        transition:     'opacity 0.12s',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
      }}
    >
      {children}
    </button>
  );
}

// ── Stage texture ─────────────────────────────────────────────────────────────

const STAGE_TEXTURE = {
  backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.028) 1px, transparent 1px)',
  backgroundSize:  '24px 24px',
} as const;

// ── MathZone ──────────────────────────────────────────────────────────────────

export function MathZone({
  tokens,
  sectionId,
  sectionTitle: _sectionTitle,
  paddingTop = 52,
}: MathZoneProps) {
  const { data, setData } = useMathZoneData(sectionId);

  const [editing,        setEditing]        = useState(() => data.content.trim() === '');
  const [leftCollapsed,  setLeftCollapsed]  = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [centerHovered,  setCenterHovered]  = useState(false);
  const [showHelp,       setShowHelp]       = useState(false);
  const [helpBtnHover,   setHelpBtnHover]   = useState(false);

  const handleBlur = () => {
    if (data.content.trim()) setEditing(false);
  };

  // Reference panel
  const addRef    = () => setData(d => ({ ...d, refs: [...d.refs, { id: `ref-${Date.now()}`, content: '' }] }));
  const updateRef = (id: string, c: string) => setData(d => ({ ...d, refs: d.refs.map(r => r.id === id ? { ...r, content: c } : r) }));
  const removeRef = (id: string) => setData(d => ({ ...d, refs: d.refs.filter(r => r.id !== id) }));

  // Scratch panel
  const addScratch    = () => setData(d => ({ ...d, scratches: [...d.scratches, { id: `scratch-${Date.now()}`, content: '' }] }));
  const updateScratch = (id: string, c: string) => setData(d => ({ ...d, scratches: d.scratches.map(s => s.id === id ? { ...s, content: c } : s) }));
  const removeScratch = (id: string) => setData(d => ({ ...d, scratches: d.scratches.filter(s => s.id !== id) }));

  return (
    <div style={{
      display:         'flex',
      flexDirection:   'column',
      width:           '100%',
      height:          '100%',
      backgroundColor: tokens.pageBg,
      paddingTop,
      overflow:        'hidden',
    }}>

      {/* ── Three-column body ─────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>

        {/* ── LEFT — References ──────────────────────────────────────────── */}
        {leftCollapsed ? (
          <div style={{
            width: 28, flexShrink: 0, display: 'flex', flexDirection: 'column',
            alignItems: 'center', borderRight: `1px solid ${tokens.divider}`,
          }}>
            <CollapseBtn onClick={() => setLeftCollapsed(false)} title="Expand References" tokens={tokens}>›</CollapseBtn>
          </div>
        ) : (
          <div style={{
            width: 248, flexShrink: 0, display: 'flex', flexDirection: 'column',
            overflow: 'hidden', borderRight: `1px solid ${tokens.divider}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', paddingRight: 4, flexShrink: 0 }}>
              <div style={{ flex: 1 }}>
                <ZoneHeader label="References" description="Theorem · Formula · Hint" tokens={tokens} />
              </div>
              <CollapseBtn onClick={() => setLeftCollapsed(true)} title="Collapse" tokens={tokens}>‹</CollapseBtn>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px' }}>
              {data.refs.length === 0 && (
                <PanelEmptyHint
                  lines={['Add a theorem,', 'formula, or hint.', '', 'Stays visible', 'while you work.']}
                  tokens={tokens}
                />
              )}
              {data.refs.map(r => (
                <RefCardView key={r.id} card={r} tokens={tokens}
                  onChange={c => updateRef(r.id, c)} onRemove={() => removeRef(r.id)} />
              ))}
            </div>
            <PanelAddButton label="+ reference" tokens={tokens} onClick={addRef} />
          </div>
        )}

        {/* ── CENTER — Solution document ─────────────────────────────────── */}
        <div
          style={{
            flex:            1,
            display:         'flex',
            flexDirection:   'column',
            backgroundColor: tokens.pageBg,
            ...STAGE_TEXTURE,
            boxShadow:       `inset 0 0 0 1px rgba(255,255,255,0.04)`,
            margin:          '10px 0',
            overflow:        'hidden',
            zIndex:          2,
            position:        'relative',
          }}
          onMouseEnter={() => setCenterHovered(true)}
          onMouseLeave={() => setCenterHovered(false)}
        >
          {/* "?" help button — always visible, top-right */}
          <button
            type="button"
            onClick={() => setShowHelp(v => !v)}
            onMouseEnter={() => setHelpBtnHover(true)}
            onMouseLeave={() => setHelpBtnHover(false)}
            title="Math writing guide"
            style={{
              position:       'absolute',
              top:            12,
              right:          16,
              zIndex:         20,
              width:          32,
              height:         32,
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'center',
              background:     showHelp
                ? `${tokens.accent}22`
                : 'rgba(0,0,0,0.22)',
              border:         showHelp
                ? `1px solid ${tokens.accent}55`
                : '1px solid rgba(255,255,255,0.08)',
              borderRadius:   8,
              cursor:         'pointer',
              color:          showHelp ? tokens.accent : tokens.textGhost,
              opacity:        showHelp ? 1 : (helpBtnHover ? 1 : 0.55),
              fontSize:       13,
              fontWeight:     700,
              lineHeight:     1,
              padding:        0,
              transition:     'opacity 0.15s, color 0.15s, background 0.15s, border-color 0.15s',
              fontFamily:     'var(--fw-font-label)',
              backdropFilter: 'blur(4px)',
            }}
          >
            ?
          </button>

          {/* "edit" affordance — top-right but shifted left of "?" */}
          {!editing && centerHovered && data.content.trim() && !showHelp && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              style={{
                position:      'absolute',
                top:           14,
                right:         52,
                zIndex:        10,
                background:    'none',
                border:        'none',
                cursor:        'pointer',
                color:         tokens.textGhost,
                opacity:       0.4,
                fontSize:      11,
                fontFamily:    'var(--fw-font-label)',
                letterSpacing: '0.05em',
                padding:       '3px 8px',
              }}
            >
              edit
            </button>
          )}

          {/* Help panel */}
          {showHelp && (
            <HelpPanel tokens={tokens} onClose={() => setShowHelp(false)} />
          )}

          {/* Scrollable document area */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <div style={{
              maxWidth: 660,
              margin:   '0 auto',
              padding:  '48px 52px 52px',
            }}>
              {editing ? (
                <WritingArea
                  content={data.content}
                  tokens={tokens}
                  onChange={c => setData(d => ({ ...d, content: c }))}
                  onBlur={handleBlur}
                />
              ) : (
                <RenderedDocument
                  content={data.content}
                  tokens={tokens}
                  onClick={() => setEditing(true)}
                />
              )}
            </div>
          </div>
        </div>

        {/* ── RIGHT — Scratch ────────────────────────────────────────────── */}
        {rightCollapsed ? (
          <div style={{
            width: 28, flexShrink: 0, display: 'flex', flexDirection: 'column',
            alignItems: 'center', borderLeft: `1px solid ${tokens.divider}`,
          }}>
            <CollapseBtn onClick={() => setRightCollapsed(false)} title="Expand Scratch" tokens={tokens}>‹</CollapseBtn>
          </div>
        ) : (
          <div style={{
            width: 212, flexShrink: 0, display: 'flex', flexDirection: 'column',
            overflow: 'hidden', borderLeft: `1px solid ${tokens.divider}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', paddingLeft: 4, flexShrink: 0 }}>
              <CollapseBtn onClick={() => setRightCollapsed(true)} title="Collapse" tokens={tokens}>›</CollapseBtn>
              <div style={{ flex: 1 }}>
                <ZoneHeader label="Scratch" description="Explore freely." tokens={tokens} />
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px' }}>
              {data.scratches.length === 0 && (
                <PanelEmptyHint
                  lines={['Side calculations,', 'rough attempts,', 'discarded ideas —', '', 'all welcome here.']}
                  tokens={tokens}
                />
              )}
              {data.scratches.map(s => (
                <ScratchBlockView key={s.id} block={s} tokens={tokens}
                  onChange={c => updateScratch(s.id, c)} onRemove={() => removeScratch(s.id)} />
              ))}
            </div>
            <PanelAddButton label="+ scratch" tokens={tokens} onClick={addScratch} />
          </div>
        )}

      </div>
    </div>
  );
}
