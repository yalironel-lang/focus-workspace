import { useState } from 'react';
import {
  ExternalLink, Plus, Trash2, Pencil, Check,
  BookOpen, Mail, MessageCircle, Video, HardDrive,
  Bot, GraduationCap, Globe, Link2,
} from 'lucide-react';
import { useCourseLinks } from '../hooks/useCourseLinks';
import { CourseLink, CourseLinkType } from '../types';
import toast from 'react-hot-toast';

// ── Type meta ─────────────────────────────────────────────────────────────────

interface TypeMeta {
  label: string;
  icon: React.ReactNode;
  badge: string;   // Tailwind classes for the badge chip
  ring: string;    // accent ring on the card
}

const TYPE_META: Record<CourseLinkType, TypeMeta> = {
  moodle:   { label: 'Moodle',    icon: <BookOpen   className="w-4 h-4" />, badge: 'bg-orange-100 text-orange-700 border-orange-200',   ring: 'ring-orange-200'  },
  netpa:    { label: 'NetPA',     icon: <GraduationCap className="w-4 h-4" />, badge: 'bg-blue-100 text-blue-700 border-blue-200',       ring: 'ring-blue-200'    },
  drive:    { label: 'Drive',     icon: <HardDrive  className="w-4 h-4" />, badge: 'bg-emerald-100 text-emerald-700 border-emerald-200', ring: 'ring-emerald-200' },
  chatgpt:  { label: 'AI',        icon: <Bot        className="w-4 h-4" />, badge: 'bg-violet-100 text-violet-700 border-violet-200',    ring: 'ring-violet-200'  },
  whatsapp: { label: 'WhatsApp',  icon: <MessageCircle className="w-4 h-4" />, badge: 'bg-green-100 text-green-700 border-green-200',   ring: 'ring-green-200'   },
  email:    { label: 'Email',     icon: <Mail       className="w-4 h-4" />, badge: 'bg-sky-100 text-sky-700 border-sky-200',             ring: 'ring-sky-200'     },
  zoom:     { label: 'Zoom',      icon: <Video      className="w-4 h-4" />, badge: 'bg-blue-100 text-blue-700 border-blue-200',          ring: 'ring-blue-200'    },
  teams:    { label: 'Teams',     icon: <Video      className="w-4 h-4" />, badge: 'bg-indigo-100 text-indigo-700 border-indigo-200',    ring: 'ring-indigo-200'  },
  custom:   { label: 'Link',      icon: <Globe      className="w-4 h-4" />, badge: 'bg-slate-100 text-slate-600 border-slate-200',       ring: 'ring-slate-200'   },
};

const LINK_TYPES: { value: CourseLinkType; label: string }[] = [
  { value: 'moodle',   label: 'Moodle'    },
  { value: 'netpa',    label: 'NetPA'     },
  { value: 'drive',    label: 'Google Drive' },
  { value: 'chatgpt',  label: 'ChatGPT / AI' },
  { value: 'whatsapp', label: 'WhatsApp'  },
  { value: 'email',    label: 'Professor email' },
  { value: 'zoom',     label: 'Zoom'      },
  { value: 'teams',    label: 'Teams'     },
  { value: 'custom',   label: 'Custom link' },
];

