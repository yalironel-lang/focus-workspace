import { useState, useCallback } from 'react';
import { Item } from '../types';
import { useFileUpload } from '../hooks/useFileUpload';
import { supabase } from '../lib/supabase';
import { PDFViewerModal } from './PDFViewerModal';
import {
  CheckSquare, Square, FileText, StickyNote,
  Trash2, ExternalLink, Loader2, Check, ChevronDown, ChevronUp,
} from 'lucide-react';
import toast from 'react-hot-toast';

// NOTE: This component intentionally does NOT call useSectionDetail.
// All data mutations are passed as stable callbacks from the parent (GroupComponent → SectionPage).
// This eliminates per-item hook instances which caused massive re-render storms.

interface ItemProps {
  item: Item;
  sectionId: string;
  groupId: string;
  onToggle: (itemId: string, completed: boolean) => Promise<void>;
  onDelete: (itemId: string) => Promise<void>;
  onUpdate: (itemId: string, updates: { title?: string; content?: string | null }) => Promise<void>;
}

function parseDomain(url: string): string | null {
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return null; }
}

function domainInitial(domain: string | null): string {
  if (!domain) return '↗';
  return domain[0].toUpperCase();
}

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
  high:   { dot: 'bg-rose-500',   label: 'High'   },
  medium: { dot: 'bg-amber-500',  label: 'Medium' },
  low:    { dot: 'bg-sky-400',    label: 'Low'    },
};
const PRIORITY_CYCLE: Record<string, string | null> = {
  '': 'high', high: 'medium', medium: 'low', low: '',
};

const cardStyle: React.CSSProperties = { backgroundColor: '#0d111a', border: '1px solid #263043' };
const inputStyle: React.CSSProperties = {
  backgroundColor: '#05070b', border: '1px solid #263043',
  color: '#f8fafc', borderRadius: '10px',
  padding: '6px 12px', fontSize: '13px', width: '100%', outline: 'none',
};

