import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { CourseLink, CourseLinkType } from '../types';
import { useAuth } from './useAuth';

type NewLink = {
  label: string;
  url: string;
  type: CourseLinkType;
};

type UpdateLink = Partial<NewLink>;

/** Infer type from URL if the caller passes 'custom' */
function inferType(url: string, explicit: CourseLinkType): CourseLinkType {
  if (explicit !== 'custom') return explicit;
  const lower = url.toLowerCase();
  if (lower.startsWith('mailto:'))       return 'email';
  if (lower.includes('moodle'))          return 'moodle';
  if (lower.includes('netpa') || lower.includes('netp'))  return 'netpa';
  if (lower.includes('drive.google'))    return 'drive';
  if (lower.includes('chatgpt.com'))     return 'chatgpt';
  if (lower.includes('chat.openai.com')) return 'chatgpt';
  if (lower.includes('whatsapp.com') || lower.includes('wa.me')) return 'whatsapp';
  if (lower.includes('zoom.us'))         return 'zoom';
  if (lower.includes('teams.microsoft') || lower.includes('teams.live')) return 'teams';
  return 'custom';
}

function coerce(row: { id: string; user_id: string; section_id: string; label: string; url: string; type: string; created_at: string }): CourseLink {
  return { ...row, type: (row.type as CourseLinkType) ?? 'custom' };
}

export function useCourseLinks(sectionId: string) {
  const { user } = useAuth();
  const [links, setLinks]     = useState<CourseLink[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLinks = useCallback(async () => {
    if (!user || !sectionId) return;
    const { data, error } = await supabase
      .from('course_links')
      .select('*')
      .eq('user_id', user.id)
      .eq('section_id', sectionId)
      .order('created_at');
    if (!error) setLinks((data ?? []).map(coerce));
    setLoading(false);
  }, [user, sectionId]);

  useEffect(() => { fetchLinks(); }, [fetchLinks]);

  const addLink = async (link: NewLink) => {
    if (!user) return;
    const type = inferType(link.url, link.type);
    const { error } = await supabase
      .from('course_links')
      .insert({ user_id: user.id, section_id: sectionId, label: link.label, url: link.url, type });
    if (error) throw error;
    await fetchLinks();
  };

  const updateLink = async (id: string, patch: UpdateLink) => {
    if (!user) return;
    const type = patch.url && patch.type ? inferType(patch.url, patch.type) : patch.type;
    const { error } = await supabase
      .from('course_links')
      .update({ ...patch, ...(type ? { type } : {}) })
      .eq('id', id)
      .eq('user_id', user.id);
    if (error) throw error;
    await fetchLinks();
  };

  const deleteLink = async (id: string) => {
    if (!user) return;
    const { error } = await supabase
      .from('course_links')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);
    if (error) throw error;
    await fetchLinks();
  };

  return { links, loading, addLink, updateLink, deleteLink };
}
