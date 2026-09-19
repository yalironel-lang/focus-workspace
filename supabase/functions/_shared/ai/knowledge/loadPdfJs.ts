/**
 * Load pdf.js for text-only extraction.
 *
 * Edge/Deno findings (real Supabase runtime):
 * 1) pdfjs-dist legacy evaluates `new DOMMatrix()` at module init (canvas path).
 *    Node may polyfill via `@napi-rs/canvas`; Edge does not → DOMMatrix crash.
 * 2) Even with a DOMMatrix shim + disableWorker:true, pdfjs still boots a
 *    "fake worker" and esm.sh Deno resolves a missing
 *    `.../denonext/legacy/build/pdf.worker.mjs`.
 *
 * Chosen Edge loader: pdfjs-serverless (Mozilla PDF.js redistributed for
 * edge/serverless — inlined worker + DOMMatrix stub). Same getDocument API.
 * Node/Vitest continues to use local pdfjs-dist (matches client family).
 */

import type { PdfJsModule } from './extractPdfText.ts';

declare const Deno: { env?: { get(key: string): string | undefined } } | undefined;

let cached: PdfJsModule | null = null;

/**
 * Minimal globals for Edge when using pdfjs-dist experiments.
 * pdfjs-serverless already ships its own stubs; this remains for diagnostics.
 */
export function installPdfJsEdgeCompatGlobals(): {
  installed: string[];
  skipped: string[];
} {
  const installed: string[] = [];
  const skipped: string[] = [];

  if (typeof globalThis.DOMMatrix === 'undefined') {
    globalThis.DOMMatrix = class DOMMatrix {
      constructor(_init?: unknown) {}
      invertSelf(): this {
        throw new Error('DOMMatrix.invertSelf unavailable in Edge text-only shim');
      }
      multiplySelf(_other?: unknown): this {
        throw new Error('DOMMatrix.multiplySelf unavailable in Edge text-only shim');
      }
      preMultiplySelf(_other?: unknown): this {
        throw new Error('DOMMatrix.preMultiplySelf unavailable in Edge text-only shim');
      }
      translate(_x?: number, _y?: number): this {
        throw new Error('DOMMatrix.translate unavailable in Edge text-only shim');
      }
      scale(_x?: number, _y?: number): this {
        throw new Error('DOMMatrix.scale unavailable in Edge text-only shim');
      }
    };
    installed.push('DOMMatrix');
  } else {
    skipped.push('DOMMatrix');
  }

  if (typeof globalThis.FinalizationRegistry === 'undefined') {
    globalThis.FinalizationRegistry = class FinalizationRegistry {
      constructor(_cleanup?: unknown) {}
      register(): void {}
      unregister(): boolean {
        return false;
      }
    } as unknown as typeof FinalizationRegistry;
    installed.push('FinalizationRegistry');
  } else {
    skipped.push('FinalizationRegistry');
  }

  const nav = (globalThis as { navigator?: Record<string, unknown> }).navigator;
  if (!nav || typeof nav !== 'object') {
    (globalThis as { navigator: Record<string, unknown> }).navigator = {
      language: 'en-US',
      platform: '',
      userAgent: '',
    };
    installed.push('navigator');
  } else {
    if (typeof nav.language !== 'string') nav.language = 'en-US';
    if (typeof nav.platform !== 'string') nav.platform = '';
    if (typeof nav.userAgent !== 'string') nav.userAgent = '';
    skipped.push('navigator');
  }

  return { installed, skipped };
}

export async function loadPdfJsModule(): Promise<PdfJsModule> {
  if (cached) return cached;

  if (typeof Deno !== 'undefined') {
    installPdfJsEdgeCompatGlobals();
    // Pin: serverless redistribution of Mozilla PDF.js (inlined worker).
    const mod = await import(
      // @ts-expect-error Deno URL import — resolved only at Edge runtime
      'https://esm.sh/pdfjs-serverless@1.3.1'
    );
    cached = mod as PdfJsModule;
    return cached;
  }

  // Node / Vitest: local pdfjs-dist (client-aligned family).
  const mod = await import('pdfjs-dist/legacy/build/pdf.mjs');
  cached = mod as unknown as PdfJsModule;
  return cached;
}

/** Which loader the current runtime will use (for probes/tests). */
export function pdfJsLoaderKind(): 'pdfjs-serverless-edge' | 'pdfjs-dist-node' {
  return typeof Deno !== 'undefined' ? 'pdfjs-serverless-edge' : 'pdfjs-dist-node';
}
