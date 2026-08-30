import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type Ref,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
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
  density?: FocusSheetToolbarDensity;
};

const COMPACT_BREAKPOINT_PX = 520;

type MenuId = 'format' | 'number' | 'textColor' | 'fillColor' | null;

/**
 * Color/Number menus MUST portal to document.body.
 * The toolbar (and FreeformBlock) use overflow:hidden — absolute menus
 * inside the ~32px strip were clipped so swatches were invisible/unusable.
 */
function ToolbarPopover({
  anchorEl,
  tokens,
  onClose,
  children,
}: {
  anchorEl: HTMLElement | null;
  tokens: AtmosphereTokens;
  onClose: () => void;
  children: ReactNode;
}) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!anchorEl) return;
    const update = () => {
      const r = anchorEl.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: r.left });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [anchorEl]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (t && (anchorEl?.contains(t) || (e.target as HTMLElement)?.closest?.('[data-fw-sheet-popover]'))) {
        return;
      }
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [anchorEl, onClose]);

  if (!pos || typeof document === 'undefined') return null;

  return createPortal(
    <div
      data-fw-sheet-popover="1"
      data-fw-cmd-ignore="1"
      style={{
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        zIndex: 10060,
        borderRadius: 8,
        border: `1px solid ${tokens.cardBorder}`,
        background: tokens.cardBg,
        boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
      }}
      onMouseDown={(e) => e.preventDefault()}
    >
      {children}
    </div>,
    document.body,
  );
}

export function FocusSheetToolbar({ engine, tokens, density: densityProp }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const formatBtnRef = useRef<HTMLButtonElement>(null);
  const numberBtnRef = useRef<HTMLButtonElement>(null);
  const textColorBtnRef = useRef<HTMLButtonElement>(null);
  const fillColorBtnRef = useRef<HTMLButtonElement>(null);
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

  const style = sel.style;
  const run = (fn: () => void) => {
    fn();
    queueMicrotask(() => engine.focus());
  };

  const btn = (
    active: boolean,
    title: string,
    onClick: () => void,
    children: ReactNode,
    ref?: Ref<HTMLButtonElement>,
  ): ReactNode => (
    <button
      ref={ref}
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

  const formatButtons = (
    <>
      {btn(!!style?.bold, 'Bold', () => engine.toggleBold(), <Bold size={14} strokeWidth={2.25} />)}
      {btn(!!style?.italic, 'Italic', () => engine.toggleItalic(), <Italic size={14} strokeWidth={2.25} />)}
      {btn(!!style?.underline, 'Underline', () => engine.toggleUnderline(), <Underline size={14} strokeWidth={2.25} />)}
      {btn(style?.horizontalAlign === 'left', 'Align left', () => engine.setHorizontalAlign('left'), <AlignLeft size={14} />)}
      {btn(style?.horizontalAlign === 'center', 'Align center', () => engine.setHorizontalAlign('center'), <AlignCenter size={14} />)}
      {btn(style?.horizontalAlign === 'right', 'Align right', () => engine.setHorizontalAlign('right'), <AlignRight size={14} />)}
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
        // visible: menus portal out, but keep strip from clipping icon focus rings
        overflow: 'visible',
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
          <button
            ref={formatBtnRef}
            type="button"
            title="Format"
            aria-expanded={menu === 'format'}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setMenu((m) => (m === 'format' ? null : 'format'))}
            style={{
              ...toolBtnStyle(tokens, menu === 'format'),
              width: 'auto',
              padding: '0 6px',
              gap: 2,
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            Format
            <ChevronDown size={12} />
          </button>
          {menu === 'format' ? (
            <ToolbarPopover
              anchorEl={formatBtnRef.current}
              tokens={tokens}
              onClose={() => setMenu(null)}
            >
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, padding: 6, maxWidth: 240 }}>
                {formatButtons}
                <ColorTrigger
                  tokens={tokens}
                  title="Text color"
                  icon={<Type size={14} />}
                  active={Boolean(style?.fontColor)}
                  open={false}
                  buttonRef={undefined}
                  onToggle={() => {
                    setMenu('textColor');
                  }}
                />
                <ColorTrigger
                  tokens={tokens}
                  title="Fill color"
                  icon={<PaintBucket size={14} />}
                  active={Boolean(style?.fillColor && style.fillColor !== '#fff')}
                  open={false}
                  buttonRef={undefined}
                  onToggle={() => setMenu('fillColor')}
                />
              </div>
            </ToolbarPopover>
          ) : null}
        </>
      ) : (
        <>
          {formatButtons}
          <ColorTrigger
            tokens={tokens}
            title="Text color"
            icon={<Type size={14} />}
            active={menu === 'textColor' || Boolean(style?.fontColor)}
            open={menu === 'textColor'}
            buttonRef={textColorBtnRef}
            onToggle={() => setMenu((m) => (m === 'textColor' ? null : 'textColor'))}
          />
          <ColorTrigger
            tokens={tokens}
            title="Fill color"
            icon={<PaintBucket size={14} />}
            active={
              menu === 'fillColor'
              || Boolean(style?.fillColor && style.fillColor !== '#fff' && style.fillColor !== '#ffffff')
            }
            open={menu === 'fillColor'}
            buttonRef={fillColorBtnRef}
            onToggle={() => setMenu((m) => (m === 'fillColor' ? null : 'fillColor'))}
          />
        </>
      )}

      {sep}

      <button
        ref={numberBtnRef}
        type="button"
        title="Number format"
        aria-expanded={menu === 'number'}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setMenu((m) => (m === 'number' ? null : 'number'))}
        style={{
          ...toolBtnStyle(tokens, menu === 'number'),
          width: 'auto',
          padding: '0 6px',
          gap: 2,
          fontSize: 11,
          fontWeight: 600,
        }}
      >
        Number
        <ChevronDown size={12} />
      </button>
      {density === 'full' ? (
        <>
          {btn(false, 'Increase decimal', () => engine.adjustDecimalPlaces(1), <span style={tinyLabel}>.0</span>)}
          {btn(false, 'Decrease decimal', () => engine.adjustDecimalPlaces(-1), <span style={tinyLabel}>.00</span>)}
        </>
      ) : null}

      {menu === 'textColor' ? (
        <ToolbarPopover
          anchorEl={textColorBtnRef.current ?? formatBtnRef.current}
          tokens={tokens}
          onClose={() => setMenu(null)}
        >
          <SwatchGrid
            tokens={tokens}
            swatches={SHEET_TEXT_COLORS}
            current={style?.fontColor ?? null}
            onPick={(c) => {
              setMenu(null);
              run(() => engine.setFontColor(c));
            }}
          />
        </ToolbarPopover>
      ) : null}

      {menu === 'fillColor' ? (
        <ToolbarPopover
          anchorEl={fillColorBtnRef.current ?? formatBtnRef.current}
          tokens={tokens}
          onClose={() => setMenu(null)}
        >
          <SwatchGrid
            tokens={tokens}
            swatches={SHEET_FILL_COLORS}
            current={style?.fillColor && style.fillColor !== '#fff' ? style.fillColor : null}
            onPick={(c) => {
              setMenu(null);
              run(() => engine.setFillColor(c));
            }}
          />
        </ToolbarPopover>
      ) : null}

      {menu === 'number' ? (
        <ToolbarPopover
          anchorEl={numberBtnRef.current}
          tokens={tokens}
          onClose={() => setMenu(null)}
        >
          <NumberMenuBody
            tokens={tokens}
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
        </ToolbarPopover>
      ) : null}
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

