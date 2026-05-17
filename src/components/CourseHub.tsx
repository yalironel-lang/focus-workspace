import { useState, useEffect, useRef } from 'react';
import {
  ExternalLink, Plus, Trash2, Pencil, Check, X,
  Link2, Globe, LayoutDashboard, BookMarked,
} from 'lucide-react';
import { usePortalLinks, detectFromUrl, AddPortalPayload } from '../hooks/usePortalLinks';
import { TYPE_META } from './MyPortals';
import { CourseLink, CourseLinkType, PortalScope } from '../types';
import toast from 'react-hot-toast';

const COURSE_STARTERS: { type: CourseLinkType; label: string; placeholder: string }[] = [
  { type: 'moodle',   label: 'Moodle',          placeholder: 'https://moodle.university.edu/...'          },
  { type: 'netpa',    label: 'NetPA',            placeholder: 'https://netpa.university.edu/...'           },
  { type: 'drive',    label: 'Google Drive',     placeholder: 'https://drive.google.com/drive/folders/...' },
  { type: 'chatgpt',  label: 'ChatGPT tutor',   placeholder: 'https://chatgpt.com/...'                    },
  { type: 'whatsapp', label: 'WhatsApp group',   placeholder: 'https://chat.whatsapp.com/...'             },
  { type: 'email',    label: 'Professor email',  placeholder: 'prof.name@university.edu'                  },
];

// ── Smart add form ────────────────────────────────────────────────────────────

interface AddFormProps {
  sectionId: string;
  defaultType?: CourseLinkType;
  defaultLabel?: string;
  defaultPlaceholder?: string;
  onSave: (payload: AddPortalPayload) => Promise<void>;
  onCancel: () => void;
}

