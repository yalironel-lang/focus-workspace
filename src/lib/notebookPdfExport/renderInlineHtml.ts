/**
 * Rich-line → HTML for PDF export (marks + math isolation + sanitized links).
 */

import type { InlineMark, InlineMarkType } from '../notebookInlineMarks';
import { parseMathSegments, renderKatexHtml } from '../notebookMath';
import { plainMathToLatex } from '../mathInputAssistant';
import { sanitizeUrl } from '../urlSanitizer';
import { resolveEffectiveDir } from '../notebookTiptap/direction';

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function katexInlineHtml(latexSource: string): string {
  const latex = plainMathToLatex(latexSource);
  const { html, error } = renderKatexHtml(latex, false);
  if (html && !error) {
    return `<span class="nb-pdf-math-inline" dir="ltr" style="direction:ltr;unicode-bidi:isolate;display:inline-block;vertical-align:middle">${html}</span>`;
  }
  return `<span class="nb-pdf-math-inline nb-pdf-math-fallback" dir="ltr" style="direction:ltr;unicode-bidi:isolate">${escapeHtml(latexSource)}</span>`;
}

function katexDisplayHtml(latexSource: string): string {
  const latex = plainMathToLatex(latexSource);
  const { html, error } = renderKatexHtml(latex, true);
  if (html && !error) {
    return `<div class="nb-pdf-math-display" dir="ltr" style="direction:ltr;unicode-bidi:isolate;text-align:center;margin:0.6em 0">${html}</div>`;
  }
  return `<div class="nb-pdf-math-display nb-pdf-math-fallback" dir="ltr" style="direction:ltr;unicode-bidi:isolate;text-align:center">${escapeHtml(latexSource)}</div>`;
}

/** Render plain text that may contain $...$ / $$...$$ delimiters (legacy). */
export function renderTextWithMathDelimiters(plain: string): string {
  const segments = parseMathSegments(plain);
  return segments
    .map(seg => {
      if (seg.type === 'text') return escapeHtml(seg.value);
      if (seg.type === 'inline') return katexInlineHtml(seg.latex);
      return katexDisplayHtml(seg.latex);
    })
    .join('');
}

type ActiveMark = { t: InlineMarkType; v?: string };

function wrapWithMarks(inner: string, active: ActiveMark[]): string {
  let html = inner;
  // Apply outer→inner so links wrap visual styles when both present at same span.
  const order: InlineMarkType[] = ['a', 'm', 's', 'u', 'i', 'b', 'hl', 'bg', 'fg', 'fs'];
  for (const t of order) {
    const mark = active.find(m => m.t === t);
    if (!mark) continue;
    switch (t) {
      case 'b':
        html = `<strong>${html}</strong>`;
        break;
      case 'i':
        html = `<em>${html}</em>`;
        break;
      case 'u':
        html = `<u>${html}</u>`;
        break;
      case 's':
        html = `<s>${html}</s>`;
        break;
      case 'fs':
        html = `<span style="font-size:${escapeHtml(mark.v ?? '16')}px">${html}</span>`;
        break;
      case 'fg':
        html = `<span style="color:${escapeHtml(mark.v ?? '#111')}">${html}</span>`;
        break;
      case 'bg':
      case 'hl':
        html = `<mark style="background-color:${escapeHtml(mark.v ?? '#fef08a')};color:inherit;border-radius:2px;padding:0 1px">${html}</mark>`;
        break;
      case 'm':
        // Math mark: re-render the plain span as KaTeX (inner is escaped plain).
        // Callers pass unescaped plain for math spans.
        break;
      case 'a': {
        const href = sanitizeUrl(mark.v);
        if (href) {
          html = `<a class="nb-pdf-link" href="${escapeHtml(href)}" rel="noopener noreferrer">${html}</a>`;
        } else {
          html = `<span class="nb-pdf-link-unsafe">${html}</span>`;
        }
        break;
      }
      default:
        break;
    }
  }
  return html;
}

/**
 * Render a rich line (plain + marks) to HTML.
 * Math marks (`m`) use KaTeX LTR isolation; unsafe link hrefs stay non-actionable.
 */
export function renderRichLineHtml(plain: string, marks: InlineMark[] | undefined): string {
  if (!plain) return '';
  if (!marks?.length) return renderTextWithMathDelimiters(plain);

  const bounds = new Set<number>([0, plain.length]);
  for (const m of marks) {
    bounds.add(m.s);
    bounds.add(m.e);
  }
  const points = [...bounds].sort((a, b) => a - b);
  const parts: string[] = [];

  for (let i = 0; i < points.length - 1; i += 1) {
    const start = points[i]!;
    const end = points[i + 1]!;
    if (end <= start) continue;
    const slice = plain.slice(start, end);
    const active = marks.filter(m => m.s <= start && m.e >= end);
    const mathMark = active.find(m => m.t === 'm');
    if (mathMark) {
      const withoutMath = active.filter(m => m.t !== 'm');
      parts.push(wrapWithMarks(katexInlineHtml(slice), withoutMath));
    } else {
      parts.push(wrapWithMarks(escapeHtml(slice), active));
    }
  }
  return parts.join('');
}

export function blockDirAttr(text: string): string {
  const dir = resolveEffectiveDir('auto', text);
  return dir === 'rtl' ? ' dir="rtl"' : ' dir="ltr"';
}

export { katexDisplayHtml, katexInlineHtml };
