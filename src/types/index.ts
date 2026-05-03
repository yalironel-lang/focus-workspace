export interface Section {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
  exam_date?: string | null;
}

export interface Group {
  id: string;
  section_id: string;
  title: string;
  order_index: number;
}

export type ItemType = 'task' | 'file' | 'link' | 'note';

export interface Item {
  id: string;
  group_id: string;
  type: ItemType;
  title: string;
  content: string | null;
  file_path: string | null;
  completed: boolean;
  order_index: number;
  created_at: string;
}

export interface SectionWithProgress extends Section {
  total_items: number;
  completed_items: number;
  progress: number;
  missing_groups: string[];
  next_item_title?: string | null;
}

export interface GroupWithItems extends Group {
  items: Item[];
}

export interface SectionDetail extends Section {
  groups: GroupWithItems[];
}
