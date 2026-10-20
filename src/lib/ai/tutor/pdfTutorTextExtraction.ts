import type { NormalizedPageRegion } from '../../pdfGeometry/normalizedPageRegion';

export type PdfTextItem = {
  str?: string;
  transform?: number[];
  width?: number;
  height?: number;
};

export type PdfTextContent = { items?: PdfTextItem[] };

type TextBox = { text: string; left: number; top: number; right: number; bottom: number };

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

function overlap(a: TextBox, region: NormalizedPageRegion): number {
  const left = Math.max(a.left, region.x);
  const top = Math.max(a.top, region.y);
  const right = Math.min(a.right, region.x + region.w);
  const bottom = Math.min(a.bottom, region.y + region.h);
  return Math.max(0, right - left) * Math.max(0, bottom - top);
}

function toTextBox(item: PdfTextItem, pageWidth: number, pageHeight: number): TextBox | null {
  const transform = item.transform;
  const text = item.str?.trim();
  if (!transform || transform.length < 6 || !text) return null;
  const x = Number(transform[4]);
  const baseline = Number(transform[5]);
  const width = Math.abs(Number(item.width) || Math.hypot(Number(transform[0]), Number(transform[1])) * text.length);
  const height = Math.abs(Number(item.height) || Math.hypot(Number(transform[2]), Number(transform[3])) || 1);
  if (![x, baseline, width, height].every(Number.isFinite) || pageWidth <= 0 || pageHeight <= 0) return null;
  const left = clamp01(x / pageWidth);
  const right = clamp01((x + width) / pageWidth);
  const top = clamp01((pageHeight - baseline - height) / pageHeight);
  const bottom = clamp01((pageHeight - baseline) / pageHeight);
  return { text, left, top, right: Math.max(left, right), bottom: Math.max(top, bottom) };
}

export function extractPdfTextFromRegion(
  content: PdfTextContent,
  pageWidth: number,
  pageHeight: number,
  region: NormalizedPageRegion,
): string | undefined {
  const selected = (content.items ?? [])
    .map(item => toTextBox(item, pageWidth, pageHeight))
    .filter((item): item is TextBox => !!item && overlap(item, region) > 0)
    .sort((a, b) => {
      const lineDelta = a.top - b.top;
      return Math.abs(lineDelta) > 0.012 ? lineDelta : a.left - b.left;
    });
  if (selected.length === 0) return undefined;

  const lines: TextBox[][] = [];
  for (const item of selected) {
    const line = lines.find(group => Math.abs(group[0].top - item.top) <= 0.012);
    if (line) line.push(item);
    else lines.push([item]);
  }
  return lines
    .map(line => line.sort((a, b) => a.left - b.left).map(item => item.text).join(' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}
