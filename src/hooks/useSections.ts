import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { SectionWithProgress, SectionDetail, GroupWithItems } from '../types';
import { useAuth } from './useAuth';

const DEFAULT_GROUPS = ['Slides', 'Exercises', 'Exams', 'Notes', 'Links'];

type RawGroup = { title: string; items?: Array<{ completed: boolean; title: string }> };

function findNextItemTitle(groups: RawGroup[]): string | null {
  const PRIORITY = ['Exercises', 'Exams', 'Slides'];
  for (const gName of PRIORITY) {
    const g = groups.find(x => x.title === gName);
    const pending = (g?.items ?? []).filter(i => !i.completed);
    if (pending.length > 0) return pending[0].title;
  }
  for (const g of groups) {
    const pending = (g.items ?? []).filter(i => !i.completed);
    if (pending.length > 0) return pending[0].title;
  }
  return null;
}

// Insert any groups from DEFAULT_GROUPS that are not yet in the given section.
async function ensureDefaultGroups(sectionId: string, existingTitles: string[]) {
  const missing = DEFAULT_GROUPS.filter((g) => !existingTitles.includes(g));
  for (let i = 0; i < missing.length; i++) {
    const orderIndex = DEFAULT_GROUPS.indexOf(missing[i]);
    const { error } = await supabase.from('groups').insert({
      section_id: sectionId,
      title: missing[i],
      order_index: orderIndex,
    });
    if (error) throw error;
  }
  return missing.length > 0;
}

export function useSections() {
  const { user } = useAuth();
  const [sections, setSections] = useState<SectionWithProgress[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSections = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const { data: sectionsData, error: sectionsError } = await supabase
      .from('sections')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (sectionsError) {
      console.error('Error fetching sections:', sectionsError);
      setLoading(false);
      return;
    }

    const sectionsWithProgress: SectionWithProgress[] = [];

    for (const section of sectionsData || []) {
      const { data: groupsData } = await supabase
        .from('groups')
        .select('*, items(*)')
        .eq('section_id', section.id)
        .order('order_index');

      const groups = groupsData || [];
      const allItems = groups.flatMap((g) => g.items || []);
      const totalItems = allItems.length;
      const completedItems = allItems.filter((i) => i.completed).length;
      const progress = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

      const existingGroupTitles = groups.map((g) => g.title);
      const missingGroups = DEFAULT_GROUPS.filter((g) => !existingGroupTitles.includes(g));

      sectionsWithProgress.push({
        ...section,
        total_items: totalItems,
        completed_items: completedItems,
        progress,
        missing_groups: missingGroups,
        next_item_title: findNextItemTitle(groups),
      });
    }

    setSections(sectionsWithProgress);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchSections();
  }, [fetchSections]);

  const createSection = async (title: string) => {
    if (!user) return;

    const { data: section, error } = await supabase
      .from('sections')
      .insert({ user_id: user.id, title })
      .select()
      .single();

    if (error) throw error;

    await ensureDefaultGroups(section.id, []);
    await fetchSections();
    return section;
  };

  const deleteSection = async (id: string) => {
    const { error } = await supabase.from('sections').delete().eq('id', id);
    if (error) throw error;
    await fetchSections();
  };

  return { sections, loading, fetchSections, createSection, deleteSection };
}

export function useSectionDetail(sectionId: string | undefined) {
  const { user } = useAuth();
  const [section, setSection] = useState<SectionDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSection = useCallback(async () => {
    if (!user || !sectionId) return;
    setLoading(true);

    const { data: sectionData, error: sectionError } = await supabase
      .from('sections')
      .select('*')
      .eq('id', sectionId)
      .single();

    if (sectionError || !sectionData) {
      setLoading(false);
      return;
    }

    let { data: groupsData } = await supabase
      .from('groups')
      .select('*')
      .eq('section_id', sectionId)
      .order('order_index');

    // Backfill any missing default groups (handles existing sections too)
    const existingTitles = (groupsData || []).map((g) => g.title);
    const hadMissing = await ensureDefaultGroups(sectionId, existingTitles);
    if (hadMissing) {
      const { data: refetched } = await supabase
        .from('groups')
        .select('*')
        .eq('section_id', sectionId)
        .order('order_index');
      groupsData = refetched;
    }

    const groups: GroupWithItems[] = [];

    for (const group of groupsData || []) {
      const { data: itemsData } = await supabase
        .from('items')
        .select('*')
        .eq('group_id', group.id)
        .order('order_index');

      groups.push({
        ...group,
        items: itemsData || [],
      });
    }

    setSection({
      ...sectionData,
      groups,
    });
    setLoading(false);
  }, [user, sectionId]);

  useEffect(() => {
    fetchSection();
  }, [fetchSection]);

  const addItem = async (
    groupId: string,
    type: 'task' | 'file' | 'link' | 'note',
    title: string,
    content?: string,
    filePath?: string,
  ) => {
    const { data: existingItems } = await supabase
      .from('items')
      .select('order_index')
      .eq('group_id', groupId)
      .order('order_index', { ascending: false })
      .limit(1);

    const nextOrder = (existingItems?.[0]?.order_index ?? -1) + 1;

    const { error } = await supabase.from('items').insert({
      group_id: groupId,
      type,
      title,
      content: content || null,
      file_path: filePath || null,
      order_index: nextOrder,
    });

    if (error) throw error;
    await fetchSection();
  };

  const updateItem = async (
    itemId: string,
    updates: Partial<{ title: string; content: string; completed: boolean }>,
  ) => {
    const { error } = await supabase.from('items').update(updates).eq('id', itemId);
    if (error) throw error;
    await fetchSection();
  };

  const deleteItem = async (itemId: string) => {
    const { error } = await supabase.from('items').delete().eq('id', itemId);
    if (error) throw error;
    await fetchSection();
  };

  const toggleTask = async (itemId: string, completed: boolean) => {
    const { error } = await supabase.from('items').update({ completed }).eq('id', itemId);
    if (error) throw error;
    await fetchSection();
  };

  const setExamDate = async (date: string | null) => {
    if (!sectionId) return;
    const { error } = await supabase
      .from('sections')
      .update({ exam_date: date || null })
      .eq('id', sectionId);
    if (error) throw error;
    await fetchSection();
  };

  // Add a new custom group to this section
  const addGroup = async (title: string) => {
    if (!sectionId) return;
    const maxOrder = section
      ? section.groups.reduce((m, g) => Math.max(m, g.order_index), -1)
      : -1;
    const { error } = await supabase
      .from('groups')
      .insert({ section_id: sectionId, title: title.trim(), order_index: maxOrder + 1 });
    if (error) throw error;
    await fetchSection();
  };

  return { section, loading, fetchSection, addItem, updateItem, deleteItem, toggleTask, addGroup, setExamDate };
}
