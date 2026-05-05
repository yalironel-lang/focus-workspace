import { useState, useRef } from 'react';
import { useSectionDetail } from '../hooks/useSections';
import { useFileUpload } from '../hooks/useFileUpload';
import { supabase } from '../lib/supabase';
import { X, Upload, Link2, FileText, CheckSquare, StickyNote, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

type ItemType = 'task' | 'file' | 'link' | 'note';

interface AddItemModalProps {
  groupId: string;
  sectionId: string;
  onClose: () => void;
  onSuccess: () => void;
  defaultType?: ItemType;
  defaultTitle?: string;
}

const TABS: { type: ItemType; label: string; icon: React.ReactNode }[] = [
  { type: 'task', label: 'Task',  icon: <CheckSquare className="w-4 h-4" /> },
  { type: 'file', label: 'PDF',   icon: <FileText    className="w-4 h-4" /> },
  { type: 'link', label: 'Link',  icon: <Link2       className="w-4 h-4" /> },
  { type: 'note', label: 'Note',  icon: <StickyNote  className="w-4 h-4" /> },
];

export function AddItemModal({ groupId, sectionId, onClose, onSuccess, defaultType, defaultTitle }: AddItemModalProps) {
  const [activeTab, setActiveTab] = useState<ItemType>(defaultType ?? 'task');
  const [title, setTitle]         = useState(defaultTitle ?? '');
  const [content, setContent]     = useState('');
  const [file, setFile]           = useState<File | null>(null);
  const [loading, setLoading]     = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { addItem } = useSectionDetail(sectionId);
  const { uploadFile } = useFileUpload();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { toast.error('Please enter a title'); return; }

    setLoading(true);
    try {
      if (activeTab === 'file') {
        if (!file) { toast.error('Please select a PDF file'); setLoading(false); return; }
        if (file.type !== 'application/pdf') { toast.error('Only PDF files are allowed'); setLoading(false); return; }

        const { data: itemData, error: itemError } = await supabase
          .from('items')
          .insert({ group_id: groupId, type: 'file', title: title.trim(), content: null, file_path: null, order_index: 0 })
          .select()
          .single();

        if (itemError || !itemData) throw itemError ?? new Error('Failed to create item');

        const filePath = await uploadFile(file, sectionId, groupId, itemData.id);

        const { error: updateError } = await supabase
          .from('items')
          .update({ file_path: filePath })
          .eq('id', itemData.id);

        if (updateError) throw updateError;
      } else {
        await addItem(groupId, activeTab, title.trim(), content.trim() || undefined, undefined);
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
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="font-semibold text-slate-900">Add item</h3>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab switcher — pill style */}
        <div className="flex gap-1.5 p-3 bg-slate-50 border-b border-slate-100">
          {TABS.map((tab) => (
            <button
              key={tab.type}
              onClick={() => setActiveTab(tab.type)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2 text-xs font-semibold rounded-lg transition-all ${
                activeTab === tab.type
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-white'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
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
              className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
              autoFocus
            />
          </div>

          {/* PDF upload */}
          {activeTab === 'file' && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                PDF File
              </label>
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center hover:border-primary-300 hover:bg-primary-50/30 transition-all cursor-pointer group"
              >
                <Upload className="w-6 h-6 text-slate-300 group-hover:text-primary-400 mx-auto mb-2 transition-colors" />
                <p className="text-sm font-medium text-slate-600">
                  {file ? file.name : 'Click to select PDF'}
                </p>
                {!file && <p className="text-xs text-slate-400 mt-1">PDF files only</p>}
                {file && <p className="text-xs text-emerald-600 mt-1 font-medium">✓ Ready to upload</p>}
              </div>
              <input ref={fileInputRef} type="file" accept=".pdf" onChange={handleFileChange} className="hidden" />
            </div>
          )}

          {/* Link URL */}
          {activeTab === 'link' && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                URL
              </label>
              <input
                type="url"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="https://"
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
              />
            </div>
          )}

          {/* Note content */}
          {activeTab === 'note' && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                Content
              </label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Write your notes…"
                rows={4}
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm resize-none bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
              />
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2.5 pt-1">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2.5 bg-slate-900 text-white rounded-xl hover:bg-slate-800 font-semibold text-sm transition-all disabled:opacity-40 flex items-center justify-center gap-2 shadow-sm active:scale-[0.99]"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add item'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 font-medium text-sm transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
