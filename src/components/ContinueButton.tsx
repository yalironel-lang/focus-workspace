import { SectionDetail, Item } from '../types';
import { Play, CheckCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';

interface ContinueButtonProps {
  section: SectionDetail;
}

export function ContinueButton({ section }: ContinueButtonProps) {

  const findNextItem = (): { item: Item; groupId: string } | null => {
    const groupOrder = ['Exams', 'Exercises', 'Slides', 'Notes'];
    const sortedGroups = [...section.groups].sort((a, b) => {
      const aIndex = groupOrder.indexOf(a.title);
      const bIndex = groupOrder.indexOf(b.title);
      if (aIndex === -1 && bIndex === -1) return a.order_index - b.order_index;
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });

    for (const group of sortedGroups) {
      const tasks = group.items.filter(i => i.type === 'task' && !i.completed);
      if (tasks.length > 0) return { item: tasks[0], groupId: group.id };
    }
    for (const group of sortedGroups) {
      const filesAndLinks = group.items.filter(i => i.type === 'file' || i.type === 'link');
      if (filesAndLinks.length > 0) return { item: filesAndLinks[0], groupId: group.id };
    }
    for (const group of sortedGroups) {
      const notes = group.items.filter(i => i.type === 'note');
      if (notes.length > 0) return { item: notes[0], groupId: group.id };
    }
    return null;
  };

  const handleContinue = async () => {
    const next = findNextItem();

    if (!next) {
      toast.success("You're all caught up!", { icon: '✅' });
      return;
    }

    const { item } = next;

    if (item.type === 'task' || item.type === 'note') {
      const el = document.getElementById(`item-${item.id}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.style.outline = '2px solid #f59e0b';
        el.style.outlineOffset = '2px';
        el.style.borderRadius = '12px';
        setTimeout(() => { el.style.outline = ''; el.style.outlineOffset = ''; }, 2000);
      }
    } else if (item.type === 'file' && item.file_path) {
      try {
        const path = item.file_path.replace(/^\/+/, '');
        const { data, error } = await supabase.storage.from('pdfs').createSignedUrl(path, 3600);
        if (error) { toast.error(`Could not open file: ${error.message}`); return; }
        if (!data?.signedUrl) { toast.error('No signed URL returned'); return; }
        window.open(data.signedUrl, '_blank');
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to open file');
      }
    } else if (item.type === 'link' && item.content) {
      window.open(item.content, '_blank');
    }
  };

  const isAllCaughtUp = !findNextItem();

  return (
    <button
      onClick={handleContinue}
      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm transition-all"
      style={isAllCaughtUp ? {
        backgroundColor: 'rgba(16,185,129,0.1)',
        color: '#10b981',
        border: '1px solid rgba(16,185,129,0.2)',
        cursor: 'default',
      } : {
        backgroundColor: '#f59e0b',
        color: '#000',
      }}
      onMouseEnter={e => { if (!isAllCaughtUp) e.currentTarget.style.backgroundColor = '#fbbf24'; }}
      onMouseLeave={e => { if (!isAllCaughtUp) e.currentTarget.style.backgroundColor = '#f59e0b'; }}
    >
      {isAllCaughtUp ? (
        <>
          <CheckCircle className="w-4 h-4" />
          All caught up
        </>
      ) : (
        <>
          <Play className="w-4 h-4" fill="currentColor" />
          Continue
        </>
      )}
    </button>
  );
}
