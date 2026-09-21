/**
 * Authoritative ask_course Sources list.
 * Only sources[] drives labels and interaction — never model-fabricated metadata.
 */

import { memo } from 'react';
import type { AskCourseSourceRef } from '../../lib/ai/gatewayClient';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';

type Props = {
  sources: AskCourseSourceRef[];
  tokens: AtmosphereTokens;
  accent: string;
  onSourceActivate?: (source: AskCourseSourceRef) => void;
};

export function formatAskCourseSourceLabel(source: AskCourseSourceRef): string {
  if ((source as { sourceKind?: string }).sourceKind === 'notebook_page') {
    const nb = source as Extract<AskCourseSourceRef, { sourceKind: 'notebook_page' }>;
    const notebook =
      typeof nb.notebookTitle === 'string' && nb.notebookTitle.trim()
        ? nb.notebookTitle.trim()
        : 'Notebook';
    const page =
      typeof nb.pageTitle === 'string' && nb.pageTitle.trim()
        ? nb.pageTitle.trim()
        : 'Page';
    return `Notebook: ${notebook} · ${page}`;
  }
  const pdf = source as Extract<AskCourseSourceRef, { sourceKind: 'free_space_pdf' }>;
  const name =
    typeof pdf.fileName === 'string' && pdf.fileName.trim()
      ? pdf.fileName.trim()
      : 'Course material';
  const page = Number.isFinite(pdf.pageNumber) ? pdf.pageNumber : 1;
  return `${name} · p. ${page}`;
}

export const AskZikukSources = memo(function AskZikukSources({
  sources,
  tokens,
  accent,
  onSourceActivate,
}: Props) {
  if (!sources.length) return null;

  return (
    <div data-ask-zikuk-sources="1" style={{ marginTop: 12 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          color: tokens.textMuted,
          marginBottom: 8,
        }}
      >
        Sources
      </div>
      <ul
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        {sources.map(source => {
          const label = formatAskCourseSourceLabel(source);
          return (
            <li
              key={`${source.index}-${
                (source as { sourceKind?: string }).sourceKind === 'notebook_page'
                  ? (source as Extract<AskCourseSourceRef, { sourceKind: 'notebook_page' }>).pageId
                  : (source as Extract<AskCourseSourceRef, { sourceKind: 'free_space_pdf' }>)
                      .sourceObjectId
              }`}
            >
              <button
                type="button"
                data-ask-zikuk-source-index={source.index}
                aria-label={`Open source ${source.index}: ${label}`}
                onClick={() => onSourceActivate?.(source)}
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 8,
                  width: '100%',
                  textAlign: 'left',
                  padding: '8px 10px',
                  borderRadius: 10,
                  border: `1px solid ${tokens.cardBorder}66`,
                  background: `${tokens.wellBg}88`,
                  color: tokens.textSecondary,
                  fontSize: 12,
                  lineHeight: 1.4,
                  cursor: onSourceActivate ? 'pointer' : 'default',
                }}
              >
                <span style={{ color: accent, fontWeight: 700, flexShrink: 0 }}>
                  [{source.index}]
                </span>
                <span style={{ color: tokens.textPrimary }}>{label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
});
