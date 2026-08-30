import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronDown,
  Italic,
  PaintBucket,
  Redo2,
  Type,
  Underline,
  Undo2,
} from 'lucide-react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import type { SpreadsheetEngineAdapter } from '../engine/SpreadsheetEngineAdapter';
import {
  SHEET_FILL_COLORS,
  SHEET_TEXT_COLORS,
  type SheetNumberFormatPreset,
  type SheetSelectionState,
  type SheetStyleSnapshot,
} from './sheetToolbarTypes';

export type FocusSheetToolbarDensity = 'full' | 'compact';

type Props = {
  engine: SpreadsheetEngineAdapter;
  tokens: AtmosphereTokens;
  /** Forced density; when omitted, width observer chooses. */
  density?: FocusSheetToolbarDensity;
};

const COMPACT_BREAKPOINT_PX = 520;

type MenuId = 'format' | 'number' | 'textColor' | 'fillColor' | null;

export function FocusSheetToolbar({ engine, tokens, density: densityProp }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [autoCompact, setAutoCompact] = useState(false);
  const [menu, setMenu] = useState<MenuId>(null);
  const [sel, setSel] = useState<SheetSelectionState>(() => engine.getSelectionState());

  const density: FocusSheetToolbarDensity =
    densityProp ?? (autoCompact ? 'compact' : 'full');

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === 'undefined' || densityProp) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? el.clientWidth;
      setAutoCompact(w < COMPACT_BREAKPOINT_PX);
    });
    ro.observe(el);
    setAutoCompact(el.clientWidth < COMPACT_BREAKPOINT_PX);
    return () => ro.disconnect();
  }, [densityProp]);

  useEffect(() => {
    const refresh = () => setSel(engine.getSelectionState());
    refresh();
    const u1 = engine.onSelectionChange(refresh);
    const u2 = engine.onDocumentChanged(refresh);
    return () => {
      u1();
      u2();
    };
  }, [engine]);

  useEffect(() => {
    if (!menu) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (t && rootRef.current?.contains(t)) return;
      setMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(null);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [menu]);

  const style = sel.style;
  const run = (fn: () => void) => {
    fn();
    // Return focus to grid so arrows/Tab keep working.
    queueMicrotask(() => engine.focus());
  };

  const btn = (
    active: boolean,
    title: string,
    onClick: () => void,
    children: ReactNode,
  ): ReactNode => (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => run(onClick)}
      style={toolBtnStyle(tokens, active)}
    >
      {children}
    </button>
  );

  const sep = (
    <div
      aria-hidden
      style={{
        width: 1,
        alignSelf: 'stretch',
        margin: '4px 2px',
        background: tokens.cardBorder,
        flexShrink: 0,
      }}
    />
  );

  const formatCluster = (
    <>
      {btn(!!style?.bold, 'Bold', () => engine.toggleBold(), <Bold size={14} strokeWidth={2.25} />)}
      {btn(!!style?.italic, 'Italic', () => engine.toggleItalic(), <Italic size={14} strokeWidth={2.25} />)}
      {btn(!!style?.underline, 'Underline', () => engine.toggleUnderline(), <Underline size={14} strokeWidth={2.25} />)}
      {btn(style?.horizontalAlign === 'left', 'Align left', () => engine.setHorizontalAlign('left'), <AlignLeft size={14} />)}
      {btn(style?.horizontalAlign === 'center', 'Align center', () => engine.setHorizontalAlign('center'), <AlignCenter size={14} />)}
      {btn(style?.horizontalAlign === 'right', 'Align right', () => engine.setHorizontalAlign('right'), <AlignRight size={14} />)}
      <ColorMenu
        tokens={tokens}
        open={menu === 'textColor'}
        onToggle={() => setMenu((m) => (m === 'textColor' ? null : 'textColor'))}
        title="Text color"
        icon={<Type size={14} />}
        swatches={SHEET_TEXT_COLORS}
        current={style?.fontColor ?? null}
        onPick={(c) => {
          setMenu(null);
          run(() => engine.setFontColor(c));
        }}
      />
      <ColorMenu
        tokens={tokens}
        open={menu === 'fillColor'}
        onToggle={() => setMenu((m) => (m === 'fillColor' ? null : 'fillColor'))}
        title="Fill color"
        icon={<PaintBucket size={14} />}
        swatches={SHEET_FILL_COLORS}
        current={style?.fillColor ?? null}
        onPick={(c) => {
          setMenu(null);
          run(() => engine.setFillColor(c));
        }}
      />
    </>
  );

  const numberCluster = (
    <>
      <NumberMenu
        tokens={tokens}
        open={menu === 'number'}
        onToggle={() => setMenu((m) => (m === 'number' ? null : 'number'))}
        style={style}
        onPick={(preset) => {
          setMenu(null);
          run(() => engine.setNumberFormat(preset));
        }}
        onDecimal={(d) => {
          setMenu(null);
          run(() => engine.adjustDecimalPlaces(d));
        }}
      />
      {density === 'full' ? (
        <>
          {btn(false, 'Increase decimal', () => engine.adjustDecimalPlaces(1), <span style={tinyLabel}>.0</span>)}
          {btn(false, 'Decrease decimal', () => engine.adjustDecimalPlaces(-1), <span style={tinyLabel}>.00</span>)}
        </>
      ) : null}
    </>
  );

  return (
    <div
      ref={rootRef}
      role="toolbar"
      aria-label="Sheet formatting"
      data-fw-sheet-toolbar="1"
      data-density={density}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        flexShrink: 0,
        flexWrap: 'nowrap',
        overflow: 'hidden',
        padding: '3px 6px',
        minHeight: 28,
        borderBottom: `1px solid ${tokens.cardBorder}`,
        backgroundColor: tokens.wellBg,
      }}
    >
      {btn(false, 'Undo', () => engine.undo(), <Undo2 size={14} />)}
      {btn(false, 'Redo', () => engine.redo(), <Redo2 size={14} />)}
      {sep}

      {density === 'compact' ? (
        <>
          <Dropdown
            tokens={tokens}
            open={menu === 'format'}
            label="Format"
            title="Format"
            onToggle={() => setMenu((m) => (m === 'format' ? null : 'format'))}
          >
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, padding: 6, maxWidth: 220 }}>
              {formatCluster}
            </div>
          </Dropdown>
          {sep}
          {numberCluster}
        </>
      ) : (
        <>
          {formatCluster}
          {sep}
          {numberCluster}
        </>
      )}
    </div>
  );
}

