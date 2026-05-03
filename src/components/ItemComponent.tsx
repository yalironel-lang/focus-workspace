import { useState } from 'react';
import { Item } from '../types';
import { useSectionDetail } from '../hooks/useSections';
import { useFileUpload } from '../hooks/useFileUpload';
import { supabase } from '../lib/supabase';
import {
  CheckSquare, Square, FileText, StickyNote,
  Trash2, ExternalLink, Loader2, Check, ChevronDown, ChevronUp,
} from 'lucide-react';
import toast from 'react-hot-toast';

interface ItemProps {
  item: Item;
  sectionId: string;
  groupId: string;
  onUpdate: () => void;
}

function parseDomain(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

// First letter of domain for the badge
function domainInitial(domain: string | null): string {
  if (!domain) return '↗';
  return domain[0].toUpperCase();
}

// Detect link type from URL for the resource badge
function detectLinkType(url: string): string | null {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (/chatgpt|openai\.com|claude\.ai|gemini\.google|bard\.google/.test(host)) return 'AI';
    if (/youtube|youtu\.be|vimeo\.com/.test(host)) return 'Video';
    if (/udemy|coursera|edx\.org|khanacademy/.test(host)) return 'Course';
    if (/github|gitlab|codepen|replit|stackblitz/.test(host)) return 'Code';
    if (/docs\.google|notion\.so|confluence|gitbook/.test(host)) return 'Doc';
    return null;
  } catch { return null; }
}

const PRIORITY_CONFIG: Record<string, { dot: string; label: string }> = {
  high:   { dot: 'bg-rose-400',   label: 'High'   },
  medium: { dot: 'bg-amber-400',  label: 'Medium' },
  low:    { dot: 'bg-sky-300',    label: 'Low'    },
};
const PRIORITY_CYCLE: Record<string, string | null> = {
  '': 'high', high: 'medium', medium: 'low', low: '',
};