function ColorTrigger({
  tokens,
  title,
  icon,
  active,
  open,
  buttonRef,
  onToggle,
}: {
  tokens: AtmosphereTokens;
  title: string;
  icon: ReactNode;
  active: boolean;
  open: boolean;
  buttonRef?: RefObject<HTMLButtonElement | null>;
  onToggle: () => void;
}) {
  return (
    <button
      ref={buttonRef as Ref<HTMLButtonElement>}
      type="button"
      title={title}
      aria-label={title}
      aria-expanded={open}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onToggle}
      style={toolBtnStyle(tokens, active || open)}
    >
      {icon}
    </button>
  );
}

function SwatchGrid({
  tokens,
  swatches,
  current,
  onPick,
}: {
  tokens: AtmosphereTokens;
  swatches: ReadonlyArray<{ id: string; label: string; value: string | null }>;
  current: string | null;
  onPick: (color: string | null) => void;
}) {
  return (
    <div
      style={{
        padding: 8,
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 22px)',
        gap: 6,
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
            background: s.value ?? `repeating-conic-gradient(#ccc 0% 25%, ${tokens.pageBg} 0% 50%) 50% / 10px 10px`,
            cursor: 'pointer',
            outline: current === s.value ? `2px solid ${tokens.accent}` : 'none',
            outlineOffset: 1,
          }}
        />
      ))}
    </div>
  );
}

function NumberMenuBody({
  tokens,
  style,
  onPick,
  onDecimal,
}: {
  tokens: AtmosphereTokens;
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
      <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => onDecimal(1)} style={menuRow(tokens)}>
        Increase decimal
      </button>
      <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => onDecimal(-1)} style={menuRow(tokens)}>
        Decrease decimal
      </button>
    </div>
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
