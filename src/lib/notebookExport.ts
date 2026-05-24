/**
 * Notebook copy/export helpers.
 * Storage format (`content.body`) is already markdown-lite; these produce clean clipboard text.
 */

function plainTextFromLine(raw: string): string {
  const normalized = raw.replace(/\u00a0/g, ' ');
  const trimmed = normalized.trim();
  if (trimmed === '' || trimmed === '---') return '';
  if (trimmed.startsWith('## ')) return trimmed.slice(3).trimEnd();
  if (/^#(?!#)\s/.test(trimmed)) return trimmed.replace(/^#\s+/, '').trimEnd();
  const ordered = trimmed.match(/^(\d+)\.\s*(.*)$/);
  if (ordered) return (ordered[2] ?? '').trimEnd();
  const task = trimmed.match(/^- \[\s*[xX ]\s*\]\s*(.*)$/);
  if (task) return (task[1] ?? '').trimEnd();
  const bullet = normalized.match(/^\s*- (?!\[)\s*(.*)$/);
  if (bullet) return (bullet[1] ?? '').trimEnd();
  if (trimmed.startsWith('> ')) return trimmed.slice(2).trimEnd();
  const stepLine = trimmed.match(/^=>\s*(.*)$/);
  if (stepLine) return (stepLine[1] ?? '').trimEnd();
  const callout = trimmed.match(/^!(summary|concept|review|definition|theorem|example|mistake)\s*(.*)$/i);
  if (callout) return (callout[2] ?? '').trimEnd();
  if (trimmed.startsWith('$$')) return trimmed.replace(/^\$\$\s*/, '').trimEnd();
  if (trimmed.startsWith('::img::')) return '';
  if (trimmed.startsWith('\u00b6\u00b6')) return trimmed.slice(2).trimStart().trimEnd();
  if (trimmed.startsWith('\u00b6')) return trimmed.slice(1).trimStart().trimEnd();
  return normalized.trimEnd();
}

/** Markdown storage body (pass-through). */
export function notebookBodyToMarkdown(body: string): string {
  return body;
}

/** Human-readable plain text for clipboard / export. */
export function notebookBodyToPlainText(body: string): string {
  if (!body.trim()) return '';
  return body
    .split(/\r?\n/)
    .map(plainTextFromLine)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd();
}
