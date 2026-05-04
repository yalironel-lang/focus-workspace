import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Deadline, DeadlineType } from '../types';
import { useAuth } from './useAuth';

type NewDeadline = {
  section_id: string | null;
  title: string;
  type: DeadlineType;
  due_date: string;
  notes: string | null;
};

export function useDeadlines(sectionId?: string) {
  const { user } = useAuth();
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [loading, setLoading]     = useState(true);

  const fetchDeadlines = useCallback(async () => {
    if (!user) return;
    let query = supabase
      .from('deadlines')
      .select('*')
      .eq('user_id', user.id)
      .order('due_date');
    if (sectionId) query = query.eq('section_id', sectionId);
    const { data, error } = await query;
    if (!error) setDeadlines(data ?? []);
    setLoading(false);
  }, [user, sectionId]);

  useEffect(() => { fetchDeadlines(); }, [fetchDeadlines]);

  const addDeadline = async (d: NewDeadline) => {
    if (!user) return;
    const { error } = await supabase
      .from('deadlines')
      .insert({ ...d, user_id: user.id, completed: false });
    if (error) throw error;
    await fetchDeadlines();
  };

  const toggleDeadline = async (id: string, completed: boolean) => {
    const { error } = await supabase
      .from('deadlines')
      .update({ completed })
      .eq('id', id);
    if (error) throw error;
    await fetchDeadlines();
  };

  const deleteDeadline = async (id: string) => {
    const { error } = await supabase
      .from('deadlines')
      .delete()
      .eq('id', id);
    if (error) throw error;
    await fetchDeadlines();
  };

  return { deadlines, loading, fetchDeadlines, addDeadline, toggleDeadline, deleteDeadline };
}
