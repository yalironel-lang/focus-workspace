import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { ScheduleBlock, BlockColor } from '../types';
import { useAuth } from './useAuth';

type NewBlock = Omit<ScheduleBlock, 'id' | 'user_id' | 'created_at'>;

export function useSchedule() {
  const { user } = useAuth();
  const [blocks, setBlocks]   = useState<ScheduleBlock[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchBlocks = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('schedule_blocks')
      .select('*')
      .eq('user_id', user.id)
      .order('day_of_week')
      .order('start_time');
    if (!error) setBlocks((data ?? []).map(coerce));
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchBlocks(); }, [fetchBlocks]);

  const addBlock = async (block: NewBlock) => {
    if (!user) return;
    const { error } = await supabase
      .from('schedule_blocks')
      .insert({ ...block, user_id: user.id });
    if (error) throw error;
    await fetchBlocks();
  };

  const deleteBlock = async (id: string) => {
    const { error } = await supabase
      .from('schedule_blocks')
      .delete()
      .eq('id', id);
    if (error) throw error;
    await fetchBlocks();
  };

  return { blocks, loading, fetchBlocks, addBlock, deleteBlock };
}

// Supabase returns time as "HH:MM:SS" — trim to "HH:MM"; color stored as string → cast to BlockColor
type RawBlock = Omit<ScheduleBlock, 'color'> & { color: string };

function coerce(row: RawBlock): ScheduleBlock {
  return {
    ...row,
    start_time: row.start_time.slice(0, 5),
    end_time:   row.end_time.slice(0, 5),
    color:      (row.color as BlockColor) ?? 'indigo',
  };
}
