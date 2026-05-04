import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { CourseLink, CourseLinkType, PortalScope } from '../types';
import { useAuth } from './useAuth';

// ── URL auto-detection ────────────────────────────────────────────────────────

export function detectFromUrl(raw: string): { type: CourseLinkType; suggestedLabel: string } {
  const s = raw.toLowerCase().trim();
  if (s.startsWith('mailto:') || (!s.startsWith('http') && s.includes('@')))
    return { type: 'email',    suggestedLabel: 'Professor email' };
  if (s.includes('moodle'))
    return { type: 'moodle',   suggestedLabel: 'Moodle'          };
  if (s.includes('netpa') || s.includes('netp@') || s.includes('net-p'))
    return { type: 'netpa',    suggestedLabel: 'NetPA'           };
  if (s.includes('drive.google'))
    return { type: 'drive',    suggestedLabel: 'Google Drive'    };
  if (s.includes('chatgpt.com') || s.includes('chat.openai.com'))
    return { type: 'chatgpt',  suggestedLabel: 'ChatGPT'         };
  if (s.includes('whatsapp.com') || s.includes('wa.me'))
    return { type: 'whatsapp', suggestedLabel: 'WhatsApp Group'  };
  if (s.includes('zoom.us'))
    return { type: 'zoom',     suggestedLabel: 'Zoom'            };
  if (s.includes('teams.microsoft') || s.includes('teams.live'))
    return { type: 'teams',    suggestedLabel: 'Teams'           };
  if (s.includes('github.com'))
    return { type: 'github',   suggestedLabel: 'GitHub'          };
  return   { type: 'custom',   suggestedLabel: ''                };
}

// Plain email → mailto:
function normalizeUrl(raw: string): string {
  const t = raw.trim();
  if (!t.startsWith('http') && !t.startsWith('mailto:') && t.includes('@'))
    return `mailto:${t}`;
  return t;
}

// Raw DB row → CourseLink (type & scope are strings in the DB)
type RawRow = {
  id: string; user_id: string; section_id: string | null;
  label: string; url: string; type: string;
  scope: string; order_index: number; created_at: string;
};

function coerce(row: RawRow): CourseLink {
  return {
    ...row,
    type:  (row.type  as CourseLinkType) ?? 'custom',
    scope: (row.scope as PortalScope)    ?? 'course',
  };
}

// ── Payload types ─────────────────────────────────────────────────────────────

export type AddPortalPayload = {
  label: string;
  url: string;
  type: CourseLinkType;
  scope: PortalScope;
  sectionId?: string | null;
};

export type UpdatePortalPayload = Partial<Pick<AddPortalPayload, 'label' | 'url' | 'type'>>;

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * usePortalLinks('global')              — fetches dashboard portals
 * usePortalLinks('course', sectionId)   — fetches course-scoped links
 */
export function usePortalLinks(scope: PortalScope, sectionId?: string) {
  const { user } = useAuth();
  const [links,   setLinks]   = useState<CourseLink[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLinks = useCallback(async () => {
    if (!user) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = supabase
      .from('course_links')
      .select('*')
      .eq('user_id', user.id)
      .eq('scope', scope)
      .order('order_index')
      .order('created_at');

    if (scope === 'course' && sectionId) {
      q = q.eq('section_id', sectionId);
    }

    const { data, error } = await q;
    if (!error) setLinks((data ?? []).map(coerce));
    setLoading(false);
  }, [user, scope, sectionId]);

  useEffect(() => { fetchLinks(); }, [fetchLinks]);

  const addLink = async (payload: AddPortalPayload) => {
    if (!user) return;
    const url = normalizeUrl(payload.url);
    const { error } = await supabase.from('course_links').insert({
      user_id:     user.id,
      section_id:  payload.sectionId ?? null,
      label:       payload.label,
      url,
      type:        payload.type,
      scope:       payload.scope,
      order_index: links.length,
    });
    if (error) throw error;
    await fetchLinks();
  };

  const updateLink = async (id: string, patch: UpdatePortalPayload) => {
    if (!user) return;
    const url = patch.url ? normalizeUrl(patch.url) : undefined;
    const { error } = await supabase
      .from('course_links')
      .update({ ...patch, ...(url ? { url } : {}) })
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
