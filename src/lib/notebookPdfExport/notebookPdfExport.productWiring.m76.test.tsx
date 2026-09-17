/**
 * M7.6 — Product wiring: expanded TipTap Notebook surface exposes Export PDF
 * via the compact More (⋯) menu and invokes the parent callback (M7.6 pipeline).
 */
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeNotebookTextV1 } from '../notebookTextCodec';
import { NotebookTiptapCandidateEditor } from '../../components/notebook/tiptap/NotebookTiptapCandidateEditor';

function mount(ui: React.ReactElement): { host: HTMLDivElement; root: Root } {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(ui);
  });
  return { host, root };
}

describe('M7.6 product Export PDF wiring (TipTap surface)', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    host?.remove();
  });

  it('shows More control on the product toolbar when onExportPdf is provided', () => {
    const onExportPdf = vi.fn();
    const body = encodeNotebookTextV1([{ kind: 'paragraph', text: 'Hello' }]);
    ({ host, root } = mount(
      createElement(NotebookTiptapCandidateEditor, {
        sourceDocumentBody: body,
        sourceBodyCodecVersion: 1,
        pageKey: 'page-1',
        onExportPdf,
      }),
    ));

    const toolbar = host.querySelector('[data-nb-product-toolbar="1"]');
    expect(toolbar).toBeTruthy();
    expect(toolbar!.querySelector('[data-nb-product-more="1"]')).toBeTruthy();
    expect(toolbar!.querySelector('[data-nb-product-toolbar-group="more"]')).toBeTruthy();
    // Compact writing tools remain; export is not a primary toolbar button.
    expect(toolbar!.querySelector('[data-nb-product-undo="1"]')).toBeTruthy();
    expect(host.textContent).not.toMatch(/\bPDF\b/);
  });

  it('More → Export PDF invokes the M7.6 parent callback', () => {
    const onExportPdf = vi.fn();
    const body = encodeNotebookTextV1([{ kind: 'paragraph', text: 'Hello' }]);
    ({ host, root } = mount(
      createElement(NotebookTiptapCandidateEditor, {
        sourceDocumentBody: body,
        sourceBodyCodecVersion: 1,
        pageKey: 'page-1',
        onExportPdf,
      }),
    ));

    const more = host.querySelector('[data-nb-product-more="1"]') as HTMLButtonElement;
    expect(more).toBeTruthy();
    act(() => {
      more.click();
    });

    const exportItem = document.querySelector(
      '[data-nb-product-export-pdf="1"]',
    ) as HTMLButtonElement;
    expect(exportItem).toBeTruthy();
    expect(exportItem.textContent).toContain('Export PDF');

    act(() => {
      exportItem.click();
    });
    expect(onExportPdf).toHaveBeenCalledTimes(1);
  });

  it('hides More menu when onExportPdf is absent (no orphan chrome)', () => {
    const body = encodeNotebookTextV1([{ kind: 'paragraph', text: 'Hello' }]);
    ({ host, root } = mount(
      createElement(NotebookTiptapCandidateEditor, {
        sourceDocumentBody: body,
        sourceBodyCodecVersion: 1,
        pageKey: 'page-1',
      }),
    ));
    expect(host.querySelector('[data-nb-product-more="1"]')).toBeNull();
  });

  it('ProjectNotebookBlock wires onExportPdf to exportNotebookAsPdf', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(
      path.join(process.cwd(), 'src/components/project-space/ProjectNotebookBlock.tsx'),
      'utf8',
    );
    expect(src).toMatch(/onExportPdf=\{\(\)\s*=>\s*void exportNotebookAsPdf\(\)\}/);
    expect(src).toContain('exportNotebookPdf');
  });
});
