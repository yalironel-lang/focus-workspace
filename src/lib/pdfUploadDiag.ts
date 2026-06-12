/** Temporary iPad-safe PDF upload diagnostics (sessionStorage — no localhost ingest). */
const STORAGE_KEY = 'fw_pdf_upload_diag_v1';
const MAX = 60;

export type PdfUploadDiagEntry = {
  ts: number;
  phase: string;
  data?: Record<string, unknown>;
};

function read(): PdfUploadDiagEntry[] {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '[]') as PdfUploadDiagEntry[];
  } catch {
    return [];
  }
}

export function pdfUploadDiag(phase: string, data?: Record<string, unknown>): void {
  const entry: PdfUploadDiagEntry = { ts: Date.now(), phase, data };
  try {
    const prev = read();
    prev.push(entry);
    if (prev.length > MAX) prev.splice(0, prev.length - MAX);
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(prev));
  } catch {
    /* private mode */
  }
  if (import.meta.env.DEV) {
    console.info('[pdf-diag]', phase, data ?? '');
  }
}

export function pdfUploadDiagDump(): PdfUploadDiagEntry[] {
  return read();
}

export function pdfUploadDiagClear(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

declare global {
  interface Window {
    __fwPdfDiag?: () => PdfUploadDiagEntry[];
    __fwPdfDiagClear?: () => void;
  }
}

if (typeof window !== 'undefined') {
  window.__fwPdfDiag = pdfUploadDiagDump;
  window.__fwPdfDiagClear = pdfUploadDiagClear;
}
