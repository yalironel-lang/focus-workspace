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

// ── Schedule ──────────────────────────────────────────────────────────────────
// day_of_week: 0=Sun 1=Mon 2=Tue 3=Wed 4=Thu 5=Fri 6=Sat
export type BlockColor = 'indigo' | 'violet' | 'emerald' | 'amber' | 'sky' | 'rose' | 'slate';

export interface ScheduleBlock {
  id: string;
  user_id: string;
  section_id: string | null;
  title: string;
  day_of_week: number;
  start_time: string; // "HH:MM"
  end_time: string;   // "HH:MM"
  location: string | null;
  link: string | null;
  color: BlockColor;
  created_at: string;
}

// ── Course Hub ────────────────────────────────────────────────────────────────
export type CourseLinkType =
  | 'moodle'
  | 'netpa'
  | 'drive'
  | 'chatgpt'
  | 'whatsapp'
  | 'email'
  | 'zoom'
  | 'teams'
  | 'custom';

export interface CourseLink {
  id: string;
  user_id: string;
  section_id: string;
  label: string;
  url: string;
  type: CourseLinkType;
  created_at: string;
}

// ── Deadlines ─────────────────────────────────────────────────────────────────
export type DeadlineType = 'assignment' | 'quiz' | 'exam' | 'project' | 'reading';

export interface Deadline {
  id: string;
  user_id: string;
  section_id: string | null;
  title: string;
  type: DeadlineType;
  due_date: string;   // "YYYY-MM-DD"
  notes: string | null;
  completed: boolean;
  created_at: string;
}
