/**
 * Open a dedicated print document (not the TipTap editor DOM) and invoke
 * the browser print → Save as PDF flow. Sets document title for filename hint.
 *
 * IMPORTANT: Never inject host app stylesheets wholesale — Vite often bundles
 * KaTeX into the same CSS chunk as the dark Notebook theme, which would paint
 * the PDF black. Only pull KaTeX-specific rules / katex stylesheet URLs.
 */

export type PrintPdfOptions = {
  html: string;
  /** Suggested Save-as filename (browser uses <title> as a hint). */
  filename: string;
  /** Optional abort / cleanup delay after print dialog closes. */
  settleMs?: number;
};

function isKatexOnlyRule(cssText: string): boolean {
  const t = cssText.toLowerCase();
  if (!t.trim()) return false;
  // Keep KaTeX layout + KaTeX font-face rules only.
  if (t.includes('@font-face')) {
    return t.includes('katex') || t.includes('ka-');
  }
  return t.includes('katex') || t.includes('.mord') || t.includes('.mrel') || t.includes('.mbin');
}

function collectKatexCssFromHost(): string {
  if (typeof document === 'undefined') return '';
  const parts: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const href = 'href' in sheet && sheet.href ? String(sheet.href) : '';
      if (href && /katex/i.test(href)) {
        // Dedicated KaTeX stylesheet — safe to import (fonts resolve relative to it).
        parts.push(`@import url("${href}");`);
        continue;
      }
      const rules = sheet.cssRules;
      if (!rules) continue;
      const katexRules: string[] = [];
      for (let i = 0; i < rules.length; i += 1) {
        const text = rules[i]?.cssText ?? '';
        if (isKatexOnlyRule(text)) katexRules.push(text);
      }
      if (katexRules.length) parts.push(katexRules.join('\n'));
    } catch {
      // Cross-origin stylesheets may throw — ignore.
    }
  }
  return parts.join('\n');
}

/**
 * Inject KaTeX CSS into an HTML document string if host has it loaded.
 * Filters out non-KaTeX host rules to prevent dark-theme leakage into print.
 */
export function injectHostKatexCss(html: string): string {
  const katexCss = collectKatexCssFromHost();
  if (!katexCss) return html;
  if (html.includes('</head>')) {
    return html.replace(
      '</head>',
      `<style data-nb-pdf-katex="1">${katexCss}</style></head>`,
    );
  }
  return html;
}

/** Exported for tests — host CSS filtering contract. */
export function __testOnlyIsKatexOnlyRule(cssText: string): boolean {
  return isKatexOnlyRule(cssText);
}

/**
 * Print via a hidden iframe. Does not touch Notebook persistence.
 * Returns after the print dialog is dismissed (best-effort via afterprint).
 */
export function openNotebookPdfPrintDialog(opts: PrintPdfOptions): Promise<void> {
  const html = injectHostKatexCss(opts.html);
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined' || typeof window === 'undefined') {
      reject(new Error('PDF print requires a browser window'));
      return;
    }

    const iframe = document.createElement('iframe');
    iframe.setAttribute('data-nb-pdf-print-frame', '1');
    iframe.setAttribute('aria-hidden', 'true');
    // Keep iframe off-screen but with a real layout size so Chrome print
    // metrics are stable (0×0 frames can confuse pagination in some builds).
    iframe.style.cssText =
      'position:fixed;left:-10000px;top:0;width:210mm;height:297mm;border:0;opacity:0;pointer-events:none;';
    document.body.appendChild(iframe);

    const cleanup = () => {
      try {
        iframe.remove();
      } catch {
        /* ignore */
      }
    };

    const win = iframe.contentWindow;
    const doc = iframe.contentDocument;
    if (!win || !doc) {
      cleanup();
      reject(new Error('Could not open PDF print frame'));
      return;
    }

    doc.open();
    doc.write(html);
    doc.close();
    // Reinforce title for Save as PDF filename hint.
    try {
      doc.title = opts.filename.replace(/\.pdf$/i, '');
    } catch {
      /* ignore */
    }

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.setTimeout(cleanup, opts.settleMs ?? 500);
      resolve();
    };

    win.addEventListener('afterprint', finish);
    // Fallback if afterprint never fires.
    window.setTimeout(finish, 120_000);

    // Wait for images / fonts briefly before printing.
    const trigger = () => {
      try {
        win.focus();
        win.print();
      } catch (err) {
        cleanup();
        reject(err instanceof Error ? err : new Error('Print failed'));
      }
    };

    window.setTimeout(trigger, 350);
  });
}
