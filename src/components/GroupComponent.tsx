import { useState, useRef } from 'react';
import { GroupWithItems, ItemType } from '../types';
import { ItemComponent } from './ItemComponent';
import { AddItemModal } from './AddItemModal';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';
import {
  Plus, FileText, ListTodo, ClipboardCheck, StickyNote, Link2, Pencil, Check, X,
  BookOpen, Sigma, AlertCircle,
} from 'lucide-react';

interface GroupProps {
  group: GroupWithItems;
  sectionId: string;
  onUpdate: () => void;
}

// The five default groups — these are never renamed (ensureDefaultGroups depends on them)
const DEFAULT_GROUP_NAMES = new Set(['Slides', 'Exercises', 'Exams', 'Notes', 'Links']);

// Display-only rename: DB "Exercises" shown as "To Do"
function displayGroupName(name: string): string {
  return name === 'Exercises' ? 'To Do' : name;
}

const GROUP_CONFIG: Record<string, {
  icon: React.ReactNode;
  headerBg: string;
  cardAccent: string;
  emptyText: string;
  emptyHint: string;
}> = {
  Slides: {
    icon: <FileText className="w-4 h-4" />,
    headerBg: 'bg-indigo-50 text-indigo-700 border-indigo-100',
    cardAccent: 'border-l-[3px] border-l-indigo-400',
    emptyText: 'Upload lecture slides',
    emptyHint: 'PDFs and notes from class',
  },
  Exercises: {  // DB value — displayed as "To Do"
    icon: <ListTodo className="w-4 h-4" />,
    headerBg: 'bg-slate-50 text-slate-600 border-slate-200',
    cardAccent: 'border-l-[3px] border-l-slate-400',
    emptyText: 'Add your first task',
    emptyHint: 'Readings, submissions, deadlines',
  },
  Exams: {
    icon: <ClipboardCheck className="w-4 h-4" />,
    headerBg: 'bg-amber-50 text-amber-700 border-amber-100',
    cardAccent: 'border-l-[3px] border-l-amber-400',
    emptyText: 'Add a past paper',
    emptyHint: 'Your highest-priority material',
  },
  Notes: {
    icon: <StickyNote className="w-4 h-4" />,
    headerBg: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    cardAccent: 'border-l-[3px] border-l-emerald-400',
    emptyText: 'Write your first note',
    emptyHint: 'Summaries, key concepts, formulas',
  },
  Links: {
    icon: <Link2 className="w-4 h-4" />,
    headerBg: 'bg-sky-50 text-sky-700 border-sky-100',
    cardAccent: 'border-l-[3px] border-l-sky-400',
    emptyText: 'Save a useful link',
    emptyHint: 'Moodle, YouTube, ChatGPT, Drive…',
  },
};

const DEFAULT_CONFIG = {
  icon: <FileText className="w-4 h-4" />,
  headerBg: 'bg-slate-50 text-slate-600 border-slate-200',
  cardAccent: 'border-l-[3px] border-l-slate-300',
  emptyText: 'Add your first item',
  emptyHint: 'Tasks, links, notes, or PDFs',
};

const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

