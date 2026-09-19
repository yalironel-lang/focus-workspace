/**
 * Tiny synthetic PDF used ONLY for Edge compatibility probes.
 * Not a real user document.
 */

export const EDGE_PROBE_PAGE1 = 'ZIKUK_EDGE_PROBE_PAGE_1';
export const EDGE_PROBE_PAGE2 = 'ZIKUK_EDGE_PROBE_PAGE_2';

function byteLength(s: string): number {
  return new TextEncoder().encode(s).byteLength;
}

/** Deterministic 2-page text PDF for Edge synthetic probes. */
export function fixturePdfEdgeProbe(): Uint8Array {
  const pages = [EDGE_PROBE_PAGE1, EDGE_PROBE_PAGE2];
  const pageObjNums = [3, 5];
  const contentObjNums = [4, 6];
  const fontNum = 7;
  const pageRefs = pageObjNums.map((n) => `${n} 0 R`);

  const objects: string[] = [];
  for (let i = 0; i < pages.length; i++) {
    const pageNum = pageObjNums[i]!;
    const contentNum = contentObjNums[i]!;
    const text = pages[i]!;
    const content = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
    objects.push(
      `${pageNum} 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentNum} 0 R /Resources<< /Font<< /F1 ${fontNum} 0 R >> >> >>endobj\n`,
    );
    objects.push(
      `${contentNum} 0 obj<< /Length ${content.length} >>stream\n${content}\nendstream\nendobj\n`,
    );
  }

  const parts = [
    '1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n',
    `2 0 obj<< /Type /Pages /Kids [${pageRefs.join(' ')}] /Count ${pages.length} >>endobj\n`,
    ...objects,
    `${fontNum} 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n`,
  ];

  let body = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const part of parts) {
    offsets.push(byteLength(body));
    body += part;
  }
  const xrefStart = byteLength(body);
  let xref = `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i++) {
    xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  body += xref;
  body += `trailer<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return new TextEncoder().encode(body);
}