function toolBtnStyle(tokens: AtmosphereTokens, active: boolean): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 26,
    height: 26,
    padding: 0,
    borderRadius: 6,
    border: active ? `1px solid ${tokens.accent}66` : '1px solid transparent',
    background: active ? `${tokens.accent}22` : 'transparent',
    color: active ? tokens.accent : tokens.textMuted,
    cursor: 'pointer',
    flexShrink: 0,
  };
}

const tinyLabel: CSSProperties = { fontSize: 9, fontWeight: 700, letterSpacing: '-0.02em' };

function Dropdown({
  tokens,
  open,
  label,
  title,
  onToggle,
  children,
}: {
  tokens: AtmosphereTokens;
  open: boolean;
  label: string;
  title: string;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <button
        type="button"
        title={title}
        aria-expanded={open}
        onMouseDown={(e) => e.preventDefault()}
        onClick={onToggle}
        style={{
          ...toolBtnStyle(tokens, open),
          width: 'auto',
          padding: '0 6px',
          gap: 2,
          fontSize: 11,
          fontWeight: 600,
        }}
      >
        {label}
        <ChevronDown size={12} />
      </button>
      {open ? (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            zIndex: 30,
            marginTop: 4,
            borderRadius: 8,
            border: `1px solid ${tokens.cardBorder}`,
            background: tokens.cardBg,
            boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
          }}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

function ColorMenu({
  tokens,
  open,
  onToggle,
  title,
  icon,
  swatches,
  current,
  onPick,
}: {
  tokens: AtmosphereTokens;
  open: boolean;
  onToggle: () => void;
  title: string;
  icon: ReactNode;
  swatches: ReadonlyArray<{ id: string; label: string; value: string | null }>;
  current: string | null;
  onPick: (color: string | null) => void;
}) {
  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <button
        type="button"
        title={title}
        aria-label={title}
        aria-expanded={open}
        onMouseDown={(e) => e.preventDefault()}
        onClick={onToggle}
        style={toolBtnStyle(tokens, open || Boolean(current))}
      >
        {icon}
      </button>
      {open ? (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            zIndex: 30,
            marginTop: 4,
            padding: 8,
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 22px)',
            gap: 6,
            borderRadius: 8,
            border: `1px solid ${tokens.cardBorder}`,
            background: tokens.cardBg,
            boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
          }}
        >
          {swatches.map((s) => (
            <button
              key={s.id}
              type="button"
              title={s.label}
              aria-label={s.label}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onPick(s.value)}
              style={{
                width: 22,
                height: 22,
                borderRadius: 5,
                border: `1px solid ${tokens.cardBorder}`,
                background: s.value ?? tokens.pageBg,
                cursor: 'pointer',
                outline: current === s.value ? `2px solid ${tokens.accent}` : 'none',
                outlineOffset: 1,
              }}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function NumberMenu({
  tokens,
  open,
  onToggle,
  style,
  onPick,
  onDecimal,
}: {
  tokens: AtmosphereTokens;
  open: boolean;
  onToggle: () => void;
  style: SheetStyleSnapshot | null;
  onPick: (preset: SheetNumberFormatPreset) => void;
  onDecimal: (delta: -1 | 1) => void;
}) {
  const items: Array<{ id: SheetNumberFormatPreset; label: string }> = [
    { id: 'general', label: 'General' },
    { id: 'number', label: 'Number' },
    { id: 'currency_eur', label: 'Currency €' },
    { id: 'currency_usd', label: 'Currency $' },
    { id: 'currency_gbp', label: 'Currency £' },
    { id: 'percent', label: 'Percentage' },
  ];
  return (
    <Dropdown tokens={tokens} open={open} label="Number" title="Number format" onToggle={onToggle}>
      <div style={{ minWidth: 160, padding: 4 }}>
        {items.map((item) => {
          const active = style?.numberFormat === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onPick(item.id)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '6px 10px',
                border: 'none',
                borderRadius: 6,
                background: active ? `${tokens.accent}18` : 'transparent',
                color: active ? tokens.accent : tokens.textPrimary,
                fontSize: 12,
                fontWeight: active ? 650 : 500,
                cursor: 'pointer',
              }}
            >
              {item.label}
            </button>
          );
        })}
        <div style={{ height: 1, margin: '4px 6px', background: tokens.cardBorder }} />
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onDecimal(1)}
          style={menuRow(tokens)}
        >
          Increase decimal
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onDecimal(-1)}
          style={menuRow(tokens)}
        >
          Decrease decimal
        </button>
      </div>
    </Dropdown>
  );
}

function menuRow(tokens: AtmosphereTokens): CSSProperties {
  return {
    display: 'block',
    width: '100%',
    textAlign: 'left',
    padding: '6px 10px',
    border: 'none',
    borderRadius: 6,
    background: 'transparent',
    color: tokens.textPrimary,
    fontSize: 12,
    cursor: 'pointer',
  };
}
