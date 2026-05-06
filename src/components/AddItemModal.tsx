import { useState, useRef } from 'react';
import { useFileUpload } from '../hooks/useFileUpload';
import { supabase } from '../lib/supabase';
import { Item, ItemType } from '../types';
import { X, Upload, Link2, FileText, CheckSquare, StickyNote, Loader2, Check } from 'lucide-react';
import toast from 'react-hot-toast';

// NOTE: This modal intentionally does NOT call useSectionDetail.
// Previously it created its own hook instance which triggered a full section re-fetch on mount
// and again after saving — causing two extra full round-trips per add.
// Now it receives callbacks from the parent (GroupComponent → SectionPage → useSectionDetail).

interface AddItemModalProps {
  groupId: string;
  sectionId: string;
  onClose: () => void;
  onSuccess: () => void;
  defaultType?: ItemType;
  defaultTitle?: string;
  // Optimistic add (task, link, note) — returns after DB insert, updates state locally
  onAdd: (groupId: string, type: ItemType, title: string, content?: string) => Promise<void>;
  // Push a fully-constructed item into parent state (used after multi-step file upload)
  onPushItem: (item: Item) => void;
  // Full re-fetch — only called after file upload to get the final item state
  onRefresh: () => void;
}

const TABS: { type: ItemType; label: string; icon: React.ReactNode }[] = [
  { type: 'task', label: 'Task', icon: <CheckSquare className="w-4 h-4" /> },
  { type: 'file', label: 'PDF',  icon: <FileText    className="w-4 h-4" /> },
  { type: 'link', label: 'Link', icon: <Link2       className="w-4 h-4" /> },
  { type: 'note', label: 'Note', icon: <StickyNote  className="w-4 h-4" /> },
];

const inputStyle: React.CSSProperties = {
  backgroundColor: '#05070b',
  border: '1px solid #263043',
  color: '#f8fafc',
  borderRadius: '12px',
  padding: '10px 14px',
  fontSize: '14px',
  width: '100%',
  outline: 'none',
  transition: 'border-color 0.15s',
};