export function ItemComponent({ item, onToggle, onDelete, onUpdate }: ItemProps) {
  const { getSignedUrl } = useFileUpload();
  const [opening,      setOpening]      = useState(false);
  const [pdfViewerUrl, setPdfViewerUrl] = useState<string | null>(null);
  const handleCloseModal = useCallback(() => setPdfViewerUrl(null), []);
  const [isEditing,    setIsEditing]    = useState(false);
  const [editTitle,    setEditTitle]    = useState(item.title);
  const [editContent,  setEditContent]  = useState(item.content || '');
  const [noteExpanded, setNoteExpanded] = useState(false);

  const handleToggle = async () => {
    try { await onToggle(item.id, !item.completed); }
    catch { toast.error('Failed to update task'); }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this item?')) return;
    try {
      // Remove from storage first if it's a file
      if (item.file_path) {
        await supabase.storage.from('pdfs').remove([item.file_path]);
      }
      await onDelete(item.id);
    } catch {
      toast.error('Failed to delete item');
    }
  };

  const handleOpenFile = async () => {
    if (!item.file_path) return;
    setOpening(true);
    try {
      const url = await getSignedUrl(item.file_path);
      setPdfViewerUrl(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not open file');
    } finally {
      setOpening(false);
    }
  };

  const handleSaveEdit = async () => {
    try {
      await onUpdate(item.id, { title: editTitle, content: editContent || null });
      setIsEditing(false);
    } catch {
      toast.error('Failed to save changes');
    }
  };

  const cyclePriority = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const current = item.content ?? '';
    const next = PRIORITY_CYCLE[current] ?? 'high';
    try { await onUpdate(item.id, { content: next || null }); }
    catch { toast.error('Failed to update priority'); }
  };

  // ── Edit mode ──────────────────────────────────────────────────────────────
  if (isEditing) {
    return (
      <div id={`item-${item.id}`} className="rounded-xl p-3 my-1" style={cardStyle}>
        <input
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          style={{ ...inputStyle, marginBottom: '8px' }}
          placeholder="Title"
          autoFocus
        />
        {item.type !== 'task' && item.type !== 'file' && (
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            style={{ ...inputStyle, minHeight: '72px', resize: 'none', marginBottom: '8px' }}
            placeholder={item.type === 'link' ? 'https://…' : 'Notes…'}
          />
        )}
        <div className="flex gap-2">
          <button
            onClick={handleSaveEdit}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors"
            style={{ backgroundColor: '#f59e0b', color: '#000' }}
          >
            <Check className="w-3.5 h-3.5" /> Save
          </button>
          <button
            onClick={() => { setIsEditing(false); setEditTitle(item.title); setEditContent(item.content || ''); }}
            className="px-3 py-1.5 text-xs transition-colors rounded-lg"
            style={{ color: '#4b5563' }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // ── Link item ──────────────────────────────────────────────────────────────
  if (item.type === 'link') {
    const domain = item.content ? parseDomain(item.content) : null;
    const initial = domainInitial(domain);
    const linkType = item.content ? detectLinkType(item.content) : null;

    return (
      <div
        id={`item-${item.id}`}
        className="group flex items-center rounded-xl transition-all"
        style={{ border: '1px solid transparent' }}
        onMouseEnter={e => (e.currentTarget.style.borderColor = '#1a2230')}
        onMouseLeave={e => (e.currentTarget.style.borderColor = 'transparent')}
      >
        <a
          href={item.content || '#'}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 flex-1 min-w-0 px-3 py-2.5"
        >
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
               style={{ backgroundColor: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.2)' }}>
            <span className="text-xs font-bold" style={{ color: '#38bdf8' }}>{initial}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-sm font-semibold truncate transition-colors"
                    style={{ color: '#f8fafc' }}>
                {item.title}
              </span>
              {linkType && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide flex-shrink-0"
                      style={{ backgroundColor: '#111827', color: '#4b5563' }}>
                  {linkType}
                </span>
              )}
              <ExternalLink className="w-3 h-3 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                            style={{ color: '#38bdf8' }} />
            </div>
            {domain && (
              <p className="text-xs mt-0.5 truncate" style={{ color: '#374151' }}>{domain}</p>
            )}
          </div>
        </a>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 pr-2">
          <button onClick={() => setIsEditing(true)}
                  className="px-2 py-1 text-[11px] font-medium transition-colors rounded"
                  style={{ color: '#4b5563' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#94a3b8')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#4b5563')}>
            Edit
          </button>
          <button onClick={handleDelete} className="p-1 rounded transition-colors"
                  style={{ color: '#374151' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#374151')}>
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  // ── File / PDF item ────────────────────────────────────────────────────────
  if (item.type === 'file') {
    return (
      <>
        <div
          id={`item-${item.id}`}
          className="group flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all"
          style={{ border: '1px solid transparent' }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = '#1a2230')}
          onMouseLeave={e => (e.currentTarget.style.borderColor = 'transparent')}
        >
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
               style={{ backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <FileText className="w-3.5 h-3.5" style={{ color: '#ef4444' }} />
          </div>
          <div className="flex-1 min-w-0">
            <span
              className="text-sm font-medium truncate block cursor-pointer transition-colors"
              style={{ color: '#f8fafc' }}
              onClick={() => setIsEditing(true)}
            >
              {item.title}
            </span>
            <span className="text-xs" style={{ color: '#374151' }}>PDF document</span>
          </div>
          {item.file_path && (
            <button
              onClick={handleOpenFile}
              disabled={opening}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all disabled:opacity-40 flex-shrink-0"
              style={{ backgroundColor: '#111827', color: '#94a3b8', border: '1px solid #263043' }}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f59e0b'; e.currentTarget.style.color = '#000'; e.currentTarget.style.borderColor = '#f59e0b'; }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#111827'; e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.borderColor = '#263043'; }}
            >
              {opening ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><FileText className="w-3.5 h-3.5" /> Open</>}
            </button>
          )}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
            <button onClick={() => setIsEditing(true)}
                    className="px-2 py-1 text-[11px] font-medium transition-colors rounded"
                    style={{ color: '#4b5563' }}>Edit</button>
            <button onClick={handleDelete} className="p-1 rounded transition-colors"
                    style={{ color: '#374151' }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                    onMouseLeave={e => (e.currentTarget.style.color = '#374151')}>
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        {pdfViewerUrl && (
          <PDFViewerModal url={pdfViewerUrl} title={item.title} onClose={handleCloseModal} />
        )}
      </>
    );
  }

  // ── Note item ──────────────────────────────────────────────────────────────
  if (item.type === 'note') {
    return (
      <div id={`item-${item.id}`} className="px-1 py-0.5">
        <div
          className="group relative rounded-xl p-3.5 transition-all"
          style={{
            backgroundColor: '#0d111a',
            border: '1px solid #1a2230',
            borderLeft: '3px solid #10b981',
          }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = '#263043')}
          onMouseLeave={e => (e.currentTarget.style.borderColor = '#1a2230')}
        >
          <div className="flex items-start gap-3">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                 style={{ backgroundColor: 'rgba(16,185,129,0.15)' }}>
              <StickyNote className="w-3.5 h-3.5" style={{ color: '#10b981' }} />
            </div>
            <div className="flex-1 min-w-0">
              <span
                className="text-sm font-semibold cursor-pointer leading-snug block mb-1"
                style={{ color: '#f8fafc' }}
                onClick={() => setIsEditing(true)}
              >
                {item.title}
              </span>
              {item.content && (
                <div>
                  <div className="rounded-lg px-2.5 py-2" style={{ backgroundColor: '#111827' }}>
                    <p className={`text-xs leading-relaxed whitespace-pre-wrap ${noteExpanded ? '' : 'line-clamp-3'}`}
                       style={{ color: '#94a3b8' }}>
                      {item.content}
                    </p>
                  </div>
                  {item.content.length > 100 && (
                    <button
                      onClick={() => setNoteExpanded(!noteExpanded)}
                      className="flex items-center gap-0.5 text-[11px] font-medium mt-1.5 transition-colors"
                      style={{ color: '#10b981' }}
                    >
                      {noteExpanded ? <><ChevronUp className="w-3 h-3" />Show less</> : <><ChevronDown className="w-3 h-3" />Show more</>}
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
              <button onClick={() => setIsEditing(true)}
                      className="px-2 py-1 text-[11px] font-medium transition-colors rounded"
                      style={{ color: '#4b5563' }}>Edit</button>
              <button onClick={handleDelete} className="p-1 rounded transition-colors"
                      style={{ color: '#374151' }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                      onMouseLeave={e => (e.currentTarget.style.color = '#374151')}>
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
      className="group flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all"
      style={{ border: '1px solid transparent' }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = '#1a2230')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'transparent')}
    >
      <button
        onClick={handleToggle}
        className="flex-shrink-0 hover:scale-110 transition-transform"
        title={item.completed ? 'Mark incomplete' : 'Mark complete'}
      >
        {item.completed
          ? <CheckSquare className="w-4 h-4" style={{ color: '#f59e0b' }} />
          : <Square className="w-4 h-4" style={{ color: '#263043' }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#4b5563')}
                    onMouseLeave={e => (e.currentTarget.style.color = '#263043')} />
        }
      </button>

      <span
        className={`flex-1 text-sm leading-snug cursor-pointer select-none transition-colors`}
        style={{ color: item.completed ? '#374151' : '#f8fafc',
                 textDecoration: item.completed ? 'line-through' : 'none' }}
        onClick={() => setIsEditing(true)}
      >
        {item.title}
      </span>

      {!item.completed && (
        <button
          onClick={cyclePriority}
          title={priorityCfg ? `Priority: ${priorityCfg.label} (click to change)` : 'Set priority'}
          className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <span className={`block w-2 h-2 rounded-full transition-colors ${priorityCfg ? priorityCfg.dot : 'bg-[#263043] hover:bg-[#374151]'}`} />
        </button>
      )}

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        <button onClick={() => setIsEditing(true)}
                className="px-2 py-1 text-[11px] font-medium transition-colors rounded"
                style={{ color: '#4b5563' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#94a3b8')}
                onMouseLeave={e => (e.currentTarget.style.color = '#4b5563')}>
          Edit
        </button>
        <button onClick={handleDelete} className="p-1 rounded transition-colors"
                style={{ color: '#374151' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                onMouseLeave={e => (e.currentTarget.style.color = '#374151')}>
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
