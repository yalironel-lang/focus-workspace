import { useState, useEffect, useCallback, useRef } from 'react';
import { classifyNetworkFailure, classifySupabaseError } from '../lib/networkError';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { SectionWithProgress, SectionDetail, GroupWithItems, Item } from '../types';
import { useAuth } from './useAuth';
import { pulsePerformancePressure } from '../lib/performanceSafeMode';
import { clearFreeSpacePersistenceForSection } from '../lib/freeSpacePersistence';
import {
  readLibrarySectionsSnapshot,
  readSectionDetailSnapshot,
  writeLibraryFetchSnapshots,
  writeSectionDetailSnapshot,
} from '../lib/focusCache/sectionSnapshots';

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

// ── useSections (dashboard list) ──────────────────────────────────────────────

export function useSections() {
  const { user } = useAuth();
  const [sections, setSections] = useState<SectionWithProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** True when UI is showing last-known cache (offline/stale) rather than fresh network. */
  const [fromCache, setFromCache] = useState(false);
  const retryOnReconnectRef = useRef(false);
  const sectionsRef = useRef<SectionWithProgress[]>([]);
  sectionsRef.current = sections;

  const fetchSections = useCallback(async () => {
    if (!user) {
      setSections([]);
      setLoading(false);
      setError(null);
      setFromCache(false);
      retryOnReconnectRef.current = false;
      return;
    }
    if (!isSupabaseConfigured) {
      setSections([]);
      setError('This deployment is missing database configuration.');
      setFromCache(false);
      setLoading(false);
      return;
    }

    const userId = user.id;
    let hadCache = sectionsRef.current.length > 0;

    // Read-first: hydrate last-known snapshot before network (cold offline).
    if (!hadCache) {
      setLoading(true);
      setError(null);
      try {
        const cached = await readLibrarySectionsSnapshot(userId);
        if (cached && cached.length > 0) {
          setSections(cached);
          sectionsRef.current = cached;
          setFromCache(true);
          hadCache = true;
          setLoading(false);
        }
      } catch {
        /* ignore cache read errors; fall through to network */
      }
    } else {
      setError(null);
    }

    if (!hadCache) setLoading(true);

    try {
      const { data: sectionsData, error: sectionsError } = await supabase
        .from('sections')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (sectionsError) {
        if (hadCache || sectionsRef.current.length > 0) {
          // CACHE_PRESENT + FETCH_FAIL: keep list; no fatal Library error card.
          setError(null);
          setFromCache(true);
          retryOnReconnectRef.current = true;
          setLoading(false);
          return;
        }
        setSections([]);
        setFromCache(false);
        setError(classifySupabaseError(sectionsError.message, 'Could not load workspaces'));
        retryOnReconnectRef.current = true;
        setLoading(false);
        return;
      }

      const sectionsWithProgress: SectionWithProgress[] = [];
      const sectionDetails: SectionDetail[] = [];

      for (const section of sectionsData || []) {
        const { data: groupsData, error: groupsError } = await supabase
          .from('groups')
          .select('*, items(*)')
          .eq('section_id', section.id)
          .order('order_index');

        if (groupsError) {
          // Partial fetch — do not wipe a good cache / in-progress list.
          if (hadCache || sectionsRef.current.length > 0) {
            setError(null);
            setFromCache(true);
            retryOnReconnectRef.current = true;
            setLoading(false);
            return;
          }
          setSections(sectionsWithProgress);
          setFromCache(false);
          setError(classifySupabaseError(groupsError.message, 'Could not load workspace details'));
          retryOnReconnectRef.current = true;
          setLoading(false);
          return;
        }

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

        // Same groups payload → enough SectionDetail to open offline (no extra requests).
        const detailGroups: GroupWithItems[] = groups.map((group) => ({
          ...group,
          items: (group.items || []) as Item[],
        }));
        sectionDetails.push({ ...section, groups: detailGroups });
      }

      setSections(sectionsWithProgress);
      sectionsRef.current = sectionsWithProgress;
      setFromCache(false);
      setError(null);
      retryOnReconnectRef.current = false;
      setLoading(false);
      void writeLibraryFetchSnapshots(userId, sectionsWithProgress, sectionDetails);
    } catch (err) {
      if (hadCache || sectionsRef.current.length > 0) {
        setError(null);
        setFromCache(true);
        retryOnReconnectRef.current = true;
        setLoading(false);
        return;
      }
      setSections([]);
      setFromCache(false);
      setError(classifyNetworkFailure(err, 'Could not load workspaces'));
      retryOnReconnectRef.current = true;
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { fetchSections(); }, [fetchSections]);

  useEffect(() => {
    const onOnline = () => {
      if (!retryOnReconnectRef.current || !user) return;
      retryOnReconnectRef.current = false;
      void fetchSections();
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [fetchSections, user]);

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
    if (!user) throw new Error('Not signed in');
    const { error } = await supabase.from('sections').delete().eq('id', id).eq('user_id', user.id);
    if (error) throw error;
    clearFreeSpacePersistenceForSection(id);
    await fetchSections();
  };

  return { sections, loading, error, fromCache, fetchSections, createSection, deleteSection };
}

// ── useSectionDetail (workspace page) ────────────────────────────────────────
//
// PERFORMANCE DESIGN:
// - fetchSection is called only on mount and for rare operations (addGroup, setExamDate, file upload)
// - toggleTask, deleteItem, updateItem, updateGroup, deleteGroup, addItem → all OPTIMISTIC
//   (state updated immediately from local data; no full re-fetch)
// - ensureDefaultGroups runs only once per sectionId (tracked via ref)

export function useSectionDetail(sectionId: string | undefined) {
  const { user } = useAuth();
  const [section, setSection] = useState<SectionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  // Track which sectionId we have already run ensureDefaultGroups for
  const ensuredRef = useRef<string | null>(null);
  const requestSeqRef = useRef(0);
  const sectionRef = useRef<SectionDetail | null>(null);
  sectionRef.current = section;

  useEffect(() => {
    ensuredRef.current = null;
    setSection(null);
    sectionRef.current = null;
    setNotFound(false);
    setFetchError(null);
    setFromCache(false);
    setLoading(!!user && !!sectionId);
    pulsePerformancePressure('section-navigate');
  }, [user, sectionId]);

  const fetchSection = useCallback(async () => {
    if (!user || !sectionId) {
      setSection(null);
      setNotFound(false);
      setFetchError(null);
      setFromCache(false);
      setLoading(false);
      return;
    }
    const requestId = ++requestSeqRef.current;
    const isStale = () => requestSeqRef.current !== requestId;
    const userId = user.id;

    if (!isSupabaseConfigured) {
      setSection(null);
      setFetchError('This deployment is missing database configuration.');
      setFromCache(false);
      setLoading(false);
      return;
    }

    // Read-first cache hydrate (cold offline section entry).
    let hadCache = !!sectionRef.current && sectionRef.current.id === sectionId;
    if (!hadCache) {
      if (!sectionRef.current) setLoading(true);
      setNotFound(false);
      setFetchError(null);
      try {
        const cached = await readSectionDetailSnapshot(userId, sectionId);
        if (isStale()) return;
        if (cached) {
          setSection(cached);
          sectionRef.current = cached;
          setFromCache(true);
          hadCache = true;
          setLoading(false);
        }
      } catch {
        /* ignore */
      }
    } else {
      setFetchError(null);
    }

    if (!sectionRef.current) setLoading(true);
    setNotFound(false);

    try {
      const { data: sectionData, error: sectionError } = await supabase
        .from('sections')
        .select('*')
        .eq('id', sectionId)
        .eq('user_id', userId)
        .maybeSingle();

      if (isStale()) return;
      if (sectionError) {
        if (hadCache || sectionRef.current) {
          // CACHE_PRESENT + FETCH_FAIL: keep hydrated section; no fatal gate.
          setFetchError(null);
          setFromCache(true);
          setLoading(false);
          return;
        }
        setSection(null);
        setFromCache(false);
        setFetchError(classifySupabaseError(sectionError.message, 'Could not load workspace'));
        setNotFound(false);
        setLoading(false);
        return;
      }
      if (!sectionData) {
        // Authoritative online miss — only clear after successful empty response.
        setSection(null);
        sectionRef.current = null;
        setFromCache(false);
        setNotFound(true);
        setFetchError(null);
        setLoading(false);
        return;
      }

      const { data: groupsInitial, error: groupsError } = await supabase
        .from('groups')
        .select('*')
        .eq('section_id', sectionId)
        .order('order_index');

      if (isStale()) return;
      if (groupsError) {
        if (hadCache || sectionRef.current) {
          setFetchError(null);
          setFromCache(true);
          setLoading(false);
          return;
        }
        setSection(null);
        setFromCache(false);
        setFetchError(classifySupabaseError(groupsError.message, 'Could not load workspace'));
        setLoading(false);
        return;
      }

      let groupsData = groupsInitial;

      // Only run ensureDefaultGroups once per sectionId across the lifetime of this hook
      if (ensuredRef.current !== sectionId) {
        ensuredRef.current = sectionId;
        const existingTitles = (groupsData || []).map((g) => g.title);
        const hadMissing = await ensureDefaultGroups(sectionId, existingTitles);
        if (isStale()) return;
        if (hadMissing) {
          const { data: refetched, error: refetchError } = await supabase
            .from('groups')
            .select('*')
            .eq('section_id', sectionId)
            .order('order_index');
          if (isStale()) return;
          if (refetchError) {
            if (hadCache || sectionRef.current) {
              setFetchError(null);
              setFromCache(true);
              setLoading(false);
              return;
            }
            setSection(null);
            setFromCache(false);
            setFetchError(classifySupabaseError(refetchError.message, 'Could not load workspace'));
            setLoading(false);
            return;
          }
          groupsData = refetched;
        }
      }

      const groupIds = (groupsData || []).map((g) => g.id);
      const { data: allItemsData, error: itemsError } =
        groupIds.length > 0
          ? await supabase.from('items').select('*').in('group_id', groupIds).order('order_index')
          : { data: [], error: null };
      if (isStale()) return;
      if (itemsError) {
        if (hadCache || sectionRef.current) {
          setFetchError(null);
          setFromCache(true);
          setLoading(false);
          return;
        }
        setSection(null);
        setFromCache(false);
        setFetchError(classifySupabaseError(itemsError.message, 'Could not load workspace'));
        setLoading(false);
        return;
      }

      const groups: GroupWithItems[] = (groupsData || []).map((group) => ({
        ...group,
        items: (allItemsData || []).filter((i) => i.group_id === group.id),
      }));

      if (isStale()) return;
      const next: SectionDetail = { ...sectionData, groups };
      setSection(next);
      sectionRef.current = next;
      setFromCache(false);
      setFetchError(null);
      setLoading(false);
      void writeSectionDetailSnapshot(userId, next);
    } catch (err) {
      if (isStale()) return;
      if (hadCache || sectionRef.current) {
        setFetchError(null);
        setFromCache(true);
        setLoading(false);
        return;
      }
      setSection(null);
      setFromCache(false);
      setFetchError(classifyNetworkFailure(err, 'Could not load workspace'));
      setLoading(false);
    }
  }, [user, sectionId]);

  useEffect(() => { fetchSection(); }, [fetchSection]);

  // ── Optimistic helpers ─────────────────────────────────────────────────────

  const optimisticUpdateItems = useCallback((
    updater: (prev: SectionDetail) => SectionDetail
  ) => {
    setSection(prev => prev ? updater(prev) : prev);
  }, []);

  // ── Item operations (all optimistic — no fetchSection) ─────────────────────

  const addItem = useCallback(async (
    groupId: string,
    type: 'task' | 'file' | 'link' | 'note',
    title: string,
    content?: string,
    filePath?: string,
  ) => {
    // Compute next order from current local state
    const group = section?.groups.find(g => g.id === groupId);
    const maxOrder = group && group.items.length > 0
      ? Math.max(...group.items.map(i => i.order_index))
      : -1;

    const { data: newItem, error } = await supabase
      .from('items')
      .insert({
        group_id: groupId,
        type,
        title,
        content: content || null,
        file_path: filePath || null,
        order_index: maxOrder + 1,
      })
      .select()
      .single();

    if (error) throw error;

    optimisticUpdateItems(prev => ({
      ...prev,
      groups: prev.groups.map(g =>
        g.id === groupId ? { ...g, items: [...g.items, newItem as Item] } : g
      ),
    }));
  }, [section, optimisticUpdateItems]);

  // Push a pre-built item into local state (used after file upload)
  const pushItem = useCallback((groupId: string, item: Item) => {
    optimisticUpdateItems(prev => ({
      ...prev,
      groups: prev.groups.map(g =>
        g.id === groupId ? { ...g, items: [...g.items, item] } : g
      ),
    }));
  }, [optimisticUpdateItems]);

  const updateItem = useCallback(async (
    itemId: string,
    updates: { title?: string; content?: string | null },
  ) => {
    const { error } = await supabase.from('items').update(updates).eq('id', itemId);
    if (error) throw error;

    optimisticUpdateItems(prev => ({
      ...prev,
      groups: prev.groups.map(g => ({
        ...g,
        items: g.items.map(i => i.id === itemId ? { ...i, ...updates } : i),
      })),
    }));
  }, [optimisticUpdateItems]);

  const deleteItem = useCallback(async (itemId: string) => {
    const { error } = await supabase.from('items').delete().eq('id', itemId);
    if (error) throw error;

    optimisticUpdateItems(prev => ({
      ...prev,
      groups: prev.groups.map(g => ({
        ...g,
        items: g.items.filter(i => i.id !== itemId),
      })),
    }));
  }, [optimisticUpdateItems]);

  const toggleTask = useCallback(async (itemId: string, completed: boolean) => {
    const { error } = await supabase.from('items').update({ completed }).eq('id', itemId);
    if (error) throw error;

    optimisticUpdateItems(prev => ({
      ...prev,
      groups: prev.groups.map(g => ({
        ...g,
        items: g.items.map(i => i.id === itemId ? { ...i, completed } : i),
      })),
    }));
  }, [optimisticUpdateItems]);

  // ── Group operations ────────────────────────────────────────────────────────

  const addGroup = useCallback(async (title: string): Promise<string> => {
    if (!sectionId) throw new Error('No section');
    const maxOrder = section
      ? section.groups.reduce((m, g) => Math.max(m, g.order_index), -1)
      : -1;

    const { data: newGroup, error } = await supabase
      .from('groups')
      .insert({ section_id: sectionId, title: title.trim(), order_index: maxOrder + 1 })
      .select()
      .single();

    if (error) throw error;

    optimisticUpdateItems(prev => ({
      ...prev,
      groups: [...prev.groups, { ...newGroup, items: [] }],
    }));

    return newGroup.id as string;
  }, [sectionId, section, optimisticUpdateItems]);

  const updateGroup = useCallback(async (groupId: string, title: string) => {
    const { error } = await supabase.from('groups').update({ title }).eq('id', groupId);
    if (error) throw error;

    optimisticUpdateItems(prev => ({
      ...prev,
      groups: prev.groups.map(g => g.id === groupId ? { ...g, title } : g),
    }));
  }, [optimisticUpdateItems]);

  const deleteGroup = useCallback(async (groupId: string) => {
    const { error } = await supabase.from('groups').delete().eq('id', groupId);
    if (error) throw error;

    optimisticUpdateItems(prev => ({
      ...prev,
      groups: prev.groups.filter(g => g.id !== groupId),
    }));
  }, [optimisticUpdateItems]);

  const setExamDate = useCallback(async (date: string | null) => {
    if (!sectionId) return;
    const { error } = await supabase
      .from('sections')
      .update({ exam_date: date || null })
      .eq('id', sectionId);
    if (error) throw error;
    // Exam date is section-level metadata — small refetch is acceptable
    await fetchSection();
  }, [sectionId, fetchSection]);

  const deleteSection = useCallback(async () => {
    if (!sectionId || !user) throw new Error('Not signed in');
    const { error } = await supabase
      .from('sections')
      .delete()
      .eq('id', sectionId)
      .eq('user_id', user.id);
    if (error) throw error;
    clearFreeSpacePersistenceForSection(sectionId);
    setSection(null);
    sectionRef.current = null;
    setFromCache(false);
  }, [sectionId, user]);

  return {
    section,
    loading,
    notFound,
    fetchError,
    fromCache,
    fetchSection,
    addItem,
    pushItem,
    updateItem,
    deleteItem,
    toggleTask,
    addGroup,
    updateGroup,
    deleteGroup,
    setExamDate,
    deleteSection,
  };
}
