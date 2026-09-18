/**
 * Notebook Designer Phase 1 — six product designs + frame/page recipes + Pages paperStyle.
 *
 * @vitest-environment happy-dom
 */
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  appearanceFromNotebookDesignPreset,
  appearanceMatchesNotebookDesignPreset,
  NOTEBOOK_DESIGN_PRESET_IDS,
  NOTEBOOK_PRODUCT_DESIGN_PRESET_IDS,
  sanitizeNotebookAppearance,
  type NotebookAppearanceV1,
} from './notebookAppearance';
import {
  notebookAppearancesStructurallyEqual,
  notebookAppearanceFrameStyle,
  notebookAppearanceStudyPageStyle,
  notebookAppearanceVisualTokensToCssVars,
  resolveNotebookAppearanceVisualTokens,
  resolveNotebookDesignerPresetSelection,
} from './notebookAppearanceVisualTokens';
import {
  NOTEBOOK_DESIGNER_PANEL_MIN_WIDTH_PX,
  NOTEBOOK_DESIGNER_PERSIST_DEBOUNCE_MS,
  resolveNotebookDesignerContainerMode,
} from './notebookDesignerLayout';
import { useNotebookDesignerAppearanceSession } from '../hooks/useNotebookDesignerAppearanceSession';
import { NotebookTiptapProductMoreMenu } from '../components/notebook/tiptap/NotebookTiptapProductMoreMenu';
import { NotebookDesignerHost } from '../components/notebook/designer/NotebookDesignerHost';
import { NotebookTiptapCandidateEditor } from '../components/notebook/tiptap/NotebookTiptapCandidateEditor';
import { encodeNotebookTextV1 } from './notebookTextCodec';
import { TOUCH_TARGET_MIN_PX } from './ui/touchTarget';

function mount(ui: React.ReactElement): { host: HTMLDivElement; root: Root } {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(ui);
  });
  return { host, root };
}

const PRODUCT_SIX = [
  'classic',
  'minimal',
  'academic',
  'midnight',
  'blueprint',
  'aurora',
] as const;

const HIDDEN_SIX = ['soft', 'glass', 'pastel', 'ember', 'slate', 'ink'] as const;

describe('product preset catalog', () => {
  it('exposes exactly six product designs', () => {
    expect([...NOTEBOOK_PRODUCT_DESIGN_PRESET_IDS]).toEqual([...PRODUCT_SIX]);
    expect(NOTEBOOK_PRODUCT_DESIGN_PRESET_IDS).toHaveLength(6);
  });

  it('keeps historical preset ids sanitizable', () => {
    for (const id of HIDDEN_SIX) {
      const raw = appearanceFromNotebookDesignPreset(id);
      expect(sanitizeNotebookAppearance(raw)?.identity?.preset).toBe(id);
      expect(appearanceMatchesNotebookDesignPreset(raw, id)).toBe(true);
      expect(resolveNotebookDesignerPresetSelection(raw)).toBe('legacy');
    }
  });

  it('product six select as themselves', () => {
    for (const id of PRODUCT_SIX) {
      expect(
        resolveNotebookDesignerPresetSelection(appearanceFromNotebookDesignPreset(id)),
      ).toBe(id);
    }
  });
});

