/**
 * Notebook page presentation — visual paper + layout template metadata.
 *
 * Lives on NotebookPage.presentation only.
 * Never stored in documentBody / body / codec / TipTap JSON.
 *
 * Notebook default paper remains content.paperStyle (separate SoT).
 * Absent page.presentation = inherit notebook default / layout 'free' at read time.
 * Opening notebooks must never write presentation defaults.
 */

/** Aligned with NotebookPaperStyle — do not expand without product + CSS decision. */
export type NotebookPagePaperStyle = 'blank' | 'ruled' | 'grid';

/**
 * Semantic page layout template.
 * V1: only 'free' (unstructured editor). Cornell / columns etc. deferred.
 */
export type NotebookLayoutTemplateId = 'free';

export type NotebookPagePresentation = {
  paperStyle?: NotebookPagePaperStyle;
  layoutTemplate?: NotebookLayoutTemplateId;
};

export const NOTEBOOK_PAGE_PAPER_STYLES: readonly NotebookPagePaperStyle[] = [
  'blank',
  'ruled',
  'grid',
] as const;

export const NOTEBOOK_LAYOUT_TEMPLATE_IDS: readonly NotebookLayoutTemplateId[] = [
  'free',
] as const;

const PAPER_SET = new Set<string>(NOTEBOOK_PAGE_PAPER_STYLES);
const LAYOUT_SET = new Set<string>(NOTEBOOK_LAYOUT_TEMPLATE_IDS);

export function isNotebookPagePaperStyle(v: unknown): v is NotebookPagePaperStyle {
  return typeof v === 'string' && PAPER_SET.has(v);
}

export function isNotebookLayoutTemplateId(v: unknown): v is NotebookLayoutTemplateId {
  return typeof v === 'string' && LAYOUT_SET.has(v);
}

/**
 * Whitelist sanitize for page.presentation.
 * Returns undefined when absent or when nothing valid remains (no default injection).
 * Never throws.
 */
export function sanitizeNotebookPagePresentation(
  raw: unknown,
): NotebookPagePresentation | undefined {
  try {
    if (raw === undefined || raw === null) return undefined;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
    const r = raw as Record<string, unknown>;

    let paperStyle: NotebookPagePaperStyle | undefined;
    if (isNotebookPagePaperStyle(r.paperStyle)) paperStyle = r.paperStyle;

    let layoutTemplate: NotebookLayoutTemplateId | undefined;
    if (isNotebookLayoutTemplateId(r.layoutTemplate)) layoutTemplate = r.layoutTemplate;

    if (!paperStyle && !layoutTemplate) return undefined;
    return {
      ...(paperStyle !== undefined ? { paperStyle } : {}),
      ...(layoutTemplate !== undefined ? { layoutTemplate } : {}),
    };
  } catch {
    return undefined;
  }
}

export const DEFAULT_NOTEBOOK_PAGE_PAPER_STYLE: NotebookPagePaperStyle = 'ruled';
export const DEFAULT_NOTEBOOK_LAYOUT_TEMPLATE: NotebookLayoutTemplateId = 'free';

export type ResolveNotebookPagePaperStyleInput = {
  page: { presentation?: NotebookPagePresentation | null } | null | undefined;
  /** Notebook-level content.paperStyle */
  notebookPaperStyle?: string | null;
};

/**
 * Read-time paper resolution. Does not write defaults into page or notebook.
 */
export function resolveNotebookPagePaperStyle(
  input: ResolveNotebookPagePaperStyleInput,
): NotebookPagePaperStyle {
  const override = input.page?.presentation?.paperStyle;
  if (isNotebookPagePaperStyle(override)) return override;
  if (isNotebookPagePaperStyle(input.notebookPaperStyle)) return input.notebookPaperStyle;
  return DEFAULT_NOTEBOOK_PAGE_PAPER_STYLE;
}

export type ResolveNotebookPageLayoutTemplateInput = {
  page: { presentation?: NotebookPagePresentation | null } | null | undefined;
};

/**
 * Read-time layout resolution. Absent → 'free'. Never persists that default.
 */
export function resolveNotebookPageLayoutTemplate(
  input: ResolveNotebookPageLayoutTemplateInput,
): NotebookLayoutTemplateId {
  const override = input.page?.presentation?.layoutTemplate;
  if (isNotebookLayoutTemplateId(override)) return override;
  return DEFAULT_NOTEBOOK_LAYOUT_TEMPLATE;
}

/** Structural compare for restore equivalence — order-independent key presence. */
export function notebookPagePresentationsEqual(
  a: NotebookPagePresentation | null | undefined,
  b: NotebookPagePresentation | null | undefined,
): boolean {
  const sa = sanitizeNotebookPagePresentation(a ?? undefined);
  const sb = sanitizeNotebookPagePresentation(b ?? undefined);
  if (!sa && !sb) return true;
  if (!sa || !sb) return false;
  return sa.paperStyle === sb.paperStyle && sa.layoutTemplate === sb.layoutTemplate;
}
