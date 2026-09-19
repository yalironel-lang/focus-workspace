/**
 * Minimal deterministic PDF fixtures for M0.5B tests (no large binaries).
 */

function buildPdf(pages: string[]): Uint8Array {
  const objects: string[] = [];
  const pageRefs: string[] = [];

  // Font
  const fontObjNum = 3 + pages.length * 2;
  // We'll assign numbers carefully:
  // 1 Catalog, 2 Pages, then for each page: pageObj, contentObj, then font at end.

  let next = 3;
  const pageObjNums: number[] = [];
  const contentObjNums: number[] = [];
  for (let i = 0; i < pages.length; i++) {
    pageObjNums.push(next++);
    contentObjNums.push(next++);
  }
  const fontNum = next++;

  for (let i = 0; i < pages.length; i++) {
    const pageNum = pageObjNums[i]!;
    const contentNum = contentObjNums[i]!;
    pageRefs.push(`${pageNum} 0 R`);

    const escaped = pages[i]!
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)');

    // Multi-line: split into Td lines for long pages
    const lines = escaped.split('\n');
    let content = 'BT /F1 12 Tf 72 720 Td\n';
    lines.forEach((line, idx) => {
      if (idx > 0) content += '0 -16 Td\n';
      content += `(${line}) Tj\n`;
    });
    content += 'ET';

    objects.push(
      `${pageNum} 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentNum} 0 R /Resources<< /Font<< /F1 ${fontNum} 0 R >> >> >>endobj\n`,
    );
    objects.push(
      `${contentNum} 0 obj<< /Length ${content.length} >>stream\n${content}\nendstream\nendobj\n`,
    );
  }

  const catalog = '1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n';
  const pagesObj =
    `2 0 obj<< /Type /Pages /Kids [${pageRefs.join(' ')}] /Count ${pages.length} >>endobj\n`;
  const font =
    `${fontNum} 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n`;

  const parts = [catalog, pagesObj, ...objects, font];
  let body = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const part of parts) {
    offsets.push(byteLength(body));
    body += part;
  }
  const xrefStart = byteLength(body);
  let xref = `xref\n0 ${offsets.length}\n`;
  xref += '0000000000 65535 f \n';
  for (let i = 1; i < offsets.length; i++) {
    xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  body += xref;
  body += `trailer<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return new TextEncoder().encode(body);
}

function byteLength(s: string): number {
  return new TextEncoder().encode(s).byteLength;
}

/** A. Normal 1-page text PDF */
export function fixturePdfOnePage(): Uint8Array {
  return buildPdf([
    'Hello ZIKUK page one. This lecture note contains enough extractable text for ingestion tests.',
  ]);
}

/** B. Multi-page text PDF */
export function fixturePdfMultiPage(): Uint8Array {
  return buildPdf([
    'Page one alpha content for extraction with enough characters to pass the minimum document threshold.',
    'Page two beta content for extraction with enough characters to pass the minimum document threshold.',
    'Page three gamma content for extraction with enough characters to pass the minimum document threshold.',
  ]);
}

/** C. Blank / no-text PDF (empty content streams) */
export function fixturePdfBlank(): Uint8Array {
  return buildPdf(['', '', '']);
}

/** D. Long page requiring multiple chunks */
export function fixturePdfLongPage(): Uint8Array {
  const lines: string[] = [];
  for (let i = 0; i < 120; i++) {
    lines.push(
      `Sentence number ${i} elaborates a longer university lecture paragraph about topic ${i}.`,
    );
  }
  // Many separate text-show lines so extractors preserve length.
  return buildPdf([lines.join('\n')]);
}

/** E. Malformed / non-PDF bytes */
export function fixtureNotPdf(): Uint8Array {
  return new TextEncoder().encode('this is not a pdf file at all');
}