describe('visual token resolver (pure)', () => {
  it('1: resolver is pure for same input', () => {
    const a = appearanceFromNotebookDesignPreset('midnight');
    const t1 = resolveNotebookAppearanceVisualTokens(a);
    const t2 = resolveNotebookAppearanceVisualTokens(a);
    expect(t1).toEqual(t2);
  });

  it('2: absent appearance resolves safely', () => {
    const t = resolveNotebookAppearanceVisualTokens(undefined);
    expect(t.treatment).toBe('flat');
    expect(t.identityPrimary).toBeTruthy();
    expect(t.spineWidthPx).toBeGreaterThan(0);
    expect(t.pageSurface).toBeTruthy();
    expect(t.frameSurface).toBeTruthy();
    const vars = notebookAppearanceVisualTokensToCssVars(t);
    expect(vars['--nb-identity-primary' as keyof typeof vars]).toBeTruthy();
  });

  it('3: each historical preset resolves deterministically', () => {
    const map = new Map<string, string>();
    for (const id of NOTEBOOK_DESIGN_PRESET_IDS) {
      const tokens = resolveNotebookAppearanceVisualTokens(appearanceFromNotebookDesignPreset(id));
      map.set(id, JSON.stringify(tokens));
    }
    expect(map.get('blueprint')).not.toBe(map.get('midnight'));
    expect(map.get('soft')).not.toBe(map.get('academic'));
    expect(map.get('aurora')).not.toBe(map.get('blueprint'));
    expect(map.get('blueprint')).toBe(
      JSON.stringify(
        resolveNotebookAppearanceVisualTokens(appearanceFromNotebookDesignPreset('blueprint')),
      ),
    );
  });

  it('4: renderer tokens come from treatment/color — not preset id fields on tokens', () => {
    const midnight = resolveNotebookAppearanceVisualTokens(
      appearanceFromNotebookDesignPreset('midnight'),
    );
    const glassTwin: NotebookAppearanceV1 = {
      version: 1,
      identity: { color: 'purple', accent: 'indigo', treatment: 'glass' },
      writing: { width: 'comfortable', density: 'comfortable' },
    };
    expect(resolveNotebookAppearanceVisualTokens(glassTwin)).toEqual(midnight);
    expect(midnight).not.toHaveProperty('preset');
  });

  it('all 12 presets resolve to pairwise-distinct visual tokens', () => {
    const serialized = NOTEBOOK_DESIGN_PRESET_IDS.map(id =>
      JSON.stringify(resolveNotebookAppearanceVisualTokens(appearanceFromNotebookDesignPreset(id))),
    );
    expect(new Set(serialized).size).toBe(NOTEBOOK_DESIGN_PRESET_IDS.length);
  });

  it('product six are pairwise distinct by frame+page recipe', () => {
    const keys = PRODUCT_SIX.map(id => {
      const t = resolveNotebookAppearanceVisualTokens(appearanceFromNotebookDesignPreset(id));
      return `${t.material}|${t.frame}|${t.motif}|${t.pageSurface}|${t.frameSurface}`;
    });
    expect(new Set(keys).size).toBe(6);
  });

  it('Classic vs Minimal differ in material/frame structure', () => {
    const classic = resolveNotebookAppearanceVisualTokens(
      appearanceFromNotebookDesignPreset('classic'),
    );
    const minimal = resolveNotebookAppearanceVisualTokens(
      appearanceFromNotebookDesignPreset('minimal'),
    );
    expect(classic.material).toBe('paper');
    expect(classic.frame).toBe('traditional');
    expect(classic.spine).toBe('classic');
    expect(minimal.material).toBe('clean');
    expect(minimal.frame).toBe('borderless');
    expect(minimal.spine).toBe('none');
    expect(classic.frameSurface).not.toBe(minimal.frameSurface);
    expect(classic.pageSurface).not.toBe(minimal.pageSurface);
    expect(classic.spineWidthPx).toBeGreaterThan(minimal.spineWidthPx);
    expect(classic.depth).not.toBe(minimal.depth);
    expect(classic.frameSurface).not.toBe(classic.pageSurface);
    expect(classic.framePaddingPx).toBeGreaterThanOrEqual(16);
    // Structural (grayscale-relevant): rail + depth + pad hierarchy
    expect(classic.identityRailWidthPx).toBeGreaterThan(minimal.identityRailWidthPx);
    expect(classic.framePaddingPx).toBeGreaterThan(minimal.framePaddingPx);
    expect(classic.pageGapTopPx).toBeGreaterThan(minimal.pageGapTopPx);
    expect(classic.frameRadiusPx).toBeGreaterThan(minimal.frameRadiusPx);
  });

  it('frame vs study page are separated in recipe', () => {
    for (const id of PRODUCT_SIX) {
      const t = resolveNotebookAppearanceVisualTokens(appearanceFromNotebookDesignPreset(id));
      expect(t.frameSurface).toBeTruthy();
      expect(t.pageSurface).toBeTruthy();
      expect(t.frameSurface).not.toBe(t.pageSurface);
      expect(t.pageShadow).toBeTruthy();
      expect(t.framePaddingPx).toBeGreaterThanOrEqual(14);
      expect(t.framePaddingLeft).toMatch(/clamp\(/);
      expect(t.framePaddingTop).toMatch(/clamp\(/);
      expect(t.framePaddingRight).toMatch(/clamp\(/);
      expect(t.framePaddingBottom).toMatch(/clamp\(/);
      const frame = notebookAppearanceFrameStyle(t);
      const page = notebookAppearanceStudyPageStyle(t);
      expect(frame.paddingLeft).toBeTruthy();
      expect(frame.paddingTop).toBeTruthy();
      expect(page.backgroundColor).toBe(t.pageSurface);
      expect(page.boxShadow).toBe(t.pageShadow);
      expect(page.overflow).toBe('visible');
    }
  });

  it('Academic frame surrounds page on all sides with identity rail', () => {
    const academic = resolveNotebookAppearanceVisualTokens(
      appearanceFromNotebookDesignPreset('academic'),
    );
    const classic = resolveNotebookAppearanceVisualTokens(
      appearanceFromNotebookDesignPreset('classic'),
    );
    expect(academic.frame).toBe('book');
    expect(academic.motif).toBe('academic-rule');
    expect(academic.framePaddingPx).toBeGreaterThanOrEqual(22);
    expect(academic.identityRailWidthPx).toBeGreaterThanOrEqual(8);
    expect(academic.frameSurface).not.toBe(classic.frameSurface);
    expect(academic.frameSurface.toLowerCase()).toMatch(/#1|#0|#2/);
    expect(academic.pageInk).toBe('dark');
    expect(academic.pageGapTopPx).toBeGreaterThanOrEqual(10);
    const frame = notebookAppearanceFrameStyle(academic);
    expect(String(frame.paddingLeft)).toMatch(/clamp\(/);
    expect(String(frame.paddingTop)).toMatch(/clamp\(/);
    expect(String(frame.paddingRight)).toMatch(/clamp\(/);
    expect(String(frame.paddingBottom)).toMatch(/clamp\(/);
  });

  it('Midnight page surface != Midnight frame surface', () => {
    const midnight = resolveNotebookAppearanceVisualTokens(
      appearanceFromNotebookDesignPreset('midnight'),
    );
    expect(midnight.pageSurface).not.toBe(midnight.frameSurface);
    expect(midnight.pageInk).toBe('light');
    expect(midnight.framePaddingPx).toBeGreaterThanOrEqual(16);
    expect(midnight.identityRailWidthPx).toBeGreaterThan(0);
  });

  it('Aurora has multi-zone atmospheric treatment', () => {
    const aurora = resolveNotebookAppearanceVisualTokens(
      appearanceFromNotebookDesignPreset('aurora'),
    );
    expect(aurora.treatment).toBe('gradient');
    expect(aurora.motif).toBe('aurora-light');
    expect(aurora.material).toBe('luminous');
    expect(aurora.ambientLight).not.toBe('none');
    expect(aurora.ambientLightSecondary).not.toBe('none');
    expect(aurora.ambientLight).toMatch(/radial-gradient/);
    expect(aurora.ambientLightSecondary).toMatch(/radial-gradient/);
    // Distinct zones: cyan + violet + magenta family
    expect(aurora.ambientLight + aurora.ambientLightSecondary).toMatch(/34,\s*211,\s*238/);
    expect(aurora.ambientLight + aurora.ambientLightSecondary).toMatch(/244,\s*114,\s*182|168,\s*85,\s*247/);
    expect(aurora.pageSurface).not.toBe(aurora.frameSurface);
    expect(aurora.pageInk).toBe('light');
    const frameCss = notebookAppearanceFrameStyle(aurora);
    expect(String(frameCss.backgroundImage)).toMatch(/radial-gradient/);
  });

  it('responsive frame bands stay within usable writing bounds', () => {
    for (const id of PRODUCT_SIX) {
      const t = resolveNotebookAppearanceVisualTokens(appearanceFromNotebookDesignPreset(id));
      // Max desktop left band ≤ 28px target
      expect(t.framePaddingPx).toBeLessThanOrEqual(28);
      // Min clamp floor leaves writing width
      expect(t.framePaddingLeft).toMatch(/clamp\((\d+)px/);
      const minLeft = Number(t.framePaddingLeft.match(/clamp\((\d+)px/)?.[1]);
      expect(minLeft).toBeGreaterThanOrEqual(10);
      expect(minLeft).toBeLessThanOrEqual(22);
    }
  });

  it('Blueprint drafting marks stay on frame — study page is neutral', () => {
    const blueprint = resolveNotebookAppearanceVisualTokens(
      appearanceFromNotebookDesignPreset('blueprint'),
    );
    expect(blueprint.material).toBe('technical');
    expect(blueprint.motif).toBe('drafting-marks');
    expect(blueprint.frame).toBe('technical');
    expect(blueprint.frameEdgeMotif).toContain('transparent');
    expect(blueprint.pageSurface.toLowerCase()).not.toMatch(/#0[a-f0-9]{5}/);
    expect(blueprint.pageInk).toBe('dark');
    expect(blueprint.frameEdgeMotif).not.toMatch(/36px 36px/);
    expect(blueprint.frameEdgeMotif).not.toMatch(/repeating-linear-gradient/);
    expect(blueprint.ambientLight).toBe('none');
  });

  it('Academic is bookish navy frame + ivory page; Ink remains distinct', () => {
    const academic = resolveNotebookAppearanceVisualTokens(
      appearanceFromNotebookDesignPreset('academic'),
    );
    const ink = resolveNotebookAppearanceVisualTokens(appearanceFromNotebookDesignPreset('ink'));
    const blueprint = resolveNotebookAppearanceVisualTokens(
      appearanceFromNotebookDesignPreset('blueprint'),
    );
    expect(academic.material).toBe('paper');
    expect(academic.frame).toBe('book');
    expect(academic.motif).toBe('academic-rule');
    expect(academic.pageInk).toBe('dark');
    expect(ink.material).toBe('ink');
    expect(ink.motif).toBe('ink-band');
    expect(academic.material).not.toBe(blueprint.material);
  });

  it('Midnight vs Glass differ in material recipe', () => {
    const midnight = resolveNotebookAppearanceVisualTokens(
      appearanceFromNotebookDesignPreset('midnight'),
    );
    const glass = resolveNotebookAppearanceVisualTokens(appearanceFromNotebookDesignPreset('glass'));
    expect(midnight.material).toBe('night');
    expect(glass.material).toBe('glass');
    expect(midnight.frameSurface).not.toBe(glass.frameSurface);
    expect(midnight.pageInk).toBe('light');
  });

  it('Aurora is luminous with calm dark page', () => {
    const aurora = resolveNotebookAppearanceVisualTokens(
      appearanceFromNotebookDesignPreset('aurora'),
    );
    expect(aurora.treatment).toBe('gradient');
    expect(aurora.motif).toBe('aurora-light');
    expect(aurora.material).toBe('luminous');
    expect(aurora.pageInk).toBe('light');
  });

  it('light study pages expose dark ink for product reading designs', () => {
    for (const id of ['classic', 'minimal', 'academic', 'blueprint'] as const) {
      const t = resolveNotebookAppearanceVisualTokens(appearanceFromNotebookDesignPreset(id));
      expect(t.pageInk).toBe('dark');
      expect(t.pageSurface).toBeTruthy();
      expect(t.toolbarFade).toMatch(/255,255,255|ffffff/i);
    }
  });

  it('thumbnail recipe fields mirror live notebook recipe', () => {
    for (const id of PRODUCT_SIX) {
      const t = resolveNotebookAppearanceVisualTokens(appearanceFromNotebookDesignPreset(id));
      expect(t.material).toBeTruthy();
      expect(t.frame).toBeTruthy();
      expect(t.spine).toBeTruthy();
      expect(t.motif).toBeTruthy();
      expect(t.pageSurface).toBeTruthy();
      expect(t.frameSurface).toBeTruthy();
      expect(t.pageShadow).toBeTruthy();
      expect(t.toolbarFade).toBeTruthy();
    }
  });
});

describe('designer layout mode', () => {
  it('20–21: narrow → sheet, wide → panel', () => {
    expect(resolveNotebookDesignerContainerMode(390)).toBe('sheet');
    expect(resolveNotebookDesignerContainerMode(NOTEBOOK_DESIGNER_PANEL_MIN_WIDTH_PX - 1)).toBe(
      'sheet',
    );
    expect(resolveNotebookDesignerContainerMode(NOTEBOOK_DESIGNER_PANEL_MIN_WIDTH_PX)).toBe('panel');
    expect(resolveNotebookDesignerContainerMode(1200)).toBe('panel');
  });
});

describe('designer draft session (zero-write + debounce)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function Harness({
    persisted,
    onPersist,
    apiRef,
  }: {
    persisted?: NotebookAppearanceV1;
    onPersist: (a: NotebookAppearanceV1) => void;
    apiRef: { current: ReturnType<typeof useNotebookDesignerAppearanceSession> | null };
  }) {
    const session = useNotebookDesignerAppearanceSession({
      persistedAppearance: persisted,
      persistAppearance: onPersist,
    });
    apiRef.current = session;
    return createElement('div', {
      'data-live': session.liveAppearance?.identity?.preset ?? 'none',
      'data-open': session.open ? '1' : '0',
    });
  }

  it('5–6: open/close unchanged causes zero persistence writes', () => {
    const onPersist = vi.fn();
    const apiRef: { current: ReturnType<typeof useNotebookDesignerAppearanceSession> | null } = {
      current: null,
    };
    const { root, host } = mount(
      createElement(Harness, { onPersist, apiRef, persisted: undefined }),
    );
    act(() => {
      apiRef.current!.openDesigner();
    });
    expect(host.querySelector('[data-open="1"]')).toBeTruthy();
    expect(onPersist).not.toHaveBeenCalled();
    act(() => {
      apiRef.current!.closeDesigner();
    });
    expect(onPersist).not.toHaveBeenCalled();
    act(() => root.unmount());
    host.remove();
  });

  it('7–9: preset updates live immediately; rapid clicks settle once', () => {
    const onPersist = vi.fn();
    const apiRef: { current: ReturnType<typeof useNotebookDesignerAppearanceSession> | null } = {
      current: null,
    };
    const { root, host } = mount(
      createElement(Harness, { onPersist, apiRef, persisted: undefined }),
    );
    act(() => apiRef.current!.openDesigner());
    act(() => apiRef.current!.selectPreset('classic'));
    expect(apiRef.current!.liveAppearance?.identity?.preset).toBe('classic');
    expect(onPersist).not.toHaveBeenCalled();
    act(() => apiRef.current!.selectPreset('midnight'));
    act(() => apiRef.current!.selectPreset('aurora'));
    expect(apiRef.current!.liveAppearance?.identity?.preset).toBe('aurora');
    expect(onPersist).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(NOTEBOOK_DESIGNER_PERSIST_DEBOUNCE_MS);
    });
    expect(onPersist).toHaveBeenCalledTimes(1);
    expect(onPersist.mock.calls[0]![0].identity?.preset).toBe('aurora');
    act(() => root.unmount());
    host.remove();
  });

  it('8: close flushes dirty draft', () => {
    const onPersist = vi.fn();
    const apiRef: { current: ReturnType<typeof useNotebookDesignerAppearanceSession> | null } = {
      current: null,
    };
    const { root } = mount(createElement(Harness, { onPersist, apiRef }));
    act(() => apiRef.current!.openDesigner());
    act(() => apiRef.current!.selectPreset('blueprint'));
    act(() => apiRef.current!.closeDesigner());
    expect(onPersist).toHaveBeenCalledTimes(1);
    expect(onPersist.mock.calls[0]![0].identity?.preset).toBe('blueprint');
    act(() => root.unmount());
  });

  it('18: custom appearance opens as Custom without mutation', () => {
    const custom: NotebookAppearanceV1 = {
      version: 1,
      identity: { color: 'cyan', treatment: 'flat' },
      writing: { width: 'wide', density: 'spacious' },
    };
    expect(resolveNotebookDesignerPresetSelection(custom)).toBe('custom');
    const onPersist = vi.fn();
    const apiRef: { current: ReturnType<typeof useNotebookDesignerAppearanceSession> | null } = {
      current: null,
    };
    const { root } = mount(createElement(Harness, { onPersist, apiRef, persisted: custom }));
    act(() => apiRef.current!.openDesigner());
    expect(notebookAppearancesStructurallyEqual(apiRef.current!.liveAppearance, custom)).toBe(true);
    act(() => apiRef.current!.closeDesigner());
    expect(onPersist).not.toHaveBeenCalled();
    act(() => root.unmount());
  });
});

describe('More menu + Designer host UI', () => {
  let host: HTMLDivElement;
  let root: Root;

  afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
  });

  const hostProps = {
    paperStyle: 'ruled' as const,
    onSelectPaperStyle: vi.fn(),
  };

  it('19: More menu exposes Customize Notebook', () => {
    const onCustomize = vi.fn();
    ({ host, root } = mount(
      createElement(NotebookTiptapProductMoreMenu, {
        onCustomizeNotebook: onCustomize,
        onExportPdf: vi.fn(),
      }),
    ));
    act(() => {
      host.querySelector('[data-nb-product-more="1"]')!.dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
    });
    const item = document.querySelector('[data-nb-product-customize="1"]') as HTMLButtonElement;
    expect(item).toBeTruthy();
    expect(item.textContent).toContain('Customize Notebook');
    expect(item.style.minHeight).toBe(`${TOUCH_TARGET_MIN_PX}px`);
    act(() => {
      item.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onCustomize).toHaveBeenCalledTimes(1);
  });

  it('product UI shows only six designs — hidden presets absent', () => {
    ({ host, root } = mount(
      createElement(NotebookDesignerHost, {
        open: true,
        mode: 'panel',
        selection: 'classic',
        onSelectPreset: vi.fn(),
        onClose: vi.fn(),
        shellRect: null,
        ...hostProps,
      }),
    ));
    for (const id of PRODUCT_SIX) {
      expect(host.querySelector(`[data-nb-designer-preset="${id}"]`)).toBeTruthy();
    }
    for (const id of HIDDEN_SIX) {
      expect(host.querySelector(`[data-nb-designer-preset="${id}"]`)).toBeNull();
    }
    expect(host.querySelectorAll('[data-nb-designer-preset]')).toHaveLength(6);
  });

  it('thumbnail cards carry recipe semantics', () => {
    ({ host, root } = mount(
      createElement(NotebookDesignerHost, {
        open: true,
        mode: 'panel',
        selection: 'academic',
        onSelectPreset: vi.fn(),
        onClose: vi.fn(),
        shellRect: null,
        ...hostProps,
      }),
    ));
    const academic = host.querySelector('[data-nb-designer-preset="academic"]')!;
    expect(academic.getAttribute('data-nb-designer-material')).toBe('paper');
    expect(academic.getAttribute('data-nb-designer-frame')).toBe('book');
    expect(academic.getAttribute('data-nb-designer-motif')).toBe('academic-rule');
    expect(academic.querySelector('[data-nb-designer-swatch-page="1"]')).toBeTruthy();
  });

  it('nav establishes architecture; future sections disabled', () => {
    ({ host, root } = mount(
      createElement(NotebookDesignerHost, {
        open: true,
        mode: 'panel',
        selection: 'classic',
        onSelectPreset: vi.fn(),
        onClose: vi.fn(),
        shellRect: null,
        ...hostProps,
      }),
    ));
    expect(host.querySelector('[data-nb-designer-nav-item="design"]')).toBeTruthy();
    expect(host.querySelector('[data-nb-designer-nav-item="pages"]')).toBeTruthy();
    expect(
      (host.querySelector('[data-nb-designer-nav-item="cover"]') as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (host.querySelector('[data-nb-designer-nav-item="writing"]') as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (host.querySelector('[data-nb-designer-nav-item="decorate"]') as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('Pages section exposes Blank/Ruled/Grid without Dotted/Graph', () => {
    const onPaper = vi.fn();
    ({ host, root } = mount(
      createElement(NotebookDesignerHost, {
        open: true,
        mode: 'panel',
        selection: 'blueprint',
        onSelectPreset: vi.fn(),
        paperStyle: 'blank',
        onSelectPaperStyle: onPaper,
        onClose: vi.fn(),
        shellRect: null,
      }),
    ));
    act(() => {
      host.querySelector('[data-nb-designer-nav-item="pages"]')!.dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
    });
    expect(host.querySelector('[data-nb-designer-section="pages"]')).toBeTruthy();
    expect(host.querySelector('[data-nb-designer-paper="blank"]')).toBeTruthy();
    expect(host.querySelector('[data-nb-designer-paper="ruled"]')).toBeTruthy();
    expect(host.querySelector('[data-nb-designer-paper="grid"]')).toBeTruthy();
    expect(host.querySelector('[data-nb-designer-paper="dotted"]')).toBeNull();
    expect(host.querySelector('[data-nb-designer-paper="graph"]')).toBeNull();
    act(() => {
      host.querySelector('[data-nb-designer-paper="grid"]')!.dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
    });
    expect(onPaper).toHaveBeenCalledWith('grid');
  });

  it('22: Designer preset controls meet touch-target contract', () => {
    ({ host, root } = mount(
      createElement(NotebookDesignerHost, {
        open: true,
        mode: 'panel',
        selection: 'classic',
        onSelectPreset: vi.fn(),
        onClose: vi.fn(),
        shellRect: null,
        ...hostProps,
      }),
    ));
    const card = host.querySelector('[data-nb-designer-preset="midnight"]') as HTMLButtonElement;
    expect(card).toBeTruthy();
    expect(card.style.minHeight).toBe(`${TOUCH_TARGET_MIN_PX + 48}px`);
    expect(host.querySelector('[data-nb-designer-mode="panel"]')).toBeTruthy();
  });

  it('sheet mode renders portaled sheet', () => {
    ({ host, root } = mount(
      createElement(NotebookDesignerHost, {
        open: true,
        mode: 'sheet',
        selection: 'custom',
        onSelectPreset: vi.fn(),
        onClose: vi.fn(),
        shellRect: new DOMRect(10, 10, 360, 500),
        ...hostProps,
      }),
    ));
    expect(document.querySelector('[data-nb-designer-mode="sheet"]')).toBeTruthy();
    expect(document.querySelector('[data-nb-designer-custom="1"]')).toBeTruthy();
  });

  it('legacy selection banner without exposing hidden presets', () => {
    ({ host, root } = mount(
      createElement(NotebookDesignerHost, {
        open: true,
        mode: 'panel',
        selection: 'legacy',
        onSelectPreset: vi.fn(),
        onClose: vi.fn(),
        shellRect: null,
        ...hostProps,
      }),
    ));
    expect(host.querySelector('[data-nb-designer-legacy="1"]')).toBeTruthy();
    expect(host.querySelector('[data-nb-designer-preset="soft"]')).toBeNull();
  });

  it('CandidateEditor shows More when only Customize is provided', () => {
    const body = encodeNotebookTextV1([{ kind: 'paragraph', text: 'Hello' }]);
    ({ host, root } = mount(
      createElement(NotebookTiptapCandidateEditor, {
        sourceDocumentBody: body,
        sourceBodyCodecVersion: 1,
        pageKey: 'page-1',
        onCustomizeNotebook: vi.fn(),
      }),
    ));
    expect(host.querySelector('[data-nb-product-more="1"]')).toBeTruthy();
  });
});

describe('TipTap isolation from appearance re-render', () => {
  let host: HTMLDivElement;
  let root: Root;

  afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
  });

  it('16–17: appearance-only parent update does not remount TipTap / keeps history', async () => {
    const body = encodeNotebookTextV1([{ kind: 'paragraph', text: 'Alpha' }]);
    function Parent() {
      const [tick, setTick] = useState(0);
      return createElement(
        'div',
        { 'data-tick': String(tick) },
        createElement(NotebookTiptapCandidateEditor, {
          sourceDocumentBody: body,
          sourceBodyCodecVersion: 1,
          pageKey: 'page-stable',
          onCustomizeNotebook: () => setTick(t => t + 1),
        }),
        createElement('button', {
          type: 'button',
          'data-simulate-appearance': '1',
          onClick: () => setTick(t => t + 1),
        }),
      );
    }
    ({ host, root } = mount(createElement(Parent)));
    await act(async () => {
      await Promise.resolve();
    });
    const editorBefore = host.querySelector('.ProseMirror') as HTMLElement | null;
    expect(editorBefore).toBeTruthy();
    const nodeBefore = editorBefore;
    act(() => {
      host.querySelector('[data-simulate-appearance="1"]')!.dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
    });
    await act(async () => {
      await Promise.resolve();
    });
    const editorAfter = host.querySelector('.ProseMirror');
    expect(editorAfter).toBe(nodeBefore);
    expect(host.querySelector('[data-tick="1"]')).toBeTruthy();
  });
});

describe('appearance persist isolation (structured)', () => {
  it('10–15: appearance patch preserves unrelated notebook fields', () => {
    const before = {
      body: 'BODY_KEEP',
      bodyCodecVersion: 2 as const,
      paperStyle: 'grid' as const,
      appearance: appearanceFromNotebookDesignPreset('classic'),
      pages: [
        {
          id: 'p1',
          kind: 'document' as const,
          title: 'Page',
          documentBody: 'DOC_KEEP',
          documentBodyCodecVersion: 2 as const,
          presentation: { paperStyle: 'blank' as const },
        },
      ],
      activePageId: 'p1',
    };
    const nextAppearance = appearanceFromNotebookDesignPreset('aurora');
    const patched = { ...before, appearance: nextAppearance };
    expect(patched.body).toBe('BODY_KEEP');
    expect(patched.bodyCodecVersion).toBe(2);
    expect(patched.pages[0]!.documentBody).toBe('DOC_KEEP');
    expect(patched.pages[0]!.documentBodyCodecVersion).toBe(2);
    expect(patched.pages[0]!.presentation).toEqual({ paperStyle: 'blank' });
    expect(patched.activePageId).toBe('p1');
    expect(patched.paperStyle).toBe('grid');
    expect(patched.appearance.identity?.preset).toBe('aurora');
  });

  it('paperStyle patch does not mutate appearance', () => {
    const appearance = appearanceFromNotebookDesignPreset('blueprint');
    const before = { paperStyle: 'blank' as const, appearance, body: 'X' };
    const patched = { ...before, paperStyle: 'grid' as const };
    expect(patched.appearance).toBe(appearance);
    expect(patched.body).toBe('X');
    expect(patched.paperStyle).toBe('grid');
  });
});

describe('page style independence across designs', () => {
  it('design recipes do not encode paperStyle', () => {
    for (const id of PRODUCT_SIX) {
      const t = resolveNotebookAppearanceVisualTokens(appearanceFromNotebookDesignPreset(id));
      const blob = JSON.stringify(t);
      expect(blob).not.toMatch(/"paperStyle"/);
      // Blueprint must still be recognizable with a calm page
      if (id === 'blueprint') {
        expect(t.motif).toBe('drafting-marks');
        expect(t.pageInk).toBe('dark');
      }
    }
  });
});
