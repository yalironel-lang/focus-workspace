import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Database } from '../lib/database.types';

type Section = Database['public']['Tables']['sections']['Row'];
type Group = Database['public']['Tables']['groups']['Row'];
type Item = Database['public']['Tables']['items']['Row'];
type ItemType = Item['type'];

type GroupWithItems = Group & {
  items: Item[];
};

type SectionDetail = Section & {
  groups: GroupWithItems[];
};
import toast from 'react-hot-toast';

export function useSectionDetail(sectionId: string | undefined, userId: string | undefined) {
  const [section, setSection] = useState<SectionDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSection = useCallback(async () => {
    if (!sectionId || !userId) return;
    setLoading(true);

    // Fetch section
    const { data: sectionData, error: sectionError } = await supabase
      .from('sections')
      .select('*')
      .eq('id', sectionId)
      .eq('user_id', userId)
      .single();

    if (sectionError || !sectionData) {
      toast.error('Section not found');
      setLoading(false);
      return;
    }

    // Fetch groups
    const { data: groupsData, error: groupsError } = await supabase
      .from('groups')
      .select('*')
      .eq('section_id', sectionId)
      .order('order_index', { ascending: true });

    if (groupsError) {
      toast.error('Failed to load groups');
      setLoading(false);
      return;
    }

    // Fetch items
    const groupIds = groupsData.map((g) => g.id);
    const { data: itemsData, error: itemsError } = await supabase
      .from('items')
      .select('*')
      .in('group_id', groupIds)
      .order('order_index', { ascending: true });

    if (itemsError) {
      toast.error('Failed to load items');
      setLoading(false);
      return;
    }

    const groupsWithItems: GroupWithItems[] = groupsData.map((group) => ({
      ...group,
      items: itemsData.filter((item) => item.group_id === group.id),
    }));

    setSection({
      ...sectionData,
      groups: groupsWithItems,
    });
    setLoading(false);
  }, [sectionId, userId]);

  useEffect(() => {
    fetchSection();
  }, [fetchSection]);

  const addItem = useCallback(async (
    groupId: string,
    type: ItemType,
    title: string,
    content: string | null,
    filePath: string | null
  ): Promise<Item | null> => {
    if (!sectionId) return null;

    const group = section?.groups.find((g) => g.id === groupId);
    if (!group) return null;

    const maxOrder = group.items.length > 0
      ? Math.max(...group.items.map((i) => i.order_index))
      : -1;

    const { data, error } = await supabase
      .from('items')
      .insert({
        group_id: groupId,
        type,
        title,
        content,
        file_path: filePath,
        completed: type === 'task' ? false : true,
        order_index: maxOrder + 1,
      })
      .select()
      .single();

    if (error) {
      toast.error('Failed to add item');
      return null;
    }

    await fetchSection();
    return data;
  }, [sectionId, section, fetchSection]);

  const toggleTask = useCallback(async (itemId: string, completed: boolean) => {
    const { error } = await supabase
      .from('items')
      .update({ completed })
      .eq('id', itemId);

    if (error) {
      toast.error('Failed to update task');
      return;
    }

    await fetchSection();
  }, [fetchSection]);

  const deleteItem = useCallback(async (itemId: string, filePath: string | null) => {
    // Delete file from storage if exists
    if (filePath) {
      const { error: storageError } = await supabase.storage
        .from('pdfs')
        .remove([filePath]);

      if (storageError) {
        toast.error('Failed to delete file from storage');
      }
    }

    const { error } = await supabase
      .from('items')
      .delete()
      .eq('id', itemId);

    if (error) {
      toast.error('Failed to delete item');
      return;
    }

    await fetchSection();
  }, [fetchSection]);

  const uploadFile = useCallback(async (
    file: File,
    sectionId: string,
    groupId: string,
    itemId: string
  ): Promise<string | null> => {
    if (!userId) return null;

    const filePath = `${userId}/${sectionId}/${groupId}/${itemId}.pdf`;

    const { error } = await supabase.storage
      .from('pdfs')
      .upload(filePath, file, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (error) {
      toast.error('Failed to upload file');
      return null;
    }

    return filePath;
  }, [userId]);

  const getFileUrl = useCallback(async (filePath: string): Promise<string | null> => {
    const { data, error } = await supabase.storage
      .from('pdfs')
      .createSignedUrl(filePath, 3600); // 1 hour

    if (error) {
      toast.error('Failed to generate file URL');
      return null;
    }

    return data.signedUrl;
  }, []);

  const getContinueTarget = useCallback((): { type: string; url?: string; title: string } | null => {
    if (!section) return null;

    // 1. Find first incomplete task
    for (const group of section.groups) {
      for (const item of group.items) {
        if (item.type === 'task' && !item.completed) {
          return { type: 'task', title: item.title };
        }
      }
    }

    // 2. Find next file or link in order
    for (const group of section.groups) {
      for (const item of group.items) {
        if (item.type === 'file' && item.file_path) {
          return { type: 'file', url: item.file_path, title: item.title };
        }
        if (item.type === 'link' && item.content) {
          return { type: 'link', url: item.content, title: item.title };
        }
      }
    }

    // 3. All caught up
    return null;
  }, [section]);

  return {
    section,
    loading,
    addItem,
    toggleTask,
    deleteItem,
    uploadFile,
    getFileUrl,
    getContinueTarget,
    refresh: fetchSection,
  };
}
