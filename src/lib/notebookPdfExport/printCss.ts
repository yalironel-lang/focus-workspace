/** Print CSS for academic A4 Notebook PDF export — visually independent of app theme. */

export const NOTEBOOK_PDF_PRINT_CSS = `
@page {
  size: A4 portrait;
  margin: 18mm 18mm 18mm 18mm;
}

html {
  background: #ffffff !important;
  color: #1c1917 !important;
}
html, body {
  margin: 0 !important;
  padding: 0 !important;
  background: #ffffff !important;
  color: #1c1917 !important;
  font-family: "Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, "Times New Roman", serif;
  font-size: 11pt;
  line-height: 1.5;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
body * {
  box-sizing: border-box;
}

.nb-pdf-doc {
  max-width: 100%;
  background: #ffffff !important;
  color: #1c1917 !important;
  margin: 0;
  padding: 0;
}

/*
 * Pagination contract (unchanged from validated M7.6 QA):
 * - First notebook section must NOT force a page break.
 * - Each subsequent notebook page starts on a new PDF sheet.
 */
.nb-pdf-page {
  page-break-before: auto;
  break-before: auto;
  page-break-after: auto;
  break-after: auto;
  background: #ffffff !important;
  color: #1c1917 !important;
}
.nb-pdf-page + .nb-pdf-page {
  page-break-before: always;
  break-before: page;
}

.nb-pdf-notebook-title {
  font-size: 18pt; /* ~24px */
  font-weight: 650;
  margin: 0 0 4mm;
  letter-spacing: -0.015em;
  line-height: 1.25;
  color: #1c1917 !important;
  page-break-after: avoid;
  break-after: avoid;
}
.nb-pdf-page-title {
  font-size: 12pt; /* ~16px */
  font-weight: 600;
  margin: 0 0 3.5mm;
  padding-bottom: 1.5mm;
  border-bottom: 1px solid #e7e5e4;
  color: #44403c !important;
  page-break-after: avoid;
  break-after: avoid;
}
.nb-pdf-page-title + .nb-pdf-title,
.nb-pdf-notebook-title + .nb-pdf-title {
  margin-top: 1mm;
}
.nb-pdf-title {
  font-size: 13.5pt;
  font-weight: 650;
  margin: 0 0 2mm;
  line-height: 1.3;
  color: #1c1917 !important;
  page-break-after: avoid;
  break-after: avoid;
}
.nb-pdf-section {
  font-size: 12pt;
  font-weight: 650;
  margin: 4mm 0 1.8mm;
  color: #1c1917 !important;
  page-break-after: avoid;
  break-after: avoid;
}
.nb-pdf-p {
  margin: 0 0 2mm;
  color: inherit;
}
.nb-pdf-muted { color: #57534e !important; }
.nb-pdf-fine { font-size: 9.5pt; color: #57534e !important; }
.nb-pdf-ul, .nb-pdf-ol {
  margin: 0 0 2.5mm;
  padding-inline-start: 5mm;
}
.nb-pdf-li, .nb-pdf-oli { margin: 0 0 1mm; }
.nb-pdf-li[data-depth="1"] { margin-inline-start: 4mm; }
.nb-pdf-li[data-depth="2"] { margin-inline-start: 8mm; }
.nb-pdf-task {
  display: flex;
  gap: 2mm;
  align-items: flex-start;
  margin: 0 0 1.8mm;
}
.nb-pdf-task-box { flex: 0 0 auto; }
.nb-pdf-quote {
  margin: 2.5mm 0;
  padding: 1.2mm 0 1.2mm 3mm;
  border-inline-start: 2px solid #a8a29e;
  color: #44403c !important;
  font-style: italic;
  break-inside: avoid;
  page-break-inside: avoid;
}
.nb-pdf-step {
  margin: 0 0 2mm;
  padding: 1.4mm 2.2mm;
  background: #f5f5f4 !important;
  color: #1c1917 !important;
  border-radius: 2px;
  break-inside: avoid;
  page-break-inside: avoid;
}
.nb-pdf-step-label {
  font-weight: 650;
  font-size: 8.5pt;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #57534e !important;
}
.nb-pdf-divider {
  border: none;
  border-top: 1px solid #e7e5e4;
  margin: 3mm 0;
}
.nb-pdf-callout {
  margin: 2.8mm 0;
  padding: 2mm 2.5mm;
  border: 1px solid #e7e5e4;
  border-radius: 2px;
  background: #fafaf9 !important;
  color: #1c1917 !important;
  break-inside: avoid;
  page-break-inside: avoid;
}
.nb-pdf-callout-label {
  font-size: 8pt;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #57534e !important;
  margin-bottom: 1mm;
}
.nb-pdf-callout-definition { border-inline-start: 2.5px solid #57534e; }
.nb-pdf-callout-concept { border-inline-start: 2.5px solid #44403c; }
.nb-pdf-callout-theorem { border-inline-start: 2.5px solid #1c1917; }
.nb-pdf-callout-example { border-inline-start: 2.5px solid #78716c; }
.nb-pdf-callout-mistake { border-inline-start: 2.5px solid #a8a29e; }
.nb-pdf-callout-summary { border-inline-start: 2.5px solid #a8a29e; }
.nb-pdf-callout-review { border-inline-start: 2.5px solid #78716c; }
.nb-pdf-math-display {
  margin: 2.5mm 0;
  color: #1c1917 !important;
  break-inside: avoid;
  page-break-inside: avoid;
}
.nb-pdf-math-inline {
  color: #1c1917 !important;
}
.nb-pdf-table-wrap {
  margin: 2.5mm 0;
  overflow: visible;
  break-inside: avoid;
  page-break-inside: avoid;
}
.nb-pdf-table {
  width: 100%;
  max-width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  font-size: 10pt;
  background: #ffffff !important;
  color: #1c1917 !important;
}
.nb-pdf-table td {
  border: 1px solid #d6d3d1;
  padding: 1.4mm 1.8mm;
  vertical-align: top;
  word-wrap: break-word;
  overflow-wrap: anywhere;
  background: #ffffff !important;
  color: #1c1917 !important;
}
.nb-pdf-figure {
  margin: 3mm auto;
  text-align: center;
  break-inside: avoid;
  page-break-inside: avoid;
  max-width: 90%;
}
.nb-pdf-image {
  display: block;
  margin-left: auto;
  margin-right: auto;
  max-width: 100% !important;
  width: auto !important;
  height: auto !important;
  max-height: 145mm;
  object-fit: contain;
  background: transparent;
  border: none;
}
.nb-pdf-hw,
.nb-pdf-write-page {
  max-width: 88%;
  margin-left: auto;
  margin-right: auto;
}
.nb-pdf-hw-image {
  display: block;
  margin-left: auto;
  margin-right: auto;
  max-width: 100% !important;
  width: auto !important;
  height: auto !important;
  max-height: 110mm;
  object-fit: contain;
  background: transparent;
  border: none;
}
.nb-pdf-missing {
  margin: 2.5mm 0;
  padding: 2mm 2.5mm;
  border: 1px dashed #d6d3d1;
  color: #57534e !important;
  background: #fafaf9 !important;
  font-size: 9.5pt;
  break-inside: avoid;
  page-break-inside: avoid;
}
.nb-pdf-link {
  color: #1d4ed8 !important;
  text-decoration: underline;
  text-underline-offset: 1.5px;
}
.nb-pdf-link-unsafe {
  text-decoration: underline;
  text-decoration-style: dotted;
  color: inherit;
}

.katex, .katex * {
  color: #1c1917 !important;
}

@media print {
  html, body, .nb-pdf-doc, .nb-pdf-page {
    background: #ffffff !important;
    color: #1c1917 !important;
  }
  .nb-pdf-no-print { display: none !important; }
  .nb-pdf-screen-only { display: none !important; }
}

@media screen {
  body {
    padding: 24px;
    background: #e7e5e4 !important;
  }
  .nb-pdf-doc {
    background: #fff !important;
    max-width: 210mm;
    margin: 0 auto;
    padding: 18mm 16mm;
    box-shadow: 0 1px 4px rgba(0,0,0,0.08);
  }
}
`;
