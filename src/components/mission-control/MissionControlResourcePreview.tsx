import { FileText, BookOpen, Table2, Image as ImageIcon, Link2, File } from 'lucide-react';
import type { MissionControlCategory, MissionControlItem, MissionControlPreview } from '../../lib/missionControl/types';

const CAT_CLASS: Record<MissionControlCategory, string> = {
  pdf: 'mc-cat-pdf',
  notebook: 'mc-cat-notebook',
  sheet: 'mc-cat-sheet',
  image: 'mc-cat-image',
  link: 'mc-cat-link',
  other: 'mc-cat-other',
};

function Glyph({ category }: { category: MissionControlCategory }) {
  const cls = CAT_CLASS[category];
  const props = { className: `w-5 h-5 ${cls}`, 'aria-hidden': true as const };
  switch (category) {
    case 'pdf':
      return <FileText {...props} />;
    case 'notebook':
      return <BookOpen {...props} />;
    case 'sheet':
      return <Table2 {...props} />;
    case 'image':
      return <ImageIcon {...props} />;
    case 'link':
      return <Link2 {...props} />;
    default:
      return <File {...props} />;
  }
}

export function MissionControlResourcePreview({ item }: { item: MissionControlItem }) {
  const preview: MissionControlPreview = item.preview;
  if (preview.kind === 'thumbnail' && preview.dataUrl) {
    return (
      <div className="mc-row-preview">
        <img src={preview.dataUrl} alt="" loading="lazy" />
      </div>
    );
  }
  if (preview.kind === 'favicon' && preview.url) {
    return (
      <div className="mc-row-preview">
        <img src={preview.url} alt="" loading="lazy" />
      </div>
    );
  }
  return (
    <div className="mc-row-preview">
      <Glyph category={item.category} />
    </div>
  );
}

export function contextLabelForItem(item: MissionControlItem): string {
  if (item.source === 'shelf-item') return 'Shelf';
  if (item.source === 'course-link') return 'Links';
  if (item.boardId && item.boardId !== 'main') return `Workspace · ${item.boardId}`;
  return 'Workspace';
}