function SmartAddForm({ sectionId, defaultType = 'custom', defaultLabel = '', defaultPlaceholder, onSave, onCancel }: AddFormProps) {
  const [url,          setUrl]          = useState('');
  const [label,        setLabel]        = useState(defaultLabel);
  const [labelTouched, setLabelTouched] = useState(!!defaultLabel);
  const [scope,        setScope]        = useState<PortalScope>('course');
  const [saving,       setSaving]       = useState(false);
  const urlRef = useRef<HTMLInputElement>(null);

  const { type: detectedType, suggestedLabel } = detectFromUrl(url || '');
  const effectiveType = url.trim() ? detectedType : defaultType;
  const meta = TYPE_META[effectiveType] ?? TYPE_META.custom;

  useEffect(() => {
    if (!labelTouched && suggestedLabel) setLabel(suggestedLabel);
  }, [suggestedLabel, labelTouched]);

  useEffect(() => { urlRef.current?.focus(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim() || !url.trim()) return;
    setSaving(true);
    try {
      await onSave({
        label:     label.trim(),
        url:       url.trim(),
        type:      effectiveType,
        scope,
        sectionId: scope === 'course' ? sectionId : null,
      });
    } catch { /* handled by caller */ }
    finally { setSaving(false); }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-3 rounded-xl p-3 space-y-2.5 animate-fade-in"
      style={{ backgroundColor: '#070b14', border: '1px solid #1a2638' }}
    >
      {/* Scope selector */}
      <div>
        <label className="label-xs">Where to save</label>
        <div className="flex gap-1.5 mt-1">
          {([
            { value: 'course' as PortalScope, icon: <BookMarked      className="w-3 h-3" />, label: 'This course' },
            { value: 'global' as PortalScope, icon: <LayoutDashboard className="w-3 h-3" />, label: 'Dashboard'   },
          ] as const).map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setScope(opt.value)}
              className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg transition-all"
              style={scope === opt.value
                ? { backgroundColor: '#f59e0b', color: '#000' }
                : { border: '1px solid #1a2638', color: '#475569' }
              }
              onMouseEnter={e => { if (scope !== opt.value) { e.currentTarget.style.borderColor = '#2a3a54'; e.currentTarget.style.color = '#94a3b8'; }}}
              onMouseLeave={e => { if (scope !== opt.value) { e.currentTarget.style.borderColor = '#1a2638'; e.currentTarget.style.color = '#475569'; }}}
            >
              {opt.icon}{opt.label}
            </button>
          ))}
        </div>
        {scope === 'global' && (
          <p className="text-[10px] mt-1.5 leading-relaxed" style={{ color: '#334155' }}>
            This link will appear in <span className="font-semibold" style={{ color: '#475569' }}>My Portals</span> on your dashboard.
          </p>
        )}
      </div>

      {/* URL */}
      <div>
        <label className="label-xs">URL or email</label>
        <div className="relative">
          <input
            ref={urlRef}
            type="text"
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder={defaultPlaceholder ?? 'https://… or name@university.edu'}
            className="input text-xs py-1.5 pr-20"
            required
          />
          {url.trim() && (
            <span className={`absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${meta.badge}`}>
              {meta.label}
            </span>
          )}
        </div>
      </div>

      {/* Label */}
      <div>
        <label className="label-xs">
          Label
          {!labelTouched && suggestedLabel && url.trim() && (
            <span className="ml-1.5 font-normal normal-case tracking-normal" style={{ color: '#334155' }}>
              auto-detected — rename freely
            </span>
          )}
        </label>
        <input
          type="text"
          value={label}
          onChange={e => { setLabel(e.target.value); setLabelTouched(true); }}
          placeholder="e.g. Calculus Moodle"
          className="input text-xs py-1.5"
          required
        />
      </div>

      <div className="flex gap-2 pt-0.5">
        <button
          type="submit"
          disabled={saving || !label.trim() || !url.trim()}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all disabled:opacity-30"
          style={{ backgroundColor: '#f59e0b', color: '#000' }}
          onMouseEnter={e => { if (!saving && label.trim() && url.trim()) e.currentTarget.style.backgroundColor = '#fbbf24'; }}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#f59e0b')}
        >
          {saving
            ? <span className="w-3 h-3 border border-black border-t-transparent rounded-full animate-spin" />
            : <Check className="w-3 h-3" />}
          Save link
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 text-xs font-medium rounded-lg transition-all"
          style={{ border: '1px solid #1a2638', color: '#475569' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#2a3a54'; e.currentTarget.style.color = '#94a3b8'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = '#1a2638'; e.currentTarget.style.color = '#475569'; }}
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
    <form
      onSubmit={handleSubmit}
      className="rounded-xl p-3 space-y-2 animate-fade-in"
      style={{ backgroundColor: '#070b14', border: '1px solid #1a2638' }}
    >
      <div className="relative">
        <input type="text" value={url} onChange={e => setUrl(e.target.value)} placeholder="URL or email" className="input text-xs py-1.5 pr-20" required />
        {url.trim() && (
          <span className={`absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${meta.badge}`}>
            {meta.label}
          </span>
        )}
      </div>
      <input type="text" value={label} onChange={e => setLabel(e.target.value)} placeholder="Label" className="input text-xs py-1.5" required />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving || !label.trim() || !url.trim()}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all disabled:opacity-30"
          style={{ backgroundColor: '#f59e0b', color: '#000' }}
          onMouseEnter={e => { if (!saving) e.currentTarget.style.backgroundColor = '#fbbf24'; }}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#f59e0b')}
        >
          {saving ? <span className="w-3 h-3 border border-black border-t-transparent rounded-full animate-spin" /> : <Check className="w-3 h-3" />}
          Update
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 text-xs font-medium rounded-lg transition-all"
          style={{ border: '1px solid #1a2638', color: '#475569' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#2a3a54'; e.currentTarget.style.color = '#94a3b8'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = '#1a2638'; e.currentTarget.style.color = '#475569'; }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ── Link row ──────────────────────────────────────────────────────────────────

function LinkRow({ link, onEdit, onDelete }: { link: CourseLink; onEdit: () => void; onDelete: () => void }) {
  const meta   = TYPE_META[link.type] ?? TYPE_META.custom;
  const rawUrl = link.url;
  const href   = rawUrl.startsWith('mailto:') ? rawUrl
    : (!rawUrl.startsWith('http') && rawUrl.includes('@')) ? `mailto:${rawUrl}` : rawUrl;
  const isEmail = href.startsWith('mailto:');

  let domain = '';
  try { domain = new URL(isEmail ? 'https://x' : rawUrl).hostname.replace(/^www\./, ''); }
  catch { domain = rawUrl.replace(/^mailto:/, '').slice(0, 24); }

  return (
    <div
      className="group flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all"
      style={{ backgroundColor: '#111d2e', border: '1px solid #1a2638' }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = '#2a3a54')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = '#1a2638')}
    >
      <span className={`flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center ${meta.iconBg}`}>
        {meta.icon}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate leading-tight" style={{ color: '#e2e8f0' }}>
          {link.label}
        </p>
        <p className="text-[10px] truncate" style={{ color: '#334155' }}>{domain}</p>
      </div>
      <a
        href={href}
        target={isEmail ? '_self' : '_blank'}
        rel="noopener noreferrer"
        onClick={e => e.stopPropagation()}
        className={`flex-shrink-0 flex items-center gap-0.5 text-xs font-bold px-2 py-1 rounded-lg transition-colors ${meta.textColor}`}
        onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#1a2638')}
        onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
      >
        Open <ExternalLink className="w-3 h-3" />
      </a>
      <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-opacity">
        <button
          onClick={onEdit}
          className="p-1 rounded transition-colors"
          style={{ color: '#334155' }}
          onMouseEnter={e => (e.currentTarget.style.color = '#94a3b8')}
          onMouseLeave={e => (e.currentTarget.style.color = '#334155')}
        >
          <Pencil className="w-3 h-3" />
        </button>
        <button
          onClick={onDelete}
          className="p-1 rounded transition-colors"
          style={{ color: '#334155' }}
          onMouseEnter={e => (e.currentTarget.style.color = '#f87171')}
          onMouseLeave={e => (e.currentTarget.style.color = '#334155')}
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

// ── Main CourseHub ────────────────────────────────────────────────────────────

interface Props { sectionId: string }

export function CourseHub({ sectionId }: Props) {
  const { links, loading, addLink, updateLink, deleteLink } = usePortalLinks('course', sectionId);

  const [editingId,     setEditingId]     = useState<string | null>(null);
  const [addState,      setAddState]      = useState<{ type: CourseLinkType; label: string; placeholder: string } | null>(null);
  const [showAddCustom, setShowAddCustom] = useState(false);

  const closeAdd = () => { setAddState(null); setShowAddCustom(false); };

  const handleAdd = async (payload: AddPortalPayload) => {
    try {
      await addLink(payload);
      if (payload.scope === 'global') {
        toast.success('Portal added to Dashboard → My Portals');
      } else {
        toast.success('Link saved to this course');
      }
      closeAdd();
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
      toast.error('Failed to update');
      throw new Error('update failed');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Remove this link?')) return;
    try { await deleteLink(id); toast.success('Link removed'); }
    catch { toast.error('Failed to remove'); }
  };

  if (loading) return null;

  const showingForm = addState !== null || showAddCustom;
  const hasLinks    = links.length > 0;

  return (
    <div
      className="rounded-2xl overflow-hidden mb-4"
      style={{
        background: 'linear-gradient(180deg, rgba(13,20,36,0.96), rgba(7,11,20,0.94))',
        border: '1px solid rgba(255,255,255,0.075)',
        boxShadow: '0 18px 58px rgba(0,0,0,0.24), inset 0 1px 0 rgba(255,255,255,0.055)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
      >
        <div className="flex items-center gap-2">
          <Link2 className="w-4 h-4" style={{ color: '#f59e0b' }} />
          <span className="text-sm font-semibold" style={{ color: '#e2e8f0' }}>Quick Links</span>
          {hasLinks && (
            <span
              className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ backgroundColor: '#111d2e', color: '#94a3b8' }}
            >
              {links.length}
            </span>
          )}
        </div>
        {!showingForm && editingId === null ? (
          <button
            onClick={() => setShowAddCustom(true)}
            className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg transition-all"
            style={{ color: '#94a3b8' }}
            onMouseEnter={e => { e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.backgroundColor = '#111d2e'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.backgroundColor = 'transparent'; }}
          >
            <Plus className="w-3 h-3" strokeWidth={2.5} />Add link
          </button>
        ) : (showingForm &&
          <button
            onClick={closeAdd}
            className="p-1 rounded-lg transition-colors"
            style={{ color: '#334155' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#94a3b8')}
            onMouseLeave={e => (e.currentTarget.style.color = '#334155')}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="p-4">
        {/* Empty state */}
        {!hasLinks && !showingForm && (
          <div>
            <p className="text-xs mb-3 leading-relaxed" style={{ color: '#64748b' }}>
              Save links for this space — Moodle, shared Drive, professor email, and more.
            </p>
            <div className="flex flex-wrap gap-2">
              {COURSE_STARTERS.map(s => {
                const m = TYPE_META[s.type];
                return (
                  <button
                    key={s.type}
                    onClick={() => setAddState({ type: s.type, label: s.label, placeholder: s.placeholder })}
                    className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all hover:shadow-sm ${m.badge}`}
                  >
                    {m.icon}+ {s.label}
                  </button>
                );
              })}
              <button
                onClick={() => setShowAddCustom(true)}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all"
                style={{ border: '1px dashed #1a2638', color: '#334155' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#2a3a54'; e.currentTarget.style.color = '#64748b'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#1a2638'; e.currentTarget.style.color = '#334155'; }}
              >
                <Globe className="w-3.5 h-3.5" />+ Custom
              </button>
            </div>
          </div>
        )}

        {/* Saved links */}
        {hasLinks && (
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
                <LinkRow
                  key={link.id}
                  link={link}
                  onEdit={() => { setEditingId(link.id); closeAdd(); }}
                  onDelete={() => handleDelete(link.id)}
                />
              )
            )}
          </div>
        )}

        {/* Starter preset form */}
        {addState !== null && (
          <SmartAddForm
            sectionId={sectionId}
            defaultType={addState.type}
            defaultLabel={addState.label}
            defaultPlaceholder={addState.placeholder}
            onSave={handleAdd}
            onCancel={closeAdd}
          />
        )}

        {/* Custom add form */}
        {showAddCustom && (
          <SmartAddForm
            sectionId={sectionId}
            onSave={handleAdd}
            onCancel={closeAdd}
          />
        )}

        {/* Add more row */}
        {hasLinks && !showingForm && editingId === null && (
          <div
            className="mt-2.5 pt-2.5 flex flex-wrap gap-1.5"
            style={{ borderTop: '1px solid #111d2e' }}
          >
            {COURSE_STARTERS
              .filter(s => !links.some(l => l.type === s.type))
              .map(s => {
                const m = TYPE_META[s.type];
                return (
                  <button
                    key={s.type}
                    onClick={() => setAddState({ type: s.type, label: s.label, placeholder: s.placeholder })}
                    className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg transition-all"
                    style={{ border: '1px solid #1a2638', color: '#475569' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#2a3a54'; e.currentTarget.style.backgroundColor = '#111d2e'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = '#1a2638'; e.currentTarget.style.backgroundColor = 'transparent'; }}
                  >
                    {m.icon}{s.label}
                  </button>
                );
              })}
            <button
              onClick={() => setShowAddCustom(true)}
              className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg transition-all"
              style={{ border: '1px dashed #1a2638', color: '#334155' }}
              onMouseEnter={e => { e.currentTarget.style.color = '#64748b'; e.currentTarget.style.borderColor = '#2a3a54'; }}
              onMouseLeave={e => { e.currentTarget.style.color = '#334155'; e.currentTarget.style.borderColor = '#1a2638'; }}
            >
              <Plus className="w-3 h-3" strokeWidth={2} />custom
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
