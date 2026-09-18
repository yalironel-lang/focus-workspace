/**
 * Notebook Designer — Design section with mini-notebook preset previews.
 * Product UI exposes six designs; historical presets remain hydrate-safe.
 */

import {
  NOTEBOOK_PRODUCT_DESIGN_PRESET_IDS,
  NOTEBOOK_DESIGN_PRESETS,
  appearanceFromNotebookDesignPreset,
} from '../../../lib/notebookAppearance';
import type { NotebookProductDesignPresetId } from '../../../lib/notebookAppearance';
import {
  notebookAppearanceFrameStyle,
  notebookAppearanceIdentityRailStyle,
  notebookAppearanceShellBackgroundColor,
  notebookAppearanceShellBackgroundImage,
  notebookAppearanceStudyPageStyle,
  resolveNotebookAppearanceVisualTokens,
  type NotebookDesignerPresetSelection,
  type NotebookAppearanceVisualTokens,
} from '../../../lib/notebookAppearanceVisualTokens';
import { TOUCH_TARGET_MIN_PX } from '../../../lib/ui/touchTarget';

type Props = {
  selection: NotebookDesignerPresetSelection;
  onSelectPreset: (id: NotebookProductDesignPresetId) => void;
};

function MiniNotebookPreview({ tokens }: { tokens: NotebookAppearanceVisualTokens }) {
  const frame = notebookAppearanceFrameStyle(tokens);
  const page = notebookAppearanceStudyPageStyle(tokens);
  const rail = notebookAppearanceIdentityRailStyle(tokens);
  const lineColor =
    tokens.pageInk === 'dark' ? 'rgba(28,25,23,0.22)' : 'rgba(226,232,240,0.28)';
  const railW = Math.max(1, Math.min(8, tokens.identityRailWidthPx));

  return (
    <div
      aria-hidden
      data-nb-designer-preset-swatch="1"
      data-nb-designer-swatch-material={tokens.material}
      data-nb-designer-swatch-frame={tokens.frame}
      data-nb-designer-swatch-motif={tokens.motif}
      data-nb-designer-swatch-spine={tokens.spine}
      data-nb-designer-swatch-rail={String(tokens.identityRailWidthPx)}
      style={{
        height: 64,
        position: 'relative',
        overflow: 'hidden',
        ...frame,
        backgroundColor: notebookAppearanceShellBackgroundColor(tokens),
        backgroundImage: (() => {
          const img = notebookAppearanceShellBackgroundImage(tokens);
          return img === 'none' ? undefined : img;
        })(),
        boxShadow: tokens.frameShadow,
        paddingTop: 6,
        paddingRight: 5,
        paddingBottom: 5,
        paddingLeft: Math.max(5, railW + 4),
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
        boxSizing: 'border-box',
      }}
    >
      {rail ? (
        <div
          data-nb-designer-swatch-rail-el="1"
          style={{
            ...rail,
            width: railW,
            borderRadius: `${Math.max(2, tokens.frameRadiusPx / 3)}px 0 0 ${Math.max(2, tokens.frameRadiusPx / 3)}px`,
          }}
        />
      ) : null}
      <div
        style={{
          height: 9,
          borderRadius: Math.max(2, tokens.pageRadiusPx - 4),
          background: tokens.chromeSurface,
          borderBottom: `1px solid ${tokens.chromeBorder}`,
          boxShadow:
            tokens.chromeHighlight !== 'transparent'
              ? `inset 0 1px 0 ${tokens.chromeHighlight}`
              : undefined,
          flexShrink: 0,
        }}
      />
      <div
        data-nb-designer-swatch-page="1"
        style={{
          ...page,
          margin: 0,
          marginTop: 0,
          flex: 1,
          minHeight: 0,
          padding: '5px 6px',
          display: 'flex',
          flexDirection: 'column',
          gap: 3,
          boxSizing: 'border-box',
          boxShadow: tokens.pageShadow,
        }}
      >
        <div style={{ height: 1.5, background: lineColor, width: '92%', borderRadius: 1 }} />
        <div style={{ height: 1.5, background: lineColor, width: '78%', borderRadius: 1 }} />
        <div style={{ height: 1.5, background: lineColor, width: '64%', borderRadius: 1 }} />
      </div>
    </div>
  );
}

export function NotebookDesignerDesignSection({ selection, onSelectPreset }: Props) {
  return (
    <section data-nb-designer-section="design" aria-label="Design">
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'rgba(148,163,184,0.72)',
          marginBottom: 10,
        }}
      >
        Notebook Design
      </div>
      <p
        style={{
          margin: '0 0 12px',
          fontSize: 12,
          lineHeight: 1.45,
          color: 'rgba(148,163,184,0.7)',
        }}
      >
        Identity of the notebook — frame, material, and atmosphere. Page paper is separate.
      </p>
      {selection === 'custom' ? (
        <div
          data-nb-designer-custom="1"
          style={{
            marginBottom: 10,
            padding: '8px 10px',
            borderRadius: 8,
            border: '1px solid rgba(148,163,184,0.18)',
            background: 'rgba(148,163,184,0.08)',
            color: 'rgba(226,232,240,0.82)',
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          Custom
        </div>
      ) : null}
      {selection === 'legacy' ? (
        <div
          data-nb-designer-legacy="1"
          style={{
            marginBottom: 10,
            padding: '8px 10px',
            borderRadius: 8,
            border: '1px solid rgba(148,163,184,0.18)',
            background: 'rgba(148,163,184,0.08)',
            color: 'rgba(226,232,240,0.82)',
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          Saved design (legacy)
        </div>
      ) : null}
      <div
        data-nb-designer-preset-grid="1"
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 8,
        }}
      >
        {NOTEBOOK_PRODUCT_DESIGN_PRESET_IDS.map(id => {
          const def = NOTEBOOK_DESIGN_PRESETS[id];
          const tokens = resolveNotebookAppearanceVisualTokens(
            appearanceFromNotebookDesignPreset(id),
          );
          const selected = selection === id;
          return (
            <button
              key={id}
              type="button"
              data-nb-designer-preset={id}
              data-nb-designer-preset-selected={selected ? '1' : '0'}
              data-nb-designer-material={tokens.material}
              data-nb-designer-frame={tokens.frame}
              data-nb-designer-motif={tokens.motif}
              data-nb-designer-spine={tokens.spine}
              data-nb-designer-pad={String(tokens.framePaddingPx)}
              aria-pressed={selected}
              aria-label={`Design preset ${def.label}`}
              onMouseDown={e => e.preventDefault()}
              onClick={() => onSelectPreset(id)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'stretch',
                gap: 8,
                minHeight: TOUCH_TARGET_MIN_PX + 48,
                padding: 8,
                borderRadius: 12,
                border: selected
                  ? `1.5px solid ${tokens.identityAccent}`
                  : '1px solid rgba(148,163,184,0.16)',
                background: selected ? 'rgba(56,189,248,0.10)' : 'rgba(15,23,42,0.55)',
                boxShadow: selected
                  ? `0 0 0 1px ${tokens.identityPrimary}, inset 0 1px 0 rgba(255,255,255,0.06)`
                  : 'inset 0 1px 0 rgba(255,255,255,0.04)',
                cursor: 'pointer',
                textAlign: 'left',
                fontFamily: 'inherit',
                color: 'rgba(248,250,252,0.92)',
              }}
            >
              <MiniNotebookPreview tokens={tokens} />
              <span style={{ fontSize: 12, fontWeight: 650, letterSpacing: '0.01em' }}>
                {def.label}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