export function GroupComponent({ group, sectionId, onUpdate }: GroupProps) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [modalDefaults, setModalDefaults] = useState<{ type?: ItemType; title?: string }>({});
  const [isRenaming, setIsRenaming]     = useState(false);
  const [renameValue, setRenameValue]   = useState(group.title);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const cfg = GROUP_CONFIG[group.title] ?? DEFAULT_CONFIG;
  const isDefault = DEFAULT_GROUP_NAMES.has(group.title);

  const taskItems      = group.items.filter(i => i.type === 'task');
  const completedTasks = taskItems.filter(i => i.completed).length;

  const openModal = (defaults: { type?: ItemType; title?: string } = {}) => {
    setModalDefaults(defaults);
    setShowAddModal(true);
  };

  // Sort: incomplete tasks by priority, then completed tasks; non-tasks keep order
  const sortedItems = [...group.items].sort((a, b) => {
    if (a.type !== 'task' || b.type !== 'task') return 0;
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    const ap = a.content ? (PRIORITY_ORDER[a.content] ?? 3) : 3;
    const bp = b.content ? (PRIORITY_ORDER[b.content] ?? 3) : 3;
    return ap - bp;
  });

  const startRename = () => {
    setRenameValue(group.title);
    setIsRenaming(true);
    // Focus happens via autoFocus on the input
  };

  const commitRename = async () => {
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === group.title) {
      setIsRenaming(false);
      setRenameValue(group.title);
      return;
    }
    try {
      const { error } = await supabase
        .from('groups')
        .update({ title: trimmed })
        .eq('id', group.id);
      if (error) throw error;
      onUpdate();
    } catch {
      toast.error('Failed to rename lane');
      setRenameValue(group.title);
    } finally {
      setIsRenaming(false);
    }
  };

  const cancelRename = () => {
    setIsRenaming(false);
    setRenameValue(group.title);
  };

  return (
    <div className={`bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-200 ${cfg.cardAccent}`}>

      {/* Group header */}
      <div className={`flex items-center justify-between px-4 py-3 border-b ${cfg.headerBg}`}>

        {/* Left: icon + title (or rename input) */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {cfg.icon}

          {isRenaming ? (
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <input
                ref={renameInputRef}
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
                  if (e.key === 'Escape') cancelRename();
                }}
                className="flex-1 min-w-0 text-sm font-semibold bg-white border border-slate-300 rounded-lg px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                autoFocus
                onClick={(e) => e.stopPropagation()}
              />
              <button
                onMouseDown={(e) => { e.preventDefault(); commitRename(); }}
                className="p-0.5 text-emerald-600 hover:text-emerald-800 transition-colors flex-shrink-0"
                title="Save"
              >
                <Check className="w-3.5 h-3.5" />
              </button>
              <button
                onMouseDown={(e) => { e.preventDefault(); cancelRename(); }}
                className="p-0.5 text-slate-400 hover:text-slate-700 transition-colors flex-shrink-0"
                title="Cancel"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="font-semibold text-sm truncate">{displayGroupName(group.title)}</span>

              {/* Count badge */}
              {group.items.length > 0 && (
                <span className="text-xs bg-white/70 px-1.5 py-0.5 rounded-full font-medium opacity-80 flex-shrink-0">
                  {taskItems.length > 0
                    ? `${completedTasks}/${taskItems.length}`
                    : group.items.length}
                </span>
              )}

              {/* Rename pencil — custom groups only */}
              {!isDefault && (
                <button
                  onClick={startRename}
                  className="p-0.5 text-current opacity-0 group-hover:opacity-40 hover:!opacity-100 transition-opacity flex-shrink-0 ml-0.5 rounded"
                  title="Rename lane"
                >
                  <Pencil className="w-3 h-3" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Right: Add button */}
        {!isRenaming && (
          <button
            onClick={() => openModal()}
            className="flex items-center gap-1 text-xs font-semibold opacity-50 hover:opacity-100 transition-opacity px-2 py-1 rounded-lg hover:bg-white/60 active:scale-95 flex-shrink-0 ml-2"
          >
            <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
            Add
          </button>
        )}
      </div>

      {/* Body */}
      <div className="p-2">
        {group.items.length === 0 ? (
          /* Empty state */
          group.title === 'Notes' ? (
            /* Notes: quick templates */
            <div className="px-2 py-2 space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-300 px-2 mb-2">Quick templates</p>
              {[
                { title: 'Summary', icon: <BookOpen className="w-3.5 h-3.5" /> },
                { title: 'Key Formulas', icon: <Sigma className="w-3.5 h-3.5" /> },
                { title: 'Mistakes to Review', icon: <AlertCircle className="w-3.5 h-3.5" /> },
              ].map(t => (
                <button
                  key={t.title}
                  onClick={() => openModal({ type: 'note', title: t.title })}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-emerald-50 text-left transition-colors group/tpl"
                >
                  <span className="text-slate-300 group-hover/tpl:text-emerald-500 transition-colors flex-shrink-0">{t.icon}</span>
                  <span className="text-sm text-slate-500 group-hover/tpl:text-emerald-700 transition-colors">+ {t.title}</span>
                </button>
              ))}
              <button
                onClick={() => openModal({ type: 'note' })}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-slate-50 text-left transition-colors group/custom mt-1"
              >
                <Plus className="w-3.5 h-3.5 text-slate-300 group-hover/custom:text-slate-500 transition-colors flex-shrink-0" strokeWidth={2} />
                <span className="text-xs text-slate-400 group-hover/custom:text-slate-600 transition-colors">Custom note…</span>
              </button>
            </div>
          ) : (
            <button
              onClick={() => openModal()}
              className="w-full flex flex-col items-start gap-1 px-4 py-5 rounded-xl border-2 border-dashed border-slate-100 hover:border-primary-300 hover:bg-primary-50/20 transition-all group/empty"
            >
              <div className="flex items-center gap-2">
                <Plus className="w-3.5 h-3.5 text-slate-400 group-hover/empty:text-primary-500 transition-colors" strokeWidth={2.5} />
                <p className="text-sm font-semibold text-slate-500 group-hover/empty:text-primary-600 transition-colors">
                  {cfg.emptyText}
                </p>
              </div>
              {cfg.emptyHint && (
                <p className="text-xs text-slate-300 group-hover/empty:text-slate-400 pl-5 transition-colors">
                  {cfg.emptyHint}
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
                onUpdate={onUpdate}
              />
            ))}
            {/* Quick-add */}
            <button
              onClick={() => openModal()}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-300 hover:text-slate-500 transition-colors rounded-xl hover:bg-slate-50"
            >
              <Plus className="w-3.5 h-3.5" strokeWidth={2} />
              Add item
            </button>
          </div>
        )}
      </div>

      {showAddModal && (
        <AddItemModal
          groupId={group.id}
          sectionId={sectionId}
          defaultType={modalDefaults.type}
          defaultTitle={modalDefaults.title}
          onClose={() => setShowAddModal(false)}
          onSuccess={() => { setShowAddModal(false); onUpdate(); }}
        />
      )}
    </div>
  );
}
