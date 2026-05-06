import { useState } from 'react';
import { GroupWithItems, Item, ItemType } from '../types';
import { ItemComponent } from './ItemComponent';
import { AddItemModal } from './AddItemModal';
import {
  Plus, FileText, ListTodo, ClipboardCheck, StickyNote, Link2,
  BookOpen, Sigma, AlertCircle, ChevronDown, ChevronRight,
  Pencil, Check, X, Trash2, MoreHorizontal,
} from 'lucide-react';
import toast from 'react-hot-toast';

// Exercises open by default; everything else collapsed
const DEFAULT_OPEN_GROUPS = new Set(['Exercises']);

interface GroupProps {
  group: GroupWithItems;
  sectionId: string;
  // Item callbacks — all optimistic, come from useSectionDetail in SectionPage
  onAddItem: (groupId: string, type: ItemType, title: string, content?: string, filePath?: string) => Promise<void>;
  onPushItem: (groupId: string, item: Item) => void;
  onToggleItem: (itemId: string, completed: boolean) => Promise<void>;
  onDeleteItem: (itemId: string) => Promise<void>;
  onUpdateItem: (itemId: string, updates: { title?: string; content?: string | null }) => Promise<void>;
  // Group callbacks
  onRenameGroup: (groupId: string, title: string) => Promise<void>;
  onDeleteGroup: (groupId: string) => Promise<void>;
  // Full refresh — used only after file uploads
  onRefresh: () => void;
}

// Display-only rename: DB "Exercises" shown as "To Do"
function displayGroupName(name: string): string {
  return name === 'Exercises' ? 'To Do' : name;
}

const GROUP_ICONS: Record<string, React.ReactNode> = {
  Slides:    <FileText      className="w-3.5 h-3.5" />,
  Exercises: <ListTodo      className="w-3.5 h-3.5" />,
  Exams:     <ClipboardCheck className="w-3.5 h-3.5" />,
  Notes:     <StickyNote    className="w-3.5 h-3.5" />,
  Links:     <Link2         className="w-3.5 h-3.5" />,
};
const DEFAULT_ICON = <FileText className="w-3.5 h-3.5" />;

// Accent colors for group type — used for left border + icon tint
const GROUP_ACCENT: Record<string, string> = {
  Slides:    '#6366f1',
  Exercises: '#f59e0b',
  Exams:     '#ef4444',
  Notes:     '#10b981',
  Links:     '#38bdf8',
};
const DEFAULT_ACCENT = '#4b5563';

const GROUP_EMPTY: Record<string, { text: string; hint: string }> = {
  Slides:    { text: 'Upload lecture slides',   hint: 'PDFs and notes from class'            },
  Exercises: { text: 'Add your first action',   hint: 'Readings, submissions, tasks'          },
  Exams:     { text: 'Add a past paper',        hint: 'Your highest-priority material'        },
  Notes:     { text: 'Write your first note',   hint: 'Summaries, key concepts, formulas'     },
  Links:     { text: 'Save a useful link',      hint: 'Moodle, YouTube, ChatGPT, Drive…'      },
};
const DEFAULT_EMPTY = { text: 'Add your first item', hint: 'Tasks, links, notes, or PDFs' };

const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

