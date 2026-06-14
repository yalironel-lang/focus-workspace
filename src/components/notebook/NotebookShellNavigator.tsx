import { useCallback, useEffect, useRef, useState } from 'react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import type { NotebookContentWithPages, NotebookPage, NotebookSection } from '../../lib/notebookPages';
import { pageDisplayTitle, sectionDisplayTitle } from '../../lib/notebookPages';

type NotebookShellContent = NotebookContentWithPages & {
  paperStyle?: string;
  notebookMode?: string;
};

interface Props {
  content: NotebookShellContent;
  tokens: AtmosphereTokens;
  onSwitchSection: (sectionId: string) => void;
  onSwitchPage: (pageId: string) => void;
  onAddSection: () => void;
  onAddPage: () => void;
  onRenameSection: (sectionId: string, title: string) => void;
  onRenamePage: (pageId: string, title: string) => void;
}

function InlineRenameLabel({
  label,
  isActive,
  activeColor,
  idleColor,
  onCommit,
}: {
  label: string;
  isActive: boolean;
  activeColor: string;
  idleColor: string;
  onCommit: (next: string) => void;
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
          width: Math.max(72, draft.length * 7 + 16),
          maxWidth: 160,
          fontSize: 11,
          fontWeight: 600,
          padding: '2px 6px',
          borderRadius: 5,
          border: '1px solid rgba(255,255,255,0.18)',
          background: 'rgba(0,0,0,0.35)',
          color: activeColor,
          outline: 'none',
        }}
      />
    );
  }

  return (
    <span
      onDoubleClick={e => {
        e.stopPropagation();
        setEditing(true);
      }}
      title="Double-click to rename"
      style={{
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.02em',
        color: isActive ? activeColor : idleColor,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );
}

function NavPill({
  isActive,
  tokens,
  onClick,
  children,
}: {
  isActive: boolean;
  tokens: AtmosphereTokens;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '5px 10px',
        borderRadius: 999,
        border: isActive
          ? `1px solid ${tokens.accent}55`
          : '1px solid rgba(255,255,255,0.08)',
        background: isActive ? `${tokens.accent}18` : 'rgba(255,255,255,0.03)',
        cursor: 'pointer',
        flexShrink: 0,
        transition: 'background 0.15s ease, border-color 0.15s ease',
      }}
    >
      {children}
    </button>
  );
}

function AddButton({ label, onClick, tokens }: { label: string; onClick: () => void; tokens: AtmosphereTokens }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 28,
        height: 28,
        borderRadius: 999,
        border: '1px dashed rgba(255,255,255,0.14)',
        background: 'transparent',
        color: tokens.textGhost,
        fontSize: 14,
        fontWeight: 500,
        cursor: 'pointer',
        flexShrink: 0,
      }}
    >
      +
    </button>
  );
}

export function NotebookShellNavigator({
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

  const activeSection = sections.find(s => s.id === activeSectionId) ?? sections[0];
  const sectionPages: NotebookPage[] = activeSection
    ? activeSection.pageIds
        .map(id => pages.find(p => p.id === id))
        .filter((p): p is NotebookPage => p !== undefined)
    : [];

  if (sections.length === 0) return null;

  const activeColor = tokens.accent;
  const idleColor = 'rgba(255,248,235,0.45)';

  return (
    <div
      data-nb-shell-nav="1"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: '0 6px 12px',
        marginBottom: 4,
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          overflowX: 'auto',
          paddingBottom: 2,
        }}
      >
        {sections.map((section: NotebookSection, i) => {
          const isActive = section.id === activeSectionId;
          return (
            <NavPill
              key={section.id}
              isActive={isActive}
              tokens={tokens}
              onClick={() => {
                if (!isActive) onSwitchSection(section.id);
              }}
            >
              <InlineRenameLabel
                label={sectionDisplayTitle(section, i + 1)}
                isActive={isActive}
                activeColor={activeColor}
                idleColor={idleColor}
                onCommit={title => onRenameSection(section.id, title)}
              />
            </NavPill>
          );
        })}
        <AddButton label="Add section" onClick={onAddSection} tokens={tokens} />
      </div>

      {activeSection ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            overflowX: 'auto',
            paddingBottom: 2,
          }}
        >
          {sectionPages.map((page, i) => {
            const isActive = page.id === activePageId;
            return (
              <NavPill
                key={page.id}
                isActive={isActive}
                tokens={tokens}
                onClick={() => {
                  if (!isActive) onSwitchPage(page.id);
                }}
              >
                <InlineRenameLabel
                  label={pageDisplayTitle(page, i + 1)}
                  isActive={isActive}
                  activeColor={activeColor}
                  idleColor={idleColor}
                  onCommit={title => onRenamePage(page.id, title)}
                />
              </NavPill>
            );
          })}
          <AddButton label="Add page" onClick={onAddPage} tokens={tokens} />
        </div>
      ) : null}
    </div>
  );
}