// Starter suggestions shown when no links exist
const STARTERS: { type: CourseLinkType; label: string; placeholder: string }[] = [
  { type: 'moodle',   label: 'Moodle',          placeholder: 'https://moodle.university.edu/course/...' },
  { type: 'netpa',    label: 'NetPA',            placeholder: 'https://netpa.university.edu/...'        },
  { type: 'drive',    label: 'Google Drive',     placeholder: 'https://drive.google.com/drive/folders/...' },
  { type: 'chatgpt',  label: 'ChatGPT tutor',   placeholder: 'https://chatgpt.com/...'                 },
  { type: 'whatsapp', label: 'WhatsApp group',   placeholder: 'https://chat.whatsapp.com/...'          },
  { type: 'email',    label: 'Professor email',  placeholder: 'prof.name@university.edu'               },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeUrl(raw: string): string {
  const t = raw.trim();
  // Plain email → mailto
  if (!t.startsWith('http') && !t.startsWith('mailto:') && t.includes('@')) {
    return `mailto:${t}`;
  }
  return t;
}

function hrefForLink(link: CourseLink): string {
  return normalizeUrl(link.url);
}

// ── Add-link form ─────────────────────────────────────────────────────────────

interface AddFormProps {
  defaultType?: CourseLinkType;
  defaultLabel?: string;
  defaultPlaceholder?: string;
  onSave: (label: string, url: string, type: CourseLinkType) => Promise<void>;
  onCancel: () => void;
}

function AddForm({ defaultType = 'custom', defaultLabel = '', defaultPlaceholder, onSave, onCancel }: AddFormProps) {
  const [label, setLabel] = useState(defaultLabel);
  const [url,   setUrl]   = useState('');
  const [type,  setType]  = useState<CourseLinkType>(defaultType);
  const [saving, setSaving] = useState(false);

  const placeholder = defaultPlaceholder ?? (
    type === 'email' ? 'prof.name@university.edu' : 'https://…'
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim() || !url.trim()) return;
    setSaving(true);
    try {
      await onSave(label.trim(), url.trim(), type);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mt-3 bg-slate-50 rounded-xl border border-slate-200 p-3 space-y-2 animate-fade-in">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label-xs">Label</label>
          <input
            type="text"
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder="e.g. Calculus Moodle"
            className="input text-xs py-1.5"
            autoFocus
            required
          />
        </div>
        <div>
          <label className="label-xs">Type</label>
          <select value={type} onChange={e => setType(e.target.value as CourseLinkType)} className="input text-xs py-1.5">
            {LINK_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="label-xs">URL / Email</label>
        <input
          type="text"
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder={placeholder}
          className="input text-xs py-1.5"
          required
        />
      </div>
      <div className="flex gap-2 pt-0.5">
        <button
          type="submit"
          disabled={saving || !label.trim() || !url.trim()}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-40"
        >
          {saving ? <span className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" /> : <Check className="w-3 h-3" />}
          Save link
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 border border-slate-200 text-slate-500 text-xs font-medium rounded-lg hover:bg-slate-100 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ── Edit-link form ────────────────────────────────────────────────────────────

interface EditFormProps {
  link: CourseLink;
  onSave: (label: string, url: string, type: CourseLinkType) => Promise<void>;
  onCancel: () => void;
}

function EditForm({ link, onSave, onCancel }: EditFormProps) {
  const [label, setLabel] = useState(link.label);
  const [url,   setUrl]   = useState(link.url);
  const [type,  setType]  = useState<CourseLinkType>(link.type);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim() || !url.trim()) return;
    setSaving(true);
    try { await onSave(label.trim(), url.trim(), type); }
    finally { setSaving(false); }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-slate-50 rounded-xl border border-slate-200 p-3 space-y-2 animate-fade-in">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label-xs">Label</label>
          <input type="text" value={label} onChange={e => setLabel(e.target.value)} className="input text-xs py-1.5" required />
        </div>
        <div>
          <label className="label-xs">Type</label>
          <select value={type} onChange={e => setType(e.target.value as CourseLinkType)} className="input text-xs py-1.5">
            {LINK_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="label-xs">URL / Email</label>
        <input type="text" value={url} onChange={e => setUrl(e.target.value)} className="input text-xs py-1.5" required />
      </div>
      <div className="flex gap-2 pt-0.5">
        <button type="submit" disabled={saving || !label.trim() || !url.trim()} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-40">
          {saving ? <span className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" /> : <Check className="w-3 h-3" />}
          Update
        </button>
        <button type="button" onClick={onCancel} className="px-3 py-1.5 border border-slate-200 text-slate-500 text-xs font-medium rounded-lg hover:bg-slate-100 transition-colors">
          Cancel
        </button>
      </div>
    </form>
  );
}

// ── Link card ─────────────────────────────────────────────────────────────────

interface LinkCardProps {
  link: CourseLink;
  onEdit: () => void;
  onDelete: () => void;
}

function LinkCard({ link, onEdit, onDelete }: LinkCardProps) {
  const meta = TYPE_META[link.type] ?? TYPE_META.custom;
  const href = hrefForLink(link);

  return (
    <div className={`group relative flex items-center gap-3 bg-white border border-slate-100 rounded-xl px-3.5 py-2.5 hover:border-slate-200 hover:shadow-sm transition-all ring-1 ring-transparent hover:${meta.ring}`}>
      {/* Icon */}
      <span className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center border ${meta.badge}`}>
        {meta.icon}
      </span>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-semibold text-slate-800 truncate">{link.label}</span>
          <span className={`hidden sm:inline-flex text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${meta.badge}`}>
            {meta.label}
          </span>
        </div>
        <span className="text-[11px] text-slate-400 truncate block">
          {link.url.replace(/^mailto:/, '')}
        </span>
      </div>

      {/* Open CTA */}
      <a
        href={href}
        target={href.startsWith('mailto:') ? '_self' : '_blank'}
        rel="noopener noreferrer"
        className="flex-shrink-0 flex items-center gap-1 text-xs font-semibold text-primary-600 hover:text-primary-700 px-2.5 py-1.5 rounded-lg hover:bg-primary-50 transition-colors"
        onClick={e => e.stopPropagation()}
      >
        Open <ExternalLink className="w-3 h-3" />
      </a>

      {/* Hover actions */}
      <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-opacity bg-white rounded-lg shadow-sm border border-slate-100 p-0.5">
        <button
          onClick={onEdit}
          title="Edit"
          className="p-1 text-slate-400 hover:text-slate-700 rounded transition-colors"
        >
          <Pencil className="w-3 h-3" />
        </button>
        <button
          onClick={onDelete}
          title="Delete"
          className="p-1 text-slate-400 hover:text-red-500 rounded transition-colors"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

// ── Main CourseHub card ───────────────────────────────────────────────────────

interface Props {
  sectionId: string;
}

export function CourseHub({ sectionId }: Props) {
  const { links, loading, addLink, updateLink, deleteLink } = useCourseLinks(sectionId);

  // Which link is being edited (id → true)
  const [editingId, setEditingId] = useState<string | null>(null);
  // Add form state: null = hidden, string = starter type pre-filled
  const [addState, setAddState]   = useState<{ type: CourseLinkType; label: string; placeholder: string } | null>(null);
  // Generic "add custom" form
  const [showAddCustom, setShowAddCustom] = useState(false);

  const handleAdd = async (label: string, url: string, type: CourseLinkType) => {
    try {
      await addLink({ label, url, type });
      toast.success('Link saved');
      setAddState(null);
      setShowAddCustom(false);
    } catch {
      toast.error('Failed to save link');
      throw new Error('save failed');
    }
  };

  const handleUpdate = async (id: string, label: string, url: string, type: CourseLinkType) => {
    try {
      await updateLink(id, { label, url, type });
      toast.success('Link updated');
      setEditingId(null);
    } catch {
      toast.error('Failed to update link');
      throw new Error('update failed');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Remove this link?')) return;
    try {
      await deleteLink(id);
      toast.success('Link removed');
    } catch {
      toast.error('Failed to remove link');
    }
  };

  if (loading) return null;

  const isEmpty = links.length === 0 && addState === null && !showAddCustom;

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden mb-4">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-50">
        <div className="flex items-center gap-2">
          <Link2 className="w-4 h-4 text-primary-500" />
          <span className="text-sm font-semibold text-slate-800">Course Hub</span>
          {links.length > 0 && (
            <span className="text-[10px] font-bold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">
              {links.length}
            </span>
          )}
        </div>
        {!showAddCustom && addState === null && (
          <button
            onClick={() => setShowAddCustom(true)}
            className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-900 px-2.5 py-1 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <Plus className="w-3 h-3" strokeWidth={2.5} /> Add link
          </button>
        )}
      </div>

      <div className="p-4">
        {/* ── Empty state ─────────────────────────────────────────────────── */}
        {isEmpty && (
          <div>
            <p className="text-xs text-slate-400 mb-3 leading-relaxed">
              Save the tools you actually use — one click to open them during a study session.
            </p>
            <div className="flex flex-wrap gap-2">
              {STARTERS.map(s => {
                const meta = TYPE_META[s.type];
                return (
                  <button
                    key={s.type}
                    onClick={() => setAddState({ type: s.type, label: s.label, placeholder: s.placeholder })}
                    className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all hover:shadow-sm ${meta.badge}`}
                  >
                    {meta.icon}
                    + {s.label}
                  </button>
                );
              })}
              <button
                onClick={() => setShowAddCustom(true)}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-all hover:shadow-sm"
              >
                <Globe className="w-4 h-4" />
                + Custom link
              </button>
            </div>
          </div>
        )}

        {/* ── Saved links ─────────────────────────────────────────────────── */}
        {links.length > 0 && (
          <div className="space-y-2">
            {links.map(link =>
              editingId === link.id ? (
                <EditForm
                  key={link.id}
                  link={link}
                  onSave={(label, url, type) => handleUpdate(link.id, label, url, type)}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <LinkCard
                  key={link.id}
                  link={link}
                  onEdit={() => { setEditingId(link.id); setAddState(null); setShowAddCustom(false); }}
                  onDelete={() => handleDelete(link.id)}
                />
              )
            )}
          </div>
        )}

        {/* ── Starter add form ────────────────────────────────────────────── */}
        {addState !== null && (
          <AddForm
            defaultType={addState.type}
            defaultLabel={addState.label}
            defaultPlaceholder={addState.placeholder}
            onSave={handleAdd}
            onCancel={() => setAddState(null)}
          />
        )}

        {/* ── Custom add form ─────────────────────────────────────────────── */}
        {showAddCustom && (
          <AddForm
            defaultType="custom"
            onSave={handleAdd}
            onCancel={() => setShowAddCustom(false)}
          />
        )}

        {/* ── "Add another" row when links already exist ──────────────────── */}
        {links.length > 0 && addState === null && !showAddCustom && (
          <div className="mt-2.5 pt-2.5 border-t border-slate-50 flex flex-wrap gap-1.5">
            {STARTERS
              .filter(s => !links.some(l => l.type === s.type))
              .map(s => {
                const meta = TYPE_META[s.type];
                return (
                  <button
                    key={s.type}
                    onClick={() => setAddState({ type: s.type, label: s.label, placeholder: s.placeholder })}
                    className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg border text-slate-500 border-slate-200 hover:bg-slate-50 transition-colors"
                  >
                    {meta.icon}
                    {s.label}
                  </button>
                );
              })}
            <button
              onClick={() => setShowAddCustom(true)}
              className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg border text-slate-400 border-dashed border-slate-200 hover:text-slate-600 hover:border-slate-300 transition-colors"
            >
              <Plus className="w-3 h-3" strokeWidth={2} /> custom
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
