import { useState, useEffect, useRef } from 'react';
import {
  ExternalLink, Plus, Trash2, Pencil, Check, X,
  BookOpen, Mail, MessageCircle, Video, HardDrive,
  Bot, GraduationCap, Globe, Link2, Github, Sparkles,
} from 'lucide-react';
import { usePortalLinks, detectFromUrl, AddPortalPayload } from '../hooks/usePortalLinks';
import { CourseLink, CourseLinkType } from '../types';
import toast from 'react-hot-toast';

// ── Shared type meta (also exported for CourseHub / SessionPage) ──────────────

export interface TypeMeta {
  label: string;
  icon: React.ReactNode;
  iconBg: string;
  badge: string;
  textColor: string;
}

export const TYPE_META: Record<CourseLinkType, TypeMeta> = {
  moodle:   { label: 'Moodle',   icon: <BookOpen      className="w-3.5 h-3.5" />, iconBg: 'bg-orange-500/20 text-orange-400',  badge: 'bg-orange-500/10 text-orange-400 border-orange-500/20',  textColor: 'text-orange-400'  },
  netpa:    { label: 'NetPA',    icon: <GraduationCap className="w-3.5 h-3.5" />, iconBg: 'bg-blue-500/20 text-blue-400',      badge: 'bg-blue-500/10 text-blue-400 border-blue-500/20',        textColor: 'text-blue-400'    },
  drive:    { label: 'Drive',    icon: <HardDrive     className="w-3.5 h-3.5" />, iconBg: 'bg-emerald-500/20 text-emerald-400',badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',textColor: 'text-emerald-400' },
  chatgpt:  { label: 'AI',       icon: <Bot           className="w-3.5 h-3.5" />, iconBg: 'bg-violet-500/20 text-violet-400',  badge: 'bg-violet-500/10 text-violet-400 border-violet-500/20',  textColor: 'text-violet-400'  },
  whatsapp: { label: 'WhatsApp', icon: <MessageCircle className="w-3.5 h-3.5" />, iconBg: 'bg-green-500/20 text-green-400',    badge: 'bg-green-500/10 text-green-400 border-green-500/20',     textColor: 'text-green-400'   },
  email:    { label: 'Email',    icon: <Mail          className="w-3.5 h-3.5" />, iconBg: 'bg-sky-500/20 text-sky-400',        badge: 'bg-sky-500/10 text-sky-400 border-sky-500/20',           textColor: 'text-sky-400'     },
  zoom:     { label: 'Zoom',     icon: <Video         className="w-3.5 h-3.5" />, iconBg: 'bg-blue-500/20 text-blue-400',      badge: 'bg-blue-500/10 text-blue-400 border-blue-500/20',        textColor: 'text-blue-400'    },
  teams:    { label: 'Teams',    icon: <Video         className="w-3.5 h-3.5" />, iconBg: 'bg-indigo-500/20 text-indigo-400',  badge: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',  textColor: 'text-indigo-400'  },
  github:   { label: 'GitHub',   icon: <Github        className="w-3.5 h-3.5" />, iconBg: 'bg-slate-500/20 text-slate-300',    badge: 'bg-slate-500/10 text-slate-300 border-slate-500/20',     textColor: 'text-slate-300'   },
  custom:   { label: 'Link',     icon: <Globe         className="w-3.5 h-3.5" />, iconBg: 'bg-slate-500/15 text-slate-400',    badge: 'bg-slate-500/10 text-slate-400 border-[#263043]',        textColor: 'text-slate-400'   },
};

const STARTERS: { type: CourseLinkType; label: string; placeholder: string }[] = [
  { type: 'moodle',   label: 'Moodle',         placeholder: 'https://moodle.university.edu/...'          },
  { type: 'netpa',    label: 'NetPA',           placeholder: 'https://netpa.university.edu/...'           },
  { type: 'drive',    label: 'Google Drive',    placeholder: 'https://drive.google.com/drive/folders/...' },
  { type: 'chatgpt',  label: 'ChatGPT tutor',  placeholder: 'https://chatgpt.com/...'                    },
  { type: 'whatsapp', label: 'WhatsApp group',  placeholder: 'https://chat.whatsapp.com/...'              },
  { type: 'email',    label: 'Professor email', placeholder: 'prof.name@university.edu'                   },
];

function domainHint(url: string): string {
  try {
    const u = new URL(url.startsWith('mailto:') ? `https://x` : url);
    return u.hostname.replace(/^www\./, '').slice(0, 28);
  } catch {
    return url.replace(/^mailto:/, '').slice(0, 28);
  }
}

// ── Form inputs ───────────────────────────────────────────────────────────────

const inp = 'w-full px-3.5 py-2 rounded-xl text-sm transition-all focus:outline-none';
const inpStyle: React.CSSProperties = {
  backgroundColor: '#05070b',
  border: '1px solid #263043',
  color: '#f8fafc',
};

// ── Smart add form ────────────────────────────────────────────────────────────

interface AddFormProps {
  defaultType?: CourseLinkType;
  defaultLabel?: string;
  defaultPlaceholder?: string;
  onSave: (payload: AddPortalPayload) => Promise<void>;
  onCancel: () => void;
}

function SmartAddForm({ defaultType = 'custom', defaultLabel = '', defaultPlaceholder, onSave, onCancel }: AddFormProps) {
  const [url,          setUrl]          = useState('');
  const [label,        setLabel]        = useState(defaultLabel);
  const [labelTouched, setLabelTouched] = useState(!!defaultLabel);
  const [saving,       setSaving]       = useState(false);
  const urlRef = useRef<HTMLInputElement>(null);

  const { type: detectedType, suggestedLabel } = detectFromUrl(url || '');
  const effectiveType = url.trim() ? detectedType : defaultType;

  useEffect(() => {
    if (!labelTouched && suggestedLabel) setLabel(suggestedLabel);
  }, [suggestedLabel, labelTouched]);

  useEffect(() => { urlRef.current?.focus(); }, []);

  const meta = TYPE_META[effectiveType] ?? TYPE_META.custom;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim() || !url.trim()) return;
    setSaving(true);
    try {
      await onSave({ label: label.trim(), url: url.trim(), type: effectiveType, scope: 'global' });
    } catch { /* toast handled by caller */ }
    finally { setSaving(false); }
  };

  return (
    <form onSubmit={handleSubmit} className="mt-3 rounded-xl p-3 space-y-2.5 animate-fade-in"
          style={{ backgroundColor: '#05070b', border: '1px solid #263043' }}>
      <div>
        <label className="block text-[10px] font-bold uppercase tracking-widest mb-1.5"
               style={{ color: '#4b5563' }}>
          URL or email
        </label>
        <div className="relative">
          <input
            ref={urlRef}
            type="text"
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder={defaultPlaceholder ?? 'https://… or name@university.edu'}
            className={`${inp} pr-20`}
            style={{ ...inpStyle, paddingRight: url.trim() ? '5rem' : undefined }}
            required
          />
          {url.trim() && (
            <span className={`absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${meta.badge}`}>
              {meta.label}
            </span>
          )}
        </div>
      </div>
      <div>
        <label className="block text-[10px] font-bold uppercase tracking-widest mb-1.5"
               style={{ color: '#4b5563' }}>
          Label
        </label>
        <input
          type="text"
          value={label}
          onChange={e => { setLabel(e.target.value); setLabelTouched(true); }}
          placeholder="e.g. Calculus Moodle"
          className={inp}
          style={inpStyle}
          required
        />
      </div>
      <div className="flex gap-2 pt-0.5">
        <button
          type="submit"
          disabled={saving || !label.trim() || !url.trim()}
          className="flex items-center gap-1.5 px-3 py-1.5 text-black text-xs font-bold rounded-lg transition-colors disabled:opacity-30"
          style={{ backgroundColor: '#f59e0b' }}
        >
          {saving
            ? <span className="w-3 h-3 border border-black border-t-transparent rounded-full animate-spin" />
            : <Check className="w-3 h-3" />}
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 text-xs font-medium rounded-lg transition-colors"
          style={{ border: '1px solid #263043', color: '#94a3b8' }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ── Edit form ─────────────────────────────────────────────────────────────────

function EditForm({ link, onSave, onCancel }: {
  link: CourseLink;
  onSave: (label: string, url: string, type: CourseLinkType) => Promise<void>;
  onCancel: () => void;
}) {
  const [label,  setLabel]  = useState(link.label);
  const [url,    setUrl]    = useState(link.url.replace(/^mailto:/, ''));
  const [saving, setSaving] = useState(false);

  const { type: detectedType } = detectFromUrl(url);
  const effectiveType = url.trim() ? detectedType : link.type;
  const meta = TYPE_META[effectiveType] ?? TYPE_META.custom;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try { await onSave(label.trim(), url.trim(), effectiveType); }
    finally { setSaving(false); }
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-xl p-3 space-y-2 animate-fade-in"
          style={{ backgroundColor: '#05070b', border: '1px solid #263043' }}>
      <div className="relative">
        <input type="text" value={url} onChange={e => setUrl(e.target.value)}
               placeholder="URL or email" className={`${inp} pr-20`} style={inpStyle} required />
        {url.trim() && (
          <span className={`absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${meta.badge}`}>
            {meta.label}
          </span>
        )}
      </div>
      <input type="text" value={label} onChange={e => setLabel(e.target.value)}
             placeholder="Label" className={inp} style={inpStyle} required />
      <div className="flex gap-2">
        <button type="submit" disabled={saving || !label.trim() || !url.trim()}
                className="flex items-center gap-1.5 px-3 py-1.5 text-black text-xs font-bold rounded-lg transition-colors disabled:opacity-30"
                style={{ backgroundColor: '#f59e0b' }}>
          {saving ? <span className="w-3 h-3 border border-black border-t-transparent rounded-full animate-spin" /> : <Check className="w-3 h-3" />}
          Update
        </button>
        <button type="button" onClick={onCancel}
                className="px-3 py-1.5 text-xs font-medium rounded-lg"
                style={{ border: '1px solid #263043', color: '#94a3b8' }}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// ── Portal chip ───────────────────────────────────────────────────────────────

function PortalChip({ link, onEdit, onDelete }: { link: CourseLink; onEdit: () => void; onDelete: () => void }) {
  const meta = TYPE_META[link.type] ?? TYPE_META.custom;
  const href = link.url.startsWith('mailto:') || (link.url.includes('@') && !link.url.startsWith('http'))
    ? (link.url.startsWith('mailto:') ? link.url : `mailto:${link.url}`)
    : link.url;
  const isEmail = href.startsWith('mailto:');

  return (
    <div
      className="group relative flex items-center gap-2.5 rounded-xl px-3 py-2.5 transition-all min-w-0"
      style={{ backgroundColor: '#111827', border: '1px solid #263043' }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = '#374151')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = '#263043')}
    >
      <span className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${meta.iconBg}`}>
        {meta.icon}
      </span>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate leading-tight" style={{ color: '#f8fafc' }}>
          {link.label}
        </p>
        <p className="text-[10px] truncate leading-tight mt-0.5" style={{ color: '#4b5563' }}>
          {domainHint(link.url)}
        </p>
      </div>

      <a
        href={href}
        target={isEmail ? '_self' : '_blank'}
        rel="noopener noreferrer"
        onClick={e => e.stopPropagation()}
        className={`flex-shrink-0 flex items-center gap-0.5 text-xs font-bold px-2 py-1 rounded-lg transition-colors ${meta.textColor}`}
        style={{ color: '#f59e0b' }}
      >
        Open <ExternalLink className="w-3 h-3" />
      </a>

      <div className="absolute -top-2 -right-1 opacity-0 group-hover:opacity-100 flex items-center gap-0.5 rounded-lg shadow-xl px-1 py-0.5 transition-opacity z-10"
           style={{ backgroundColor: '#0d111a', border: '1px solid #263043' }}>
        <button onClick={onEdit}   className="p-0.5 rounded transition-colors" style={{ color: '#94a3b8' }}><Pencil  className="w-3 h-3" /></button>
        <button onClick={onDelete} className="p-0.5 rounded transition-colors" style={{ color: '#94a3b8' }}><Trash2  className="w-3 h-3" /></button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function MyPortals() {
  const { links, loading, addLink, updateLink, deleteLink } = usePortalLinks('global');

  const [editingId,     setEditingId]     = useState<string | null>(null);
  const [addState,      setAddState]      = useState<{ type: CourseLinkType; label: string; placeholder: string } | null>(null);
  const [showAddCustom, setShowAddCustom] = useState(false);

  const closeAdd = () => { setAddState(null); setShowAddCustom(false); };

  const handleAdd = async (payload: AddPortalPayload) => {
    try {
      await addLink(payload);
      toast.success('Portal saved');
      closeAdd();
    } catch {
      toast.error('Failed to save portal');
      throw new Error('save failed');
    }
  };

  const handleUpdate = async (id: string, label: string, url: string, type: CourseLinkType) => {
    try {
      await updateLink(id, { label, url, type });
      toast.success('Portal updated');
      setEditingId(null);
    } catch {
      toast.error('Failed to update');
      throw new Error('update failed');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Remove this portal?')) return;
    try { await deleteLink(id); toast.success('Portal removed'); }
    catch { toast.error('Failed to remove portal'); }
  };

  if (loading) return null;

  const showingForm = addState !== null || showAddCustom;
  const hasLinks    = links.length > 0;

  return (
    <div className="rounded-2xl overflow-hidden mb-6"
         style={{ backgroundColor: '#0d111a', border: '1px solid #263043' }}>

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5"
           style={{ borderBottom: '1px solid #263043' }}>
        <div className="flex items-center gap-2">
          <Link2 className="w-4 h-4" style={{ color: '#374151' }} />
          <span className="text-sm font-semibold" style={{ color: '#94a3b8' }}>Tools</span>
          {hasLinks && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                  style={{ backgroundColor: '#111827', color: '#4b5563' }}>
              {links.length}
            </span>
          )}
        </div>
        {!showingForm ? (
          <button
            onClick={() => setShowAddCustom(true)}
            className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors"
            style={{ color: '#4b5563' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#94a3b8')}
            onMouseLeave={e => (e.currentTarget.style.color = '#4b5563')}
          >
            <Plus className="w-3 h-3" strokeWidth={2.5} /> Add portal
          </button>
        ) : (
          <button onClick={closeAdd} className="p-1 rounded-lg transition-colors"
                  style={{ color: '#4b5563' }}>
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="px-5 py-4">

        {/* Empty state */}
        {!hasLinks && !showingForm && (
          <div>
            <div className="flex items-start gap-3 mb-4">
              <span className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: '#111827' }}>
                <Sparkles className="w-4 h-4" style={{ color: '#f59e0b' }} />
              </span>
              <div>
                <p className="text-sm font-semibold leading-snug" style={{ color: '#f8fafc' }}>
                  Your tools, one click away
                </p>
                <p className="text-xs mt-0.5 leading-relaxed" style={{ color: '#4b5563' }}>
                  Save Moodle, NetPA, Drive, ChatGPT, WhatsApp — anything you open every session.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {STARTERS.map(s => {
                const m = TYPE_META[s.type];
                return (
                  <button
                    key={s.type}
                    onClick={() => setAddState({ type: s.type, label: s.label, placeholder: s.placeholder })}
                    className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all ${m.badge}`}
                  >
                    {m.icon}+ {s.label}
                  </button>
                );
              })}
              <button
                onClick={() => setShowAddCustom(true)}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border-dashed transition-all"
                style={{ border: '1px dashed #263043', color: '#4b5563' }}
              >
                <Globe className="w-3.5 h-3.5" />+ Custom
              </button>
            </div>
          </div>
        )}

        {/* Portal chips */}
        {hasLinks && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {links.map(link =>
              editingId === link.id ? (
                <div key={link.id} className="col-span-full">
                  <EditForm
                    link={link}
                    onSave={(label, url, type) => handleUpdate(link.id, label, url, type)}
                    onCancel={() => setEditingId(null)}
                  />
                </div>
              ) : (
                <PortalChip
                  key={link.id}
                  link={link}
                  onEdit={() => { setEditingId(link.id); closeAdd(); }}
                  onDelete={() => handleDelete(link.id)}
                />
              )
            )}
          </div>
        )}

        {/* Add more */}
        {hasLinks && !showingForm && editingId === null && (
          <div className="mt-3 pt-3 flex flex-wrap gap-1.5"
               style={{ borderTop: '1px solid #1a2230' }}>
            {STARTERS
              .filter(s => !links.some(l => l.type === s.type))
              .map(s => {
                const m = TYPE_META[s.type];
                return (
                  <button
                    key={s.type}
                    onClick={() => setAddState({ type: s.type, label: s.label, placeholder: s.placeholder })}
                    className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg transition-colors"
                    style={{ border: '1px solid #263043', color: '#4b5563' }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#94a3b8')}
                    onMouseLeave={e => (e.currentTarget.style.color = '#4b5563')}
                  >
                    {m.icon}{s.label}
                  </button>
                );
              })}
            <button
              onClick={() => setShowAddCustom(true)}
              className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg transition-colors"
              style={{ border: '1px dashed #263043', color: '#4b5563' }}
            >
              <Plus className="w-3 h-3" strokeWidth={2} />custom
            </button>
          </div>
        )}

        {addState !== null && (
          <SmartAddForm
            defaultType={addState.type}
            defaultLabel={addState.label}
            defaultPlaceholder={addState.placeholder}
            onSave={handleAdd}
            onCancel={closeAdd}
          />
        )}
        {showAddCustom && (
          <SmartAddForm onSave={handleAdd} onCancel={closeAdd} />
        )}

      </div>
    </div>
  );
}