export function ItemComponent({ item, sectionId, onUpdate }: ItemProps) {
  const { toggleTask, deleteItem } = useSectionDetail(sectionId);
  const { getSignedUrl } = useFileUpload();
  const [opening, setOpening] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(item.title);
  const [editContent, setEditContent] = useState(item.content || '');
  const [noteExpanded, setNoteExpanded] = useState(false);

  const handleToggle = async () => {
    try {
      await toggleTask(item.id, !item.completed);
      onUpdate();
    } catch {
      toast.error('Failed to update task');
    }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this item?')) return;
    try {
      if (item.file_path) {
        await supabase.storage.from('pdfs').remove([item.file_path]);
      }
      await deleteItem(item.id);
      onUpdate();
    } catch {
      toast.error('Failed to delete item');
    }
  };

  const handleOpenFile = async () => {
    if (!item.file_path) return;
    setOpening(true);
    try {
      const url = await getSignedUrl(item.file_path);
      window.open(url, '_blank');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not open file');
    } finally {
      setOpening(false);
    }
  };

  const handleSaveEdit = async () => {
    try {
      const { error } = await supabase
        .from('items')
        .update({ title: editTitle, content: editContent || null })
        .eq('id', item.id);
      if (error) throw error;
      setIsEditing(false);
      onUpdate();
    } catch {
      toast.error('Failed to save changes');
    }
  };

  const cyclePriority = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const current = item.content ?? '';
    const next = PRIORITY_CYCLE[current] ?? 'high';
    try {
      const { error } = await supabase
        .from('items')
        .update({ content: next || null })
        .eq('id', item.id);
      if (error) throw error;
      onUpdate();
    } catch {
      toast.error('Failed to update priority');
    }
  };

  // ── Edit mode ──────────────────────────────────────────────────────────────
  if (isEditing) {
    return (
      <div id={`item-${item.id}`} className="bg-slate-50 rounded-xl p-3 my-1 border border-slate-200 animate-fade-in">
        <input
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          className="w-full px-3 py-2 border border-slate-200 rounded-lg mb-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          placeholder="Title"
          autoFocus
        />
        {item.type !== 'task' && item.type !== 'file' && (
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg mb-2 text-sm min-h-[72px] resize-none bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            placeholder={item.type === 'link' ? 'https://…' : 'Notes…'}
          />
        )}
        <div className="flex gap-2">
          <button
            onClick={handleSaveEdit}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 transition-colors"
          >
            <Check className="w-3.5 h-3.5" />
            Save
          </button>
          <button
            onClick={() => { setIsEditing(false); setEditTitle(item.title); setEditContent(item.content || ''); }}
            className="px-3 py-1.5 text-slate-500 text-xs hover:text-slate-900 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // ── Link item — saved resource row ────────────────────────────────────────
  if (item.type === 'link') {
    const domain = item.content ? parseDomain(item.content) : null;
    const initial = domainInitial(domain);
    const linkType = item.content ? detectLinkType(item.content) : null;

    return (
      <div
        id={`item-${item.id}`}
        className="group flex items-center rounded-xl border border-transparent hover:border-sky-100 hover:bg-sky-50/50 transition-all"
      >
        {/* Full-width clickable link area */}
        <a
          href={item.content || '#'}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 flex-1 min-w-0 px-3 py-2.5"
        >
          {/* Sky-tinted domain initial badge */}
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-sky-100 to-blue-100 border border-sky-200 flex items-center justify-center flex-shrink-0 shadow-sm">
            <span className="text-xs font-bold text-sky-700">{initial}</span>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-sm font-semibold text-slate-800 truncate group-hover:text-sky-700 transition-colors">
                {item.title}
              </span>
              {linkType && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 flex-shrink-0 uppercase tracking-wide">
                  {linkType}
                </span>
              )}
              <ExternalLink className="w-3 h-3 text-sky-400 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            {domain && (
              <p className="text-xs text-slate-400 font-medium mt-0.5 truncate">{domain}</p>
            )}
          </div>
        </a>

        {/* Actions — outside the <a> to avoid nested click issues */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 pr-2">
          <button
            onClick={() => setIsEditing(true)}
            className="px-2 py-1 text-[11px] font-medium text-slate-400 hover:text-slate-700 transition-colors rounded"
          >
            Edit
          </button>
          <button onClick={handleDelete} className="p-1 text-slate-300 hover:text-red-500 transition-colors rounded">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  // ── File / PDF item ────────────────────────────────────────────────────────
  if (item.type === 'file') {
    return (
      <div
        id={`item-${item.id}`}
        className="group flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 border border-transparent hover:border-slate-100 transition-all"
      >
        <div className="w-8 h-8 rounded-lg bg-rose-50 border border-rose-100 flex items-center justify-center flex-shrink-0">
          <FileText className="w-3.5 h-3.5 text-rose-500" />
        </div>

        <div className="flex-1 min-w-0">
          <span
            className="text-sm font-medium text-slate-800 truncate block cursor-pointer hover:text-slate-600 transition-colors"
            onClick={() => setIsEditing(true)}
          >
            {item.title}
          </span>
          <span className="text-xs text-slate-400">PDF document</span>
        </div>

        {item.file_path && (
          <button
            onClick={handleOpenFile}
            disabled={opening}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-900 hover:text-white transition-all disabled:opacity-40 flex-shrink-0"
          >
            {opening ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <>
                <ExternalLink className="w-3.5 h-3.5" />
                Open
              </>
            )}
          </button>
        )}

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          <button
            onClick={() => setIsEditing(true)}
            className="px-2 py-1 text-[11px] font-medium text-slate-400 hover:text-slate-700 transition-colors rounded"
          >
            Edit
          </button>
          <button onClick={handleDelete} className="p-1 text-slate-300 hover:text-red-500 transition-colors rounded">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  // ── Note item — knowledge card ────────────────────────────────────────────
  if (item.type === 'note') {
    return (
      <div id={`item-${item.id}`} className="px-1 py-0.5">
        {/* White card with strong left emerald accent */}
        <div className="group relative bg-white border border-slate-100 border-l-[3px] border-l-emerald-400 rounded-xl p-3.5 hover:border-slate-200 hover:shadow-sm transition-all">
          <div className="flex items-start gap-3">
            {/* Filled icon badge */}
            <div className="w-7 h-7 rounded-lg bg-emerald-500 flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm">
              <StickyNote className="w-3.5 h-3.5 text-white" />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <span
                className="text-sm font-semibold text-slate-900 cursor-pointer leading-snug block mb-1"
                onClick={() => setIsEditing(true)}
              >
                {item.title}
              </span>
              {item.content && (
                <div>
                  {/* Content in its own subtle box */}
                  <div className={`bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-2 ${noteExpanded ? '' : ''}`}>
                    <p className={`text-xs text-slate-600 leading-relaxed whitespace-pre-wrap ${noteExpanded ? '' : 'line-clamp-3'}`}>
                      {item.content}
                    </p>
                  </div>
                  {item.content.length > 100 && (
                    <button
                      onClick={() => setNoteExpanded(!noteExpanded)}
                      className="flex items-center gap-0.5 text-[11px] font-medium text-emerald-600 hover:text-emerald-800 mt-1.5 transition-colors"
                    >
                      {noteExpanded
                        ? <><ChevronUp className="w-3 h-3" />Show less</>
                        : <><ChevronDown className="w-3 h-3" />Show more</>}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Hover actions */}
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
              <button
                onClick={() => setIsEditing(true)}
                className="px-2 py-1 text-[11px] font-medium text-slate-400 hover:text-slate-700 transition-colors rounded"
              >
                Edit
              </button>
              <button onClick={handleDelete} className="p-1 text-slate-300 hover:text-red-500 transition-colors rounded">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Task item ──────────────────────────────────────────────────────────────
  const priorityCfg = item.content ? PRIORITY_CONFIG[item.content] : null;
  return (
    <div
      id={`item-${item.id}`}
      className="group flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 border border-transparent transition-all"
    >
      <button
        onClick={handleToggle}
        className="flex-shrink-0 hover:scale-110 transition-transform"
        title={item.completed ? 'Mark incomplete' : 'Mark complete'}
      >
        {item.completed
          ? <CheckSquare className="w-4 h-4 text-primary-600" />
          : <Square className="w-4 h-4 text-slate-300 hover:text-slate-400" />}
      </button>

      <span
        className={`flex-1 text-sm leading-snug cursor-pointer select-none transition-colors ${
          item.completed ? 'line-through text-slate-400' : 'text-slate-800'
        }`}
        onClick={() => setIsEditing(true)}
      >
        {item.title}
      </span>

      {/* Priority dot — visible on hover or when set; click to cycle */}
      {!item.completed && (
        <button
          onClick={cyclePriority}
          title={priorityCfg ? `Priority: ${priorityCfg.label} (click to change)` : 'Set priority'}
          className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <span className={`block w-2 h-2 rounded-full transition-colors ${priorityCfg ? priorityCfg.dot : 'bg-slate-200 hover:bg-slate-300'}`} />
        </button>
      )}

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        <button
          onClick={() => setIsEditing(true)}
          className="px-2 py-1 text-[11px] font-medium text-slate-400 hover:text-slate-700 transition-colors rounded"
        >
          Edit
        </button>
        <button onClick={handleDelete} className="p-1 text-slate-300 hover:text-red-500 transition-colors rounded">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