export function AddItemModal({
  groupId, sectionId, onClose, onSuccess,
  defaultType, defaultTitle,
  onAdd, onPushItem, onRefresh,
}: AddItemModalProps) {
  const [activeTab, setActiveTab] = useState<ItemType>(defaultType ?? 'task');
  const [title,     setTitle]     = useState(defaultTitle ?? '');
  const [content,   setContent]   = useState('');
  const [file,      setFile]      = useState<File | null>(null);
  const [loading,   setLoading]   = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { uploadFile } = useFileUpload();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { toast.error('Please enter a title'); return; }

    setLoading(true);
    try {
      if (activeTab === 'file') {
        // File upload: multi-step — create item → upload file → update item with path
        if (!file) { toast.error('Please select a PDF file'); setLoading(false); return; }
        if (file.type !== 'application/pdf') { toast.error('Only PDF files are allowed'); setLoading(false); return; }

        const { data: itemData, error: itemError } = await supabase
          .from('items')
          .insert({ group_id: groupId, type: 'file', title: title.trim(), content: null, file_path: null, order_index: 0 })
          .select()
          .single();

        if (itemError || !itemData) throw itemError ?? new Error('Failed to create item');

        const filePath = await uploadFile(file, sectionId, groupId, itemData.id);

        const { data: updatedItem, error: updateError } = await supabase
          .from('items')
          .update({ file_path: filePath })
          .eq('id', itemData.id)
          .select()
          .single();

        if (updateError) throw updateError;

        // Push the final item into parent state (no full re-fetch for 1 item)
        if (updatedItem) {
          onPushItem(updatedItem as Item);
        } else {
          // Fallback if select() returned nothing
          onRefresh();
        }
      } else {
        // Task / link / note: optimistic add via parent hook
        await onAdd(groupId, activeTab, title.trim(), content.trim() || undefined);
      }

      toast.success('Item added');
      onSuccess();
    } catch {
      toast.error('Failed to add item');
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.type !== 'application/pdf') { toast.error('Only PDF files are allowed'); return; }
    setFile(f);
    if (!title) setTitle(f.name.replace(/\.pdf$/i, ''));
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-md overflow-hidden"
        style={{
          backgroundColor: '#0d111a',
          border: '1px solid #263043',
          borderRadius: '16px',
          boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4"
             style={{ borderBottom: '1px solid #1a2230' }}>
          <h3 className="font-semibold text-sm" style={{ color: '#f8fafc' }}>Add item</h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: '#4b5563' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#94a3b8')}
            onMouseLeave={e => (e.currentTarget.style.color = '#4b5563')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex gap-1.5 p-3" style={{ borderBottom: '1px solid #1a2230', backgroundColor: '#080b12' }}>
          {TABS.map((tab) => (
            <button
              key={tab.type}
              onClick={() => setActiveTab(tab.type)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 px-2 text-xs font-semibold rounded-lg transition-all"
              style={activeTab === tab.type
                ? { backgroundColor: '#f59e0b', color: '#000' }
                : { color: '#4b5563', backgroundColor: 'transparent' }}
              onMouseEnter={e => { if (activeTab !== tab.type) e.currentTarget.style.color = '#94a3b8'; }}
              onMouseLeave={e => { if (activeTab !== tab.type) e.currentTarget.style.color = '#4b5563'; }}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest mb-1.5"
                   style={{ color: '#374151' }}>
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={
                activeTab === 'task' ? 'e.g. Read chapter 3' :
                activeTab === 'file' ? 'Document name' :
                activeTab === 'link' ? 'Link title' : 'Note title'
              }
              style={inputStyle}
              onFocus={e => (e.currentTarget.style.borderColor = '#f59e0b')}
              onBlur={e => (e.currentTarget.style.borderColor = '#263043')}
              autoFocus
            />
          </div>

          {/* PDF upload */}
          {activeTab === 'file' && (
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest mb-1.5"
                     style={{ color: '#374151' }}>
                PDF File
              </label>
              <div
                onClick={() => fileInputRef.current?.click()}
                className="rounded-xl p-6 text-center cursor-pointer transition-all"
                style={{ border: '2px dashed #263043' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = '#f59e0b')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = '#263043')}
              >
                <Upload className="w-6 h-6 mx-auto mb-2" style={{ color: '#374151' }} />
                <p className="text-sm font-medium" style={{ color: file ? '#f8fafc' : '#94a3b8' }}>
                  {file ? file.name : 'Click to select PDF'}
                </p>
                {!file && <p className="text-xs mt-1" style={{ color: '#374151' }}>PDF files only</p>}
                {file && <p className="text-xs mt-1 font-medium" style={{ color: '#10b981' }}>✓ Ready to upload</p>}
              </div>
              <input ref={fileInputRef} type="file" accept=".pdf" onChange={handleFileChange} className="hidden" />
            </div>
          )}

          {/* Link URL */}
          {activeTab === 'link' && (
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest mb-1.5"
                     style={{ color: '#374151' }}>
                URL
              </label>
              <input
                type="url"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="https://"
                style={inputStyle}
                onFocus={e => (e.currentTarget.style.borderColor = '#f59e0b')}
                onBlur={e => (e.currentTarget.style.borderColor = '#263043')}
              />
            </div>
          )}

          {/* Note content */}
          {activeTab === 'note' && (
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest mb-1.5"
                     style={{ color: '#374151' }}>
                Content
              </label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Write your notes…"
                rows={4}
                style={{ ...inputStyle, resize: 'none', minHeight: '100px' }}
                onFocus={e => (e.currentTarget.style.borderColor = '#f59e0b')}
                onBlur={e => (e.currentTarget.style.borderColor = '#263043')}
              />
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2.5 pt-1">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2.5 rounded-xl font-bold text-sm transition-all disabled:opacity-40 flex items-center justify-center gap-2"
              style={{ backgroundColor: '#f59e0b', color: '#000' }}
              onMouseEnter={e => { if (!loading) e.currentTarget.style.backgroundColor = '#fbbf24'; }}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#f59e0b')}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4" /> Add item</>}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl font-medium text-sm transition-colors"
              style={{ border: '1px solid #263043', color: '#94a3b8' }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#111827')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
