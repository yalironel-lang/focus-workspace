import { useCallback, useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import {
  pageDisplayTitle,
  sectionDisplayTitle,
  type NotebookContentWithPages,
  type NotebookPage,
  type NotebookPageKind,
  type NotebookSection,
} from '../../lib/notebookPages';
import { TOUCH_TARGET_MIN_PX } from '../../lib/ui/touchTarget';

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
  /** M7.5C3 — product Delete Page (parent must call softDeleteNotebookPage). */
  onDeletePage: (pageId: string) => void;
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
  editing: editingControlled,
  onEditingChange,
  flat,
}: {
  label: string;
  isActive: boolean;
  tokens: AtmosphereTokens;
  onCommit: (next: string) => void;
  onActivate: () => void;
  leading?: ReactNode;
  /** When provided with onEditingChange, rename can be started from the page menu. */
  editing?: boolean;
  onEditingChange?: (editing: boolean) => void;
  /** Parent row owns selection chrome (page actions row). */
  flat?: boolean;
}) {
  const [editingLocal, setEditingLocal] = useState(false);
  const editing = editingControlled ?? editingLocal;
  const setEditing = onEditingChange ?? setEditingLocal;
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
  }, [draft, label, onCommit, setEditing]);

  if (editing) {
    return (
      <input
        ref={inputRef}
        data-nb-page-rename-input="1"
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
      data-nb-page-nav-activate="1"
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
        background: flat ? 'transparent' : isActive ? `${tokens.accent}18` : 'transparent',
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
        minHeight: TOUCH_TARGET_MIN_PX > 40 ? 36 : undefined,
      }}
    >
      {leading}
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
    </button>
  );
}

function PageActionsMenu({
  tokens,
  open,
  onClose,
  anchorRef,
  canDelete,
  onRename,
  onRequestDelete,
}: {
  tokens: AtmosphereTokens;
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
  canDelete: boolean;
  onRename: () => void;
  onRequestDelete: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    const onPointer = (e: MouseEvent | PointerEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t)) return;
      if (anchorRef.current?.contains(t)) return;
      onClose();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer, true);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer, true);
    };
  }, [open, onClose, anchorRef]);

  if (!open || typeof document === 'undefined') return null;

  const rect = anchorRef.current?.getBoundingClientRect();
  const top = rect ? rect.bottom + 4 : 0;
  const left = rect ? Math.max(8, rect.right - 168) : 8;

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      data-nb-page-actions-menu="1"
      style={{
        position: 'fixed',
        top,
        left,
        zIndex: 10050,
        minWidth: 168,
        padding: 4,
        borderRadius: 10,
        border: `1px solid ${tokens.cardBorder}`,
        background: tokens.cardBg,
        boxShadow: '0 8px 28px rgba(0,0,0,0.18)',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
      }}
    >
      <button
        type="button"
        role="menuitem"
        data-nb-page-action="rename"
        onClick={e => {
          e.stopPropagation();
          onRename();
          onClose();
        }}
        style={{
          textAlign: 'left',
          border: 'none',
          background: 'transparent',
          color: tokens.textPrimary,
          fontSize: 12,
          fontWeight: 600,
          padding: '10px 12px',
          borderRadius: 8,
          cursor: 'pointer',
          minHeight: TOUCH_TARGET_MIN_PX > 40 ? 40 : 36,
        }}
      >
        Rename Page
      </button>
      <button
        type="button"
        role="menuitem"
        data-nb-page-action="delete"
        disabled={!canDelete}
        title={canDelete ? undefined : 'A notebook must contain at least one page.'}
        onClick={e => {
          e.stopPropagation();
          if (!canDelete) return;
          onRequestDelete();
          onClose();
        }}
        style={{
          textAlign: 'left',
          border: 'none',
          background: 'transparent',
          color: canDelete ? '#b45309' : tokens.textGhost,
          fontSize: 12,
          fontWeight: 600,
          padding: '10px 12px',
          borderRadius: 8,
          cursor: canDelete ? 'pointer' : 'not-allowed',
          minHeight: TOUCH_TARGET_MIN_PX > 40 ? 40 : 36,
          opacity: canDelete ? 1 : 0.55,
        }}
      >
        Delete Page
      </button>
    </div>,
    document.body,
  );
}

