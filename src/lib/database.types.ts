export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      sections: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          created_at: string;
          exam_date: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          created_at?: string;
          exam_date?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          created_at?: string;
          exam_date?: string | null;
        };
        Relationships: [];
      };
      groups: {
        Row: {
          id: string;
          section_id: string;
          title: string;
          order_index: number;
        };
        Insert: {
          id?: string;
          section_id: string;
          title: string;
          order_index: number;
        };
        Update: {
          id?: string;
          section_id?: string;
          title?: string;
          order_index?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'groups_section_id_fkey';
            columns: ['section_id'];
            isOneToOne: false;
            referencedRelation: 'sections';
            referencedColumns: ['id'];
          },
        ];
      };
      items: {
        Row: {
          id: string;
          group_id: string;
          type: 'task' | 'file' | 'link' | 'note';
          title: string;
          content: string | null;
          file_path: string | null;
          completed: boolean;
          order_index: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          group_id: string;
          type: 'task' | 'file' | 'link' | 'note';
          title: string;
          content?: string | null;
          file_path?: string | null;
          completed?: boolean;
          order_index: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          group_id?: string;
          type?: 'task' | 'file' | 'link' | 'note';
          title?: string;
          content?: string | null;
          file_path?: string | null;
          completed?: boolean;
          order_index?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'items_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'groups';
            referencedColumns: ['id'];
          },
        ];
      };
      schedule_blocks: {
        Row: {
          id: string;
          user_id: string;
          section_id: string | null;
          title: string;
          day_of_week: number;
          start_time: string;
          end_time: string;
          location: string | null;
          link: string | null;
          color: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          section_id?: string | null;
          title: string;
          day_of_week: number;
          start_time: string;
          end_time: string;
          location?: string | null;
          link?: string | null;
          color?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          section_id?: string | null;
          title?: string;
          day_of_week?: number;
          start_time?: string;
          end_time?: string;
          location?: string | null;
          link?: string | null;
          color?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      course_links: {
        Row: {
          id: string;
          user_id: string;
          section_id: string | null;
          label: string;
          url: string;
          type: string;
          scope: string;
          order_index: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          section_id?: string | null;
          label: string;
          url: string;
          type?: string;
          scope?: string;
          order_index?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          section_id?: string | null;
          label?: string;
          url?: string;
          type?: string;
          scope?: string;
          order_index?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'course_links_section_id_fkey';
            columns: ['section_id'];
            isOneToOne: false;
            referencedRelation: 'sections';
            referencedColumns: ['id'];
          },
        ];
      };
      deadlines: {
        Row: {
          id: string;
          user_id: string;
          section_id: string | null;
          title: string;
          type: 'assignment' | 'quiz' | 'exam' | 'project' | 'reading' | 'custom';
          due_date: string;
          notes: string | null;
          completed: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          section_id?: string | null;
          title: string;
          type: 'assignment' | 'quiz' | 'exam' | 'project' | 'reading' | 'custom';
          due_date: string;
          notes?: string | null;
          completed?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          section_id?: string | null;
          title?: string;
          type?: 'assignment' | 'quiz' | 'exam' | 'project' | 'reading' | 'custom';
          due_date?: string;
          notes?: string | null;
          completed?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
  };
}