export function GroupComponent({
  group, sectionId,
  onAddItem, onPushItem, onToggleItem, onDeleteItem, onUpdateItem,
  onRenameGroup, onDeleteGroup,
  onRefresh,
}: GroupProps) {
  const [showAddModal,  setShowAddModal]  = useState(false);
  const [modalDefaults, setModalDefaults] = useState<{ type?: ItemType; title?: string }>({});
  const [isRenaming,    setIsRenaming]    = useState(false);
  const [renameValue,   setRenameValue]   = useState(group.title);
  const [showMore,      setShowMore]      = useState(false);

  const defaultOpen = DEFAULT_OPEN_GROUPS.has(group.title);
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const accent     = GROUP_ACCENT[group.title] ?? DEFAULT_ACCENT;
  const icon       = GROUP_ICONS[group.title] ?? DEFAULT_ICON;
  const emptyState = GROUP_EMPTY[group.title] ?? DEFAULT_EMPTY;

  const taskItems      = group.items.filter(i => i.type === 'task');
  const completedTasks = taskItems.filter(i => i.completed).length;

  const openModal = (defaults: { type?: ItemType; title?: string } = {}) => {
    setModalDefaults(defaults);
    setShowAddModal(true);
  };

  const sortedItems = [...group.items].sort((a, b) => {
    if (a.type !== 'task' || b.type !== 'task') return 0;
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    const ap = a.content ? (PRIORITY_ORDER[a.content] ?? 3) : 3;
    const bp = b.content ? (PRIORITY_ORDER[b.content] ?? 3) : 3;
    return ap - bp;
  });

  const commitRename = async () => {
    const trimmed = renameValue.trim();
    setIsRenaming(false);
    if (!trimmed || trimmed === group.title) {
      setRenameValue(group.title);
      return;
    }
    try {
      await onRenameGroup(group.id, trimmed);
    } catch {
      toast.error('Failed to rename lane');
      setRenameValue(group.title);
    }
  };

  const cancelRename = () => {
    setIsRenaming(false);
    setRenameValue(group.title);
  };

  const handleDeleteGroup = async () => {
    setShowMore(false);
    if (!confirm(`Delete "${displayGroupName(group.title)}" and all ${group.items.length} item${group.items.length !== 1 ? 's' : ''} inside it?`)) return;
    try {
      await onDeleteGroup(group.id);
      toast.success('Lane deleted');
    } catch {
      toast.error('Failed to delete lane');
    }
  };

  const handleStartRename = () => {
    setShowMore(false);
    setRenameValue(group.title);
    setIsRenaming(true);
  };

  // ── Styles ─────────────────────────────────────────────────────────────────
  const cardStyle: React.CSSProperties = {
    backgroundColor: '#0d111a',
    border: '1px solid #263043',
    borderLeft: `3px solid ${accent}`,
    borderRadius: '12px',
    overflow: 'hidden',
  };

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 14px',
    borderBottom: isOpen ? '1px solid #1a2230' : 'none',
    backgroundColor: 'transparent',
  };

  return (
    <div style={cardStyle}>

      {/* Group header */}
      <div style={headerStyle}>

        {/* Left: toggle + icon + title */}
        <div
          className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer select-none"
          onClick={() => !isRenaming && setIsOpen(o => !o)}
        >
          {!isRenaming && (
            <span className="flex-shrink-0" style={{ color: '#374151' }}>
              {isOpen
                ? <ChevronDown  className="w-3 h-3" />
                : <ChevronRight className="w-3 h-3" />}
            </span>
          )}

          <span className="flex-shrink-0" style={{ color: accent }}>
            {icon}
          </span>

          {isRenaming ? (
            <div className="flex items-center gap-1.5 flex-1 min-w-0" onClick={e => e.stopPropagation()}>
              <input
                value={renameValue}
                onChange={e => setRenameValue(e.target.value)}
                onBlur={commitRename}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
                  if (e.key === 'Escape') cancelRename();
                }}
                className="flex-1 min-w-0 text-sm font-semibold rounded-lg px-2 py-0.5 focus:outline-none"
                style={{
                  backgroundColor: '#111827', border: '1px solid #f59e0b',
                  color: '#f8fafc',
                }}
                autoFocus
                onClick={e => e.stopPropagation()}
              />
              <button
                onMouseDown={e => { e.preventDefault(); commitRename(); }}
                className="p-0.5 rounded transition-colors flex-shrink-0"
                style={{ color: '#10b981' }}
              >
                <Check className="w-3.5 h-3.5" />
              </button>
              <button
                onMouseDown={e => { e.preventDefault(); cancelRename(); }}
                className="p-0.5 rounded transition-colors flex-shrink-0"
                style={{ color: '#4b5563' }}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="font-semibold text-sm truncate" style={{ color: '#f8fafc' }}>
                {displayGroupName(group.title)}
              </span>
              {group.items.length > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold flex-shrink-0 tabular-nums"
                      style={{ backgroundColor: '#111827', color: '#4b5563' }}>
                  {taskItems.length > 0
                    ? `${completedTasks}/${taskItems.length}`
                    : group.items.length}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Right: Add + More menu */}
        {!isRenaming && (
          <div className="flex items-center gap-0.5 flex-shrink-0 ml-2" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => openModal()}
              className="flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-lg transition-all"
              style={{ color: '#4b5563' }}
              onMouseEnter={e => { e.currentTarget.style.color = '#f8fafc'; e.currentTarget.style.backgroundColor = '#111827'; }}
              onMouseLeave={e => { e.currentTarget.style.color = '#4b5563'; e.currentTarget.style.backgroundColor = 'transparent'; }}
            >
              <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
              Add
            </button>

            {/* More menu */}
            <div className="relative">
              <button
                onClick={() => setShowMore(v => !v)}
                className="p-1 rounded-lg transition-all"
                style={{ color: '#374151' }}
                onMouseEnter={e => { e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.backgroundColor = '#111827'; }}
                onMouseLeave={e => { e.currentTarget.style.color = '#374151'; e.currentTarget.style.backgroundColor = 'transparent'; }}
              >
                <MoreHorizontal className="w-3.5 h-3.5" />
              </button>

              {showMore && (
                <>
                  {/* Backdrop */}
                  <div className="fixed inset-0 z-20" onClick={() => setShowMore(false)} />
                  <div
                    className="absolute right-0 top-full mt-1 z-30 rounded-xl overflow-hidden shadow-2xl"
                    style={{ backgroundColor: '#0d111a', border: '1px solid #263043', minWidth: '140px' }}
                  >
                    <button
                      onClick={handleStartRename}
                      className="w-full flex items-center gap-2 px-3.5 py-2.5 text-sm text-left transition-colors"
                      style={{ color: '#94a3b8' }}
                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#111827')}
                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      Rename
                    </button>
                    <button
                      onClick={handleDeleteGroup}
                      className="w-full flex items-center gap-2 px-3.5 py-2.5 text-sm text-left transition-colors"
                      style={{ color: '#ef4444' }}
                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.1)')}
                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete lane
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Collapsed summary */}
      {!isOpen && (
        <div className="px-4 py-2 text-xs" style={{ color: '#374151' }}>
          {group.items.length === 0
            ? 'No items yet'
            : `${group.items.length} item${group.items.length !== 1 ? 's' : ''}${taskItems.length > 0 ? ` · ${completedTasks}/${taskItems.length} done` : ''}`}
        </div>
      )}

      {/* Body */}
      {isOpen && (
        <div className="p-2">
          {group.items.length === 0 ? (
            group.title === 'Notes' ? (
              <div className="px-2 py-2 space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-widest px-2 mb-2"
                   style={{ color: '#374151' }}>Quick templates</p>
                {[
                  { title: 'Summary',            icon: <BookOpen      className="w-3.5 h-3.5" /> },
                  { title: 'Key Formulas',        icon: <Sigma         className="w-3.5 h-3.5" /> },
                  { title: 'Mistakes to Review', icon: <AlertCircle   className="w-3.5 h-3.5" /> },
                ].map(t => (
                  <button
                    key={t.title}
                    onClick={() => openModal({ type: 'note', title: t.title })}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-all group/tpl"
                    style={{ color: '#4b5563' }}
                    onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(16,185,129,0.08)'; e.currentTarget.style.color = '#10b981'; }}
                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#4b5563'; }}
                  >
                    <span className="flex-shrink-0">{t.icon}</span>
                    <span className="text-sm">+ {t.title}</span>
                  </button>
                ))}
                <button
                  onClick={() => openModal({ type: 'note' })}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-all"
                  style={{ color: '#374151' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#94a3b8')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#374151')}
                >
                  <Plus className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={2} />
                  <span className="text-xs">Custom note…</span>
                </button>
              </div>
            ) : (
              <button
                onClick={() => openModal()}
                className="w-full flex flex-col items-start gap-1 px-4 py-4 rounded-xl transition-all"
                style={{ border: '2px dashed #1a2230' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = accent; e.currentTarget.style.backgroundColor = `${accent}08`; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#1a2230'; e.currentTarget.style.backgroundColor = 'transparent'; }}
              >
                <div className="flex items-center gap-2">
                  <Plus className="w-3.5 h-3.5" strokeWidth={2.5} style={{ color: '#374151' }} />
                  <p className="text-sm font-semibold" style={{ color: '#94a3b8' }}>
                    {emptyState.text}
                  </p>
                </div>
                {emptyState.hint && (
                  <p className="text-xs pl-5" style={{ color: '#374151' }}>
                    {emptyState.hint}
                  </p>
                )}
              </button>
            )
          ) : (
            <div className="space-y-0.5">
              {sortedItems.map((item) => (
                <ItemComponent
                  key={item.id}
                  item={item}
                  sectionId={sectionId}
                  groupId={group.id}
                  onToggle={onToggleItem}
                  onDelete={onDeleteItem}
                  onUpdate={onUpdateItem}
                />
              ))}
              <button
                onClick={() => openModal()}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs rounded-xl transition-colors"
                style={{ color: '#374151' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#94a3b8')}
                onMouseLeave={e => (e.currentTarget.style.color = '#374151')}
              >
                <Plus className="w-3.5 h-3.5" strokeWidth={2} />
                Add item
              </button>
            </div>
          )}
        </div>
      )}

      {showAddModal && (
        <AddItemModal
          groupId={group.id}
          sectionId={sectionId}
          defaultType={modalDefaults.type}
          defaultTitle={modalDefaults.title}
          onClose={() => setShowAddModal(false)}
          onAdd={onAddItem}
          onPushItem={(item) => onPushItem(group.id, item)}
          onSuccess={() => setShowAddModal(false)}
          onRefresh={onRefresh}
        />
      )}
    </div>
  );
}