function DeletePageConfirmDialog({
  tokens,
  pageTitle,
  open,
  onCancel,
  onConfirm,
}: {
  tokens: AtmosphereTokens;
  pageTitle: string;
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      data-nb-page-delete-dialog="1"
      role="presentation"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10060,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        background: 'rgba(14,10,6,0.45)',
      }}
      onClick={onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(100%, 360px)',
          borderRadius: 14,
          border: `1px solid ${tokens.cardBorder}`,
          background: tokens.cardBg,
          boxShadow: '0 16px 48px rgba(0,0,0,0.28)',
          padding: '18px 18px 14px',
        }}
      >
        <h2
          id={titleId}
          style={{
            margin: 0,
            fontSize: 15,
            fontWeight: 700,
            color: tokens.textPrimary,
            lineHeight: 1.35,
          }}
        >
          {`Delete “${pageTitle}”?`}
        </h2>
        <p
          id={descId}
          style={{
            margin: '10px 0 0',
            fontSize: 13,
            lineHeight: 1.45,
            color: tokens.textSecondary,
          }}
        >
          This page will move to Recently Deleted and can be restored for 30 days.
        </p>
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
            marginTop: 18,
          }}
        >
          <button
            type="button"
            data-nb-page-delete-cancel="1"
            onClick={onCancel}
            style={{
              border: `1px solid ${tokens.cardBorder}`,
              background: tokens.wellBg,
              color: tokens.textSecondary,
              fontSize: 12,
              fontWeight: 600,
              padding: '8px 14px',
              borderRadius: 8,
              cursor: 'pointer',
              minHeight: 40,
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            data-nb-page-delete-confirm="1"
            onClick={onConfirm}
            style={{
              border: '1px solid rgba(180, 83, 9, 0.45)',
              background: 'rgba(180, 83, 9, 0.12)',
              color: '#92400e',
              fontSize: 12,
              fontWeight: 700,
              padding: '8px 14px',
              borderRadius: 8,
              cursor: 'pointer',
              minHeight: 40,
            }}
          >
            Delete Page
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function PageNavRow({
  page,
  label,
  isActive,
  tokens,
  canDelete,
  onActivate,
  onRename,
  onDelete,
}: {
  page: NotebookPage;
  label: string;
  isActive: boolean;
  tokens: AtmosphereTokens;
  canDelete: boolean;
  onActivate: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const [rowHover, setRowHover] = useState(false);

  return (
    <div
      data-nb-page-nav-row="1"
      data-page-id={page.id}
      onMouseEnter={() => setRowHover(true)}
      onMouseLeave={() => setRowHover(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        borderRadius: 6,
        background: isActive ? `${tokens.accent}18` : 'transparent',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <InlineRenameRow
          label={label}
          isActive={isActive}
          tokens={tokens}
          leading={<PageKindIcon kind={page.kind} tokens={tokens} />}
          onCommit={onRename}
          onActivate={onActivate}
          editing={editing}
          onEditingChange={setEditing}
          flat
        />
      </div>
      <button
        ref={menuBtnRef}
        type="button"
        data-nb-page-menu-trigger="1"
        aria-label={`Page actions for ${label}`}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={e => {
          e.stopPropagation();
          e.preventDefault();
          setMenuOpen(v => !v);
        }}
        style={{
          flexShrink: 0,
          width: 32,
          height: 32,
          minWidth: 32,
          minHeight: 32,
          border: 'none',
          borderRadius: 6,
          background: menuOpen || rowHover || isActive ? `${tokens.cardBorder}55` : 'transparent',
          color: tokens.textMuted,
          cursor: 'pointer',
          fontSize: 16,
          fontWeight: 700,
          lineHeight: 1,
          letterSpacing: 0.5,
          opacity: menuOpen || rowHover || isActive ? 1 : 0.35,
          touchAction: 'manipulation',
        }}
      >
        ···
      </button>
      <PageActionsMenu
        tokens={tokens}
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        anchorRef={menuBtnRef}
        canDelete={canDelete}
        onRename={() => setEditing(true)}
        onRequestDelete={() => setConfirmOpen(true)}
      />
      <DeletePageConfirmDialog
        tokens={tokens}
        pageTitle={label}
        open={confirmOpen}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          onDelete();
        }}
      />
    </div>
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
  onDeletePage,
}: Props) {
  const sections = content.sections ?? [];
  const pages = content.pages ?? [];
  const activeSectionId = content.activeSectionId;
  const activePageId = content.activePageId;
  const canDeletePage = pages.length > 1;

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
                    const label = pageDisplayTitle(page, pageIndex + 1);
                    return (
                      <PageNavRow
                        key={page.id}
                        page={page}
                        label={label}
                        isActive={isActivePage}
                        tokens={tokens}
                        canDelete={canDeletePage}
                        onActivate={() => {
                          if (!isActivePage) onSwitchPage(page.id);
                        }}
                        onRename={title => onRenamePage(page.id, title)}
                        onDelete={() => onDeletePage(page.id)}
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
