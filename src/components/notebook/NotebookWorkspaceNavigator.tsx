import { useCallback, useEffect, useRef, useState } from 'react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import {
  pageDisplayTitle,
  sectionDisplayTitle,
  type NotebookContentWithPages,
  type NotebookPage,
  type NotebookPageKind,
  type NotebookSection,
} from '../../lib/notebookPages';

type NotebookShellContent = NotebookContentWithPages;

interface Props {
  content: NotebookShellContent;
  tokens: AtmosphereTokens;
  onSwitchSection: (sectionId: string) => void;
  onSwitchPage: (pageId: string) => void;
  onAddSection: () => void;
  onAddPage: (kind: NotebookPageKind) => void;
  onRenameSection: (sectionId: string, title: string) => void;
  onRenamePage: (pageId: string, title: string) => void;
}

function PageKindIcon({ kind, tokens }: { kind: NotebookPageKind; tokens: AtmosphereTokens }) {
  const color = tokens.textGhost;
  if (kind === 'write') {
    return (
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden style={{ flexShrink: 0 }}>
        <path
          d="M2 9.5L8.5 3l1 1L3 10.5H2v-1zM9 2.5l.5-.5a.7.7 0 0 1 1 1L10 3.5"
          stroke={color}
          strokeWidth="1.1"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden style={{ flexShrink: 0 }}>
      <path d="M2.5 3h7M2.5 6h7M2.5 9h4.5" stroke={color} strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}

function InlineRenameRow({
  label,
  isActive,
  tokens,
  onCommit,
  onActivate,
  leading,
}: {
  label: string;
  isActive: boolean;
  tokens: AtmosphereTokens;
  onCommit: (next: string) => void;
  onActivate: () => void;
  leading?: React.ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(label);
  }, [label, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commit = useCallback(() => {
    const trimmed = draft.trim();
    setEditing(false);
    if (trimmed && trimmed !== label) onCommit(trimmed);
  }, [draft, label, onCommit]);

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            setDraft(label);
            setEditing(false);
          }
        }}
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%',
          fontSize: 12,
          fontWeight: 600,
          padding: '4px 8px',
          borderRadius: 6,
          border: `1px solid ${tokens.cardBorder}`,
          background: tokens.wellBg,
          color: tokens.textPrimary,
          outline: 'none',
          boxSizing: 'border-box',
        }}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={onActivate}
      onDoubleClick={e => {
        e.stopPropagation();
        e.preventDefault();
        setEditing(true);
      }}
      title="Double-click to rename"
      style={{
        width: '100%',
        textAlign: 'left',
        border: 'none',
        background: isActive ? `${tokens.accent}18` : 'transparent',
        color: isActive ? tokens.accent : tokens.textSecondary,
        fontSize: 12,
        fontWeight: isActive ? 700 : 600,
        padding: '6px 8px',
        borderRadius: 6,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        minWidth: 0,
      }}
    >
      {leading}
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
    </button>
  );
}

export function NotebookWorkspaceNavigator({
  content,
  tokens,
  onSwitchSection,
  onSwitchPage,
  onAddSection,
  onAddPage,
  onRenameSection,
  onRenamePage,
}: Props) {
  const sections = content.sections ?? [];
  const pages = content.pages ?? [];
  const activeSectionId = content.activeSectionId;
  const activePageId = content.activePageId;

  if (sections.length === 0) return null;

  return (
    <div
      data-nb-workspace-nav="1"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        gap: 8,
        padding: '8px 8px 12px',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: tokens.textGhost,
          padding: '0 4px',
        }}
      >
        Topics
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {sections.map((section: NotebookSection, sectionIndex) => {
          const isActiveSection = section.id === activeSectionId;
          const sectionPages: NotebookPage[] = section.pageIds
            .map(id => pages.find(p => p.id === id))
            .filter((p): p is NotebookPage => p !== undefined);

          return (
            <div key={section.id} style={{ marginBottom: 10 }}>
              <InlineRenameRow
                label={sectionDisplayTitle(section, sectionIndex + 1)}
                isActive={isActiveSection}
                tokens={tokens}
                onCommit={title => onRenameSection(section.id, title)}
                onActivate={() => {
                  if (!isActiveSection) onSwitchSection(section.id);
                }}
              />
              {isActiveSection ? (
                <div style={{ marginTop: 4, paddingLeft: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {sectionPages.map((page, pageIndex) => {
                    const isActivePage = page.id === activePageId;
                    return (
                      <InlineRenameRow
                        key={page.id}
                        label={pageDisplayTitle(page, pageIndex + 1)}
                        isActive={isActivePage}
                        tokens={tokens}
                        leading={<PageKindIcon kind={page.kind} tokens={tokens} />}
                        onCommit={title => onRenamePage(page.id, title)}
                        onActivate={() => {
                          if (!isActivePage) onSwitchPage(page.id);
                        }}
                      />
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
        <button
          type="button"
          onClick={() => onAddPage('document')}
          style={{
            border: `1px dashed ${tokens.cardBorder}`,
            background: 'transparent',
            color: tokens.textMuted,
            borderRadius: 8,
            padding: '8px 10px',
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          + Document page
        </button>
        <button
          type="button"
          onClick={() => onAddPage('write')}
          style={{
            border: `1px dashed ${tokens.cardBorder}`,
            background: 'transparent',
            color: tokens.textMuted,
            borderRadius: 8,
            padding: '8px 10px',
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          + Ink page
        </button>
        <button
          type="button"
          onClick={onAddSection}
          style={{
            border: `1px dashed ${tokens.cardBorder}`,
            background: 'transparent',
            color: tokens.textMuted,
            borderRadius: 8,
            padding: '8px 10px',
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          + Topic
        </button>
      </div>
    </div>
  );
}
