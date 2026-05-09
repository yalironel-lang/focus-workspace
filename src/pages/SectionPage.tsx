import { useState, useRef, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useSectionDetail } from '../hooks/useSections';
import { useDeadlines } from '../hooks/useDeadlines';
import { usePortalLinks } from '../hooks/usePortalLinks';
import { useWorkspaceCustomization, WorkspaceCustomization } from '../hooks/useWorkspaceCustomization';
import { GroupComponent } from '../components/GroupComponent';
import { AddDeadlineModal } from '../components/AddDeadlineModal';
import { CourseHub } from '../components/CourseHub';
import { CustomizeModal } from '../components/CustomizeModal';
import { DesignModeBar } from '../components/DesignModeBar';
import type { GroupWithItems } from '../types';
import {
  Loader2, ArrowLeft, CheckCircle2, Circle, ArrowRight, Plus, X, Calendar,
  AlertTriangle, PlayCircle, ChevronDown, ChevronRight,
  Sliders, BookOpen,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Item, ItemType, SectionWithProgress, Deadline } from '../types';
import { loadSession, saveSession, pickTasks, pickPortals } from '../utils/sessionPlan';

// ── Helpers ───────────────────────────────────────────────────────────────────

function getEffort(item: Item): string {
  if (item.type === 'file') return 'Long';
  if (item.type === 'link') return 'Quick';
  if (item.type === 'note') return 'Medium';
  const words = item.title.trim().split(/\s+/).length;
  return words >= 8 ? 'Long' : words >= 4 ? 'Medium' : 'Quick';
}



function formatExamDate(d: string): string {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function daysUntil(d: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.ceil((new Date(d + 'T12:00:00').getTime() - today.getTime()) / 86_400_000);
}

function deadlineDiff(due: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.ceil((new Date(due + 'T12:00:00').getTime() - today.getTime()) / 86_400_000);
}

// ── Space age ────────────────────────────────────────────────────────────────
// A quiet ambient signal: how long has this space existed?
// Not a KPI — just a sense of the space having history.
function spaceAge(createdAt: string): string {
  const days = (Date.now() - new Date(createdAt).getTime()) / 86_400_000;
  if (days < 1)   return '';           // too new, say nothing
  if (days < 7)   return `${Math.floor(days)}d`;
  if (days < 60)  return `${Math.floor(days / 7)}w`;
  if (days < 365) return `${Math.floor(days / 30)}mo`;
  return `${Math.floor(days / 365)}y`;
}

const URGENCY_ORDER = { overdue: 0, urgent: 1, soon: 2, far: 3 } as const;
type UrgencyLevel = keyof typeof URGENCY_ORDER;

function deadlineUrgencyLevel(d: Deadline): UrgencyLevel {
  if (d.completed) return 'far';
  const diff = deadlineDiff(d.due_date);
  if (diff < 0)  return 'overdue';
  if (diff < 3)  return 'urgent';
  if (diff <= 7) return 'soon';
  return 'far';
}

function formatDueDate(d: string): string {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function urgencyDot(d: Deadline): string {
  if (d.completed) return '#263043';
  const diff = deadlineDiff(d.due_date);
  if (diff < 0)   return '#4b5563';
  if (diff <= 1)  return '#ef4444';
  if (diff < 3)   return '#ef4444';
  if (diff <= 7)  return '#f59e0b';
  return '#374151';
}
function urgencyLabel(d: Deadline): { text: string; color: string } {
  if (d.completed) return { text: '', color: '' };
  const diff = deadlineDiff(d.due_date);
  if (diff < 0)   return { text: `${Math.abs(diff)}d overdue`, color: '#4b5563' };
  if (diff === 0) return { text: 'Today',                       color: '#ef4444' };
  if (diff === 1) return { text: 'Tomorrow',                    color: '#f59e0b' };
  if (diff < 3)   return { text: `${diff} days`,                color: '#ef4444' };
  if (diff <= 7)  return { text: `${diff} days`,                color: '#f59e0b' };
  return               { text: `${diff}d`,                  color: '#374151' };
}

const PLAN_PRIORITY = ['Exercises', 'Exams', 'Slides'] as const;


// ── SpaceNav ──────────────────────────────────────────────────────────────────

function SpaceNav({ title, accent, isCustomizing, onBack, onCustomize, onExitCustomize, onResetCustomize }: {
  title: string;
  accent: string;
  isCustomizing: boolean;
  onBack: () => void;
  onCustomize: () => void;
  onExitCustomize: () => void;
  onResetCustomize: () => void;
}) {
  return (
    <nav style={{
      height: '44px', backgroundColor: 'rgba(7,11,20,0.92)',
      borderBottom: '1px solid rgba(255,255,255,0.04)',
      backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 20px', position: 'sticky', top: 0, zIndex: 50, flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <button onClick={onBack} style={{ color: '#263043', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '4px' }}
          onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = '#4b5563')}
          onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = '#263043')}>
          <ArrowLeft className="w-3.5 h-3.5" />
        </button>
        <span style={{ width: '1px', height: '14px', backgroundColor: 'rgba(255,255,255,0.05)', flexShrink: 0 }} />
        <span style={{ fontSize: '12px', fontWeight: 500, color: '#64748b', letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '280px' }}>
          {title}
        </span>
        <span style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: accent, flexShrink: 0, opacity: 0.6 }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
        {isCustomizing ? (
          <>
            <button onClick={onResetCustomize} style={{ fontSize: '11px', color: '#374151', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', borderRadius: '6px' }}
              onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = '#64748b')}
              onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = '#374151')}>
              Reset
            </button>
            <button onClick={onExitCustomize} style={{ fontSize: '11px', fontWeight: 700, color: '#000', backgroundColor: '#f59e0b', border: 'none', cursor: 'pointer', padding: '4px 12px', borderRadius: '8px' }}
              onMouseEnter={e => ((e.currentTarget as HTMLElement).style.backgroundColor = '#fbbf24')}
              onMouseLeave={e => ((e.currentTarget as HTMLElement).style.backgroundColor = '#f59e0b')}>
              Done
            </button>
          </>
        ) : (
          <button onClick={onCustomize} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#263043', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px', borderRadius: '6px' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#4b5563'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#263043'; }}>
            <Sliders className="w-3 h-3" />
          </button>
        )}
      </div>
    </nav>
  );
}

// ── WorkItem ──────────────────────────────────────────────────────────────────

// Items accumulate temporal presence. Something sitting unfinished for weeks
// feels different from something you added this morning — not labeled, just subtly
// more tired. The space has memory.
function itemAge(createdAt: string): 'fresh' | 'settled' | 'lingering' | 'old' {
  const days = (Date.now() - new Date(createdAt).getTime()) / 86_400_000;
  if (days < 2)   return 'fresh';
  if (days < 7)   return 'settled';
  if (days < 21)  return 'lingering';
  return 'old';
}

function WorkItem({ item, onToggle, onDelete }: {
  item: Item;
  onToggle: (id: string, completed: boolean) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [hovered, setHovered] = useState(false);
  const age = item.completed ? 'fresh' : itemAge(item.created_at);

  // Temporal presence — older unfinished items recede slightly, like they've been
  // sitting in the same place for a while.
  const itemOpacity = item.completed ? 0.4
    : age === 'fresh'     ? 1.0
    : age === 'settled'   ? 0.92
    : age === 'lingering' ? 0.82
    : 0.70;

  // The toggle button takes on a faint amber warmth for lingering/old items —
  // a quiet signal that this has been waiting, without announcing it.
  const toggleColor = item.completed ? '#10b981'
    : age === 'lingering' ? '#6b5c3e'
    : age === 'old'       ? '#7c5e3a'
    : '#263043';

  const toggleHoverColor = item.completed ? '#10b981'
    : (age === 'lingering' || age === 'old') ? '#f59e0b'
    : '#374151';

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', opacity: itemOpacity, transition: 'opacity 0.3s ease' }}
    >
      <button
        onClick={() => onToggle(item.id, !item.completed).catch(() => toast.error('Failed'))}
        style={{ flexShrink: 0, color: toggleColor, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: '2px', transition: 'color 0.2s ease' }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = toggleHoverColor; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = toggleColor; }}
      >
        {item.completed ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
      </button>
      <span style={{ flex: 1, fontSize: '14px', fontWeight: 500, color: item.completed ? '#374151' : '#e2e8f0', textDecoration: item.completed ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {item.title}
      </span>
      {hovered && (
        <button
          onClick={() => onDelete(item.id).catch(() => toast.error('Failed'))}
          style={{ flexShrink: 0, color: '#263043', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: '2px' }}
          onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = '#ef4444')}
          onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = '#263043')}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

// ── WorkCapture ───────────────────────────────────────────────────────────────

function WorkCapture({ onAdd }: { onAdd: (title: string) => Promise<void> }) {
  const [value, setValue] = useState('');
  const [adding, setAdding] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = value.trim();
    if (!t) return;
    setAdding(true);
    try { await onAdd(t); setValue(''); }
    catch { toast.error('Failed to add'); }
    finally { setAdding(false); }
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 0' }}>
      <span style={{ flexShrink: 0, color: '#263043', display: 'flex', padding: '2px' }}>
        {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
      </span>
      <input
        type="text"
        value={value}
        onChange={e => setValue(e.target.value)}
        placeholder="Add a task…"
        style={{ flex: 1, fontSize: '14px', color: '#4b5563', backgroundColor: 'transparent', border: 'none', outline: 'none' }}
        onFocus={e => { (e.currentTarget as HTMLInputElement).style.color = '#94a3b8'; }}
        onBlur={e => { (e.currentTarget as HTMLInputElement).style.color = '#4b5563'; }}
        onKeyDown={e => { if (e.key === 'Escape') { setValue(''); (e.currentTarget as HTMLInputElement).blur(); } }}
      />
      {value.trim() && (
        <button type="submit" disabled={adding} style={{ flexShrink: 0, fontSize: '11px', color: '#374151', backgroundColor: 'rgba(255,255,255,0.04)', border: 'none', cursor: 'pointer', padding: '4px 8px', borderRadius: '6px' }}
          onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = '#94a3b8')}
          onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = '#374151')}>
          ↵
        </button>
      )}
    </form>
  );
}

// ── AmbientDates ──────────────────────────────────────────────────────────────

function AmbientDates({ sectionId, sectionTitle }: { sectionId: string; sectionTitle: string }) {
  const { deadlines, addDeadline, toggleDeadline } = useDeadlines(sectionId);
  const [showAdd, setShowAdd] = useState(false);
  const sectionForModal = [{ id: sectionId, title: sectionTitle } as SectionWithProgress];

  const pending = [...deadlines]
    .filter(d => !d.completed)
    .sort((a, b) => {
      const au = URGENCY_ORDER[deadlineUrgencyLevel(a)];
      const bu = URGENCY_ORDER[deadlineUrgencyLevel(b)];
      return au !== bu ? au - bu : a.due_date.localeCompare(b.due_date);
    })
    .slice(0, 6);

  const urgentCount = pending.filter(d => {
    const lvl = deadlineUrgencyLevel(d);
    return lvl === 'overdue' || lvl === 'urgent';
  }).length;

  return (
    <>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#263043' }}>
              Dates
            </span>
            {urgentCount > 0 && (
              <span style={{ fontSize: '9px', fontWeight: 700, padding: '1px 5px', borderRadius: '4px', backgroundColor: 'rgba(239,68,68,0.12)', color: '#ef4444' }}>
                {urgentCount}
              </span>
            )}
          </div>
          <button onClick={() => setShowAdd(true)} style={{ fontSize: '11px', color: '#263043', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px' }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = '#f59e0b')}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = '#263043')}>
            +
          </button>
        </div>

        {pending.length === 0 ? (
          <button onClick={() => setShowAdd(true)} style={{ fontSize: '11px', color: '#1a2230', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = '#374151')}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = '#1a2230')}>
            + Add a date
          </button>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {pending.map(d => {
              const lbl = urgencyLabel(d);
              const dot = urgencyDot(d);
              return (
                <div key={d.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '7px' }}>
                  <span style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: dot, flexShrink: 0, marginTop: '4px' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '11px', fontWeight: 600, color: '#4b5563', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>
                      {d.title}
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '3px', marginTop: '1px' }}>
                      <span style={{ fontSize: '10px', color: '#263043' }}>{formatDueDate(d.due_date)}</span>
                      {lbl.text && <span style={{ fontSize: '10px', color: lbl.color, fontWeight: 600 }}>· {lbl.text}</span>}
                    </div>
                  </div>
                  <button
                    onClick={() => toggleDeadline(d.id, !d.completed).catch(() => {})}
                    style={{ flexShrink: 0, color: '#1a2230', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: '1px' }}
                    title="Mark done"
                    onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = '#10b981')}
                    onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = '#1a2230')}>
                    <CheckCircle2 className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showAdd && (
        <AddDeadlineModal
          sections={sectionForModal}
          defaultSectionId={sectionId}
          onClose={() => setShowAdd(false)}
          onAdd={addDeadline}
        />
      )}
    </>
  );
}

// ── SectionPage ───────────────────────────────────────────────────────────────

export function SectionPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const {
    section, loading, fetchSection,
    addItem, pushItem, updateItem, deleteItem, toggleTask,
    addGroup, updateGroup, deleteGroup, setExamDate,
  } = useSectionDetail(id);
  const { links: courseLinks } = usePortalLinks('course', id);
  const { links: globalLinks } = usePortalLinks('global');
  const { customization, setCustomization } = useWorkspaceCustomization(id ?? '');


  const [showAddLane,     setShowAddLane]     = useState(false);
  const [newLaneTitle,    setNewLaneTitle]     = useState('');
  const [addingLane,      setAddingLane]       = useState(false);
  const [editingExamDate, setEditingExamDate]  = useState(false);
  const [showCustomize,   setShowCustomize]    = useState(false);

  // ── Design Mode state ─────────────────────────────────────────────────────
  const [designMode,      setDesignMode]      = useState(false);
  const designSnapshot = useRef<WorkspaceCustomization | null>(null);

  // Drag-and-drop for lane reorder (HTML5 drag API)
  const [dragId,     setDragId]     = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const dragIdRef = useRef<string | null>(null);

  const enterDesignMode = () => {
    designSnapshot.current = { ...customization };
    setDesignMode(true);
  };

  const exitDesignMode = () => setDesignMode(false);

  const resetDesign = () => {
    if (designSnapshot.current) setCustomization(designSnapshot.current);
    setDesignMode(false);
  };

  const toggleHideLane = (groupId: string) => {
    const hidden = customization.hiddenLanes ?? [];
    const next = hidden.includes(groupId)
      ? hidden.filter(id => id !== groupId)
      : [...hidden, groupId];
    setCustomization({ ...customization, hiddenLanes: next });
  };

  // Groups in user-defined order (Design Mode drag reorder)
  const orderedGroups: GroupWithItems[] = (() => {
    if (!section) return [];
    const all = section.groups;
    const order = customization.laneOrder ?? [];
    if (!order.length) return all;
    const known = order
      .map(gid => all.find(g => g.id === gid))
      .filter((g): g is GroupWithItems => !!g);
    const rest = all.filter(g => !order.includes(g.id));
    return [...known, ...rest];
  })();

  const handleDragStart = (_e: React.DragEvent, groupId: string) => {
    dragIdRef.current = groupId;
    setDragId(groupId);
  };

  const handleDragOver = (e: React.DragEvent, groupId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (groupId !== dragIdRef.current) setDragOverId(groupId);
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const sourceId = dragIdRef.current;
    if (!sourceId || sourceId === targetId) { handleDragEnd(); return; }
    const allIds = orderedGroups.map(g => g.id);
    const fromIdx = allIds.indexOf(sourceId);
    const toIdx   = allIds.indexOf(targetId);
    const newOrder = [...allIds];
    newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, sourceId);
    setCustomization({ ...customization, laneOrder: newOrder });
    handleDragEnd();
  };

  const handleDragEnd = () => {
    setDragId(null);
    setDragOverId(null);
    dragIdRef.current = null;
  };

  const activeSession        = loadSession();
  const sessionIsThisCourse  = activeSession?.sectionId === id;

  const handleStartSession = () => {
    if (!section) return;
    if (sessionIsThisCourse) { navigate('/session'); return; }
    const tasks   = pickTasks(section.groups);
    const portals = pickPortals(courseLinks, globalLinks);
    if (tasks.length === 0) {
      toast('No tasks found — add items to your To Do list first.');
      return;
    }
    saveSession({
      sectionId:    section.id,
      sectionTitle: section.title,
      taskIds:      tasks.map(t => t.item.id),
      portalIds:    portals.map(p => p.id),
      startedAt:    new Date().toISOString(),
    });
    navigate('/session');
  };

  const handleWorkCapture = async (title: string) => {
    if (!section) return;
    const exercisesGrp = section.groups.find(g => g.title === 'Exercises');
    let gid = exercisesGrp?.id;
    if (!gid) {
      gid = await addGroup('Exercises');
    }
    await addItem(gid, 'task', title);
  };

  const handleAddLane = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLaneTitle.trim()) return;
    setAddingLane(true);
    try {
      await addGroup(newLaneTitle.trim());
      toast.success('Lane created');
      setNewLaneTitle('');
      setShowAddLane(false);
    } catch {
      toast.error('Failed to create lane');
    } finally {
      setAddingLane(false);
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100dvh', backgroundColor: '#070b14', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#263043' }} />
      </div>
    );
  }

  if (!section) {
    return (
      <div style={{ minHeight: '100dvh', backgroundColor: '#070b14', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
        <h2 className="text-lg font-semibold" style={{ color: '#f8fafc' }}>
          Workspace not found
        </h2>
        <Link to="/dashboard" className="text-sm font-semibold" style={{ color: '#f59e0b' }}>
          ← Back to dashboard
        </Link>
      </div>
    );
  }

  const totalItems     = section.groups.reduce((sum, g) => sum + g.items.length, 0);
  const completedItems = section.groups.reduce((sum, g) => sum + g.items.filter(i => i.completed).length, 0);
  const remaining      = totalItems - completedItems;
  const progress       = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;
  const allDone        = totalItems > 0 && remaining === 0;

  const examDays = section.exam_date ? daysUntil(section.exam_date) : null;

  const progressColor = allDone || progress >= 70 ? '#10b981'
                      : progress >= 30             ? '#f59e0b'
                      :                              '#ef4444';

  // Customization — accent overrides progress-based color for decorative elements only
  const accentColor = customization.accent || progressColor;

  const isPanic = !!section.exam_date && progress < 50;

  // Split: Exercises (primary) vs everything else (resources)
  const exercisesGroup = section.groups.find(g => g.title === 'Exercises');
  const resourceGroups = section.groups.filter(g => g.title !== 'Exercises');

  // Today's Plan — up to 3 recommended actions
  const todayPlan = (() => {
    const result: Array<{ item: Item; lane: string; reason: string; effort: string }> = [];
    for (const gName of PLAN_PRIORITY) {
      if (result.length >= 3) break;
      const g = section.groups.find(x => x.title === gName);
      if (!g) continue;
      const lane   = gName === 'Exercises' ? 'To Do' : gName;
      const reason = gName === 'Exercises' ? 'Next incomplete task'
                   : gName === 'Exams'     ? 'Focus here first'
                   : 'Review lecture material';
      for (const item of g.items) {
        if (!item.completed && result.length < 3) result.push({ item, lane, reason, effort: getEffort(item) });
      }
    }
    if (result.length < 3) {
      for (const g of section.groups) {
        if (result.length >= 3) break;
        if ([...PLAN_PRIORITY, 'Links', 'Notes'].includes(g.title)) continue;
        for (const item of g.items) {
          if (!item.completed && result.length < 3)
            result.push({ item, lane: g.title, reason: 'Next best action', effort: getEffort(item) });
        }
      }
    }
    return result;
  })();

  const scrollToItem = (itemId: string) =>
    document.getElementById(`item-${itemId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });

  // Common props passed to every GroupComponent and ResourcesBlock
  const groupCallbacks = {
    onAddItem:    addItem,
    onPushItem:   pushItem,
    onToggleItem: toggleTask,
    onDeleteItem: deleteItem,
    onUpdateItem: updateItem,
    onRenameGroup: updateGroup,
    onDeleteGroup: deleteGroup,
    onAddGroup:   addGroup,
    onRefresh:     fetchSection,
  };

  return (
    <div style={{ minHeight: '100dvh', backgroundColor: '#070b14', color: '#f8fafc', display: 'flex', flexDirection: 'column' }}>

      {/* ── SPACE NAV ────────────────────────────────────────────────────── */}
      <SpaceNav
        title={section.title}
        accent={accentColor}
        isCustomizing={designMode}
        onBack={() => navigate('/dashboard')}
        onCustomize={enterDesignMode}
        onExitCustomize={exitDesignMode}
        onResetCustomize={resetDesign}
      />

      {/* ── CUSTOMIZE MODE ───────────────────────────────────────────────── */}
      {designMode ? (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{ maxWidth: '896px', margin: '0 auto', padding: '24px 24px 64px' }}>

            <DesignModeBar
              customization={customization}
              onChange={setCustomization}
              onDone={exitDesignMode}
              onReset={resetDesign}
            />

            <div className="space-y-3 mb-4">
              {orderedGroups.map(group => {
                const isDragging = dragId     === group.id;
                const isDragOver = dragOverId === group.id && dragId !== group.id;
                return (
                  <div
                    key={group.id}
                    draggable
                    onDragStart={e => handleDragStart(e, group.id)}
                    onDragOver={e  => handleDragOver(e,  group.id)}
                    onDrop={e      => handleDrop(e,      group.id)}
                    onDragEnd={handleDragEnd}
                    style={{
                      opacity: isDragging ? 0.35 : 1,
                      outline: isDragOver ? '2px solid #f59e0b' : 'none',
                      outlineOffset: '3px',
                      borderRadius: '14px',
                      transition: 'opacity 0.15s',
                      cursor: 'grab',
                    }}
                  >
                    <GroupComponent
                      group={group}
                      sectionId={section.id}
                      {...groupCallbacks}
                      designMode
                      isHidden={(customization.hiddenLanes ?? []).includes(group.id)}
                      onToggleHide={() => toggleHideLane(group.id)}
                      density={customization.density || 'comfortable'}
                    />
                  </div>
                );
              })}
            </div>

            {/* Add Lane */}
            <div className="mt-2 mb-6">
              {showAddLane ? (
                <form
                  onSubmit={handleAddLane}
                  className="flex gap-2.5 rounded-xl p-3"
                  style={{ backgroundColor: '#0d111a', border: '1px solid #263043' }}
                >
                  <input
                    type="text"
                    value={newLaneTitle}
                    onChange={e => setNewLaneTitle(e.target.value)}
                    placeholder="Lane name (e.g. Flashcards, Lab Reports, Vocabulary…)"
                    className="flex-1 text-sm bg-transparent outline-none"
                    style={{ color: '#f8fafc' }}
                    autoFocus
                    onKeyDown={e => { if (e.key === 'Escape') { setShowAddLane(false); setNewLaneTitle(''); } }}
                  />
                  <button
                    type="submit"
                    disabled={addingLane || !newLaneTitle.trim()}
                    className="px-3.5 py-1.5 rounded-lg font-semibold text-sm disabled:opacity-40 flex items-center gap-1.5 whitespace-nowrap"
                    style={{ backgroundColor: '#f59e0b', color: '#000' }}
                  >
                    {addingLane ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Create'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowAddLane(false); setNewLaneTitle(''); }}
                    className="p-1.5 rounded-lg"
                    style={{ color: '#374151' }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#94a3b8')}
                    onMouseLeave={e => (e.currentTarget.style.color = '#374151')}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </form>
              ) : (
                <button
                  onClick={() => setShowAddLane(true)}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold"
                  style={{ border: '2px dashed #1a2230', color: '#374151' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#f59e0b'; e.currentTarget.style.color = '#f59e0b'; e.currentTarget.style.backgroundColor = 'rgba(245,158,11,0.04)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = '#1a2230'; e.currentTarget.style.color = '#374151'; e.currentTarget.style.backgroundColor = 'transparent'; }}
                >
                  <Plus className="w-4 h-4" strokeWidth={2} />
                  Add lane
                </button>
              )}
            </div>
          </div>
        </div>

      ) : (

        /* ── SPATIAL ENVIRONMENT ─────────────────────────────────────────── */
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-[220px_1fr]" style={{ overflow: 'hidden', minHeight: 0 }}>

          {/* ── LEFT PERIPHERAL ──────────────────────────────────────────── */}
          <aside
            className="hidden lg:flex flex-col overflow-y-auto"
            style={{ borderRight: '1px solid rgba(255,255,255,0.05)', padding: '20px 16px', gap: 0, backgroundColor: '#070b14' }}
          >
            <CourseHub sectionId={section.id} />

            <div style={{ margin: '20px 0 12px', height: '1px', backgroundColor: 'rgba(255,255,255,0.04)' }} />

            <AmbientDates sectionId={section.id} sectionTitle={section.title} />
          </aside>

          {/* ── RIGHT WORK SURFACE ───────────────────────────────────────── */}
          <main style={{ overflowY: 'auto', position: 'relative', backgroundColor: 'rgba(255,255,255,0.012)' }}>

            {/* Session aura */}
            <div style={{
              position: 'absolute', inset: 0,
              background: sessionIsThisCourse
                ? 'radial-gradient(ellipse at 50% 0%, rgba(245,158,11,0.045) 0%, transparent 60%)'
                : 'radial-gradient(ellipse at 50% 0%, rgba(245,158,11,0.018) 0%, transparent 55%)',
              pointerEvents: 'none', zIndex: 0, transition: 'background 0.8s ease',
            }} />

            <div style={{ position: 'relative', zIndex: 1, padding: '36px 40px 64px', maxWidth: '680px' }}>

              {/* ── IDENTITY HEADER ──────────────────────────────────────── */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '28px', paddingLeft: '12px', borderLeft: `3px solid ${accentColor}` }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    {customization.icon && (
                      <span style={{ fontSize: '16px', lineHeight: 1 }} role="img">{customization.icon}</span>
                    )}
                    <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#f1f5f9', letterSpacing: '-0.02em', margin: 0 }}>
                      {section.title}
                    </h1>
                    {spaceAge(section.created_at) && (
                      <span style={{ fontSize: '10px', color: '#1a2230', fontWeight: 400, letterSpacing: '0.02em', flexShrink: 0, userSelect: 'none' }}>
                        {spaceAge(section.created_at)}
                      </span>
                    )}
                  </div>

                  {totalItems > 0 ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                      {allDone ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px', fontWeight: 600, color: '#10b981' }}>
                          <CheckCircle2 className="w-3.5 h-3.5" /> All caught up
                        </span>
                      ) : (
                        <>
                          <span style={{ fontSize: '12px', color: '#4b5563' }}>
                            <span style={{ color: '#94a3b8', fontWeight: 600 }}>{remaining}</span> remaining
                          </span>
                          <span style={{ fontSize: '12px', color: '#1a2230' }}>·</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <div style={{ width: '80px', height: '3px', borderRadius: '2px', backgroundColor: '#111827', overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${progress}%`, backgroundColor: progressColor, borderRadius: '2px', transition: 'width 0.7s ease' }} />
                            </div>
                            <span style={{ fontSize: '11px', color: '#374151', fontWeight: 600 }}>{progress}%</span>
                          </div>
                        </>
                      )}

                      {/* Exam date inline */}
                      {editingExamDate ? (
                        <input
                          type="date"
                          defaultValue={section.exam_date ?? ''}
                          autoFocus
                          style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '6px', backgroundColor: '#111827', border: '1px solid #f59e0b', color: '#f8fafc', outline: 'none' }}
                          onBlur={e => { setEditingExamDate(false); setExamDate(e.target.value || null).catch(() => toast.error('Failed to save exam date')); }}
                          onKeyDown={e => { if (e.key === 'Escape') setEditingExamDate(false); if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                        />
                      ) : section.exam_date ? (
                        <button
                          onClick={() => setEditingExamDate(true)}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#4b5563', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                          onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = '#94a3b8')}
                          onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = '#4b5563')}
                        >
                          <Calendar className="w-3 h-3" />
                          {formatExamDate(section.exam_date)}
                          {examDays !== null && (
                            <span style={{ color: examDays <= 0 ? '#4b5563' : examDays <= 7 ? '#ef4444' : examDays <= 14 ? '#f59e0b' : '#4b5563', fontWeight: 600 }}>
                              · {examDays > 0 ? `${examDays}d` : examDays === 0 ? 'Today!' : 'Past'}
                            </span>
                          )}
                        </button>
                      ) : (
                        <button
                          onClick={() => setEditingExamDate(true)}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#263043', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                          onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = '#4b5563')}
                          onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = '#263043')}
                        >
                          <Calendar className="w-3 h-3" /> Set exam date
                        </button>
                      )}
                    </div>
                  ) : (
                    <p style={{ fontSize: '12px', color: '#263043', margin: 0 }}>Add tasks to start tracking progress</p>
                  )}
                </div>

                <button
                  onClick={() => setShowCustomize(true)}
                  style={{ flexShrink: 0, fontSize: '10px', fontWeight: 600, padding: '4px 8px', borderRadius: '6px', color: '#263043', border: '1px solid #1a2230', backgroundColor: 'transparent', cursor: 'pointer', marginTop: '2px' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#4b5563'; (e.currentTarget as HTMLElement).style.borderColor = '#263043'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#263043'; (e.currentTarget as HTMLElement).style.borderColor = '#1a2230'; }}
                  title="Customize workspace"
                >
                  ✦
                </button>
              </div>

              {/* ── PANIC BANNER ─────────────────────────────────────────── */}
              {isPanic && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px 12px', borderRadius: '8px', backgroundColor: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.15)', marginBottom: '20px' }}>
                  <AlertTriangle className="w-3.5 h-3.5" style={{ color: '#f59e0b', flexShrink: 0, marginTop: '1px' }} />
                  <p style={{ fontSize: '12px', color: '#f59e0b', margin: 0 }}>
                    Exam approaching — focus on high-impact items
                  </p>
                </div>
              )}

              {/* ── FOCUS NOW STRIP ──────────────────────────────────────── */}
              {todayPlan.length > 0 && (
                <div style={{ borderLeft: '2px solid #f59e0b', backgroundColor: 'rgba(245,158,11,0.025)', borderRadius: '0 8px 8px 0', marginBottom: '28px', overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px', borderBottom: '1px solid rgba(245,158,11,0.08)' }}>
                    <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#f59e0b' }}>Focus Now</span>
                    <span style={{ fontSize: '9px', color: '#374151' }}>{todayPlan.length} action{todayPlan.length !== 1 ? 's' : ''}</span>
                  </div>

                  <button
                    onClick={() => scrollToItem(todayPlan[0].item.id)}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', borderBottom: todayPlan.length > 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}
                    onMouseEnter={e => ((e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(245,158,11,0.03)')}
                    onMouseLeave={e => ((e.currentTarget as HTMLElement).style.backgroundColor = 'transparent')}
                  >
                    <span style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: '#f59e0b', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: '13px', fontWeight: 600, color: '#e2e8f0', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {todayPlan[0].item.title}
                      </p>
                      <p style={{ fontSize: '10px', color: '#374151', margin: '2px 0 0' }}>
                        {todayPlan[0].lane} · {todayPlan[0].reason}
                      </p>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5" style={{ color: '#374151', flexShrink: 0 }} />
                  </button>

                  {todayPlan.slice(1).map((rec, i) => (
                    <button
                      key={rec.item.id}
                      onClick={() => scrollToItem(rec.item.id)}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                      onMouseEnter={e => ((e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(245,158,11,0.02)')}
                      onMouseLeave={e => ((e.currentTarget as HTMLElement).style.backgroundColor = 'transparent')}
                    >
                      <span style={{ fontSize: '10px', fontWeight: 700, color: '#374151', width: '14px', textAlign: 'center', flexShrink: 0 }}>{i + 2}</span>
                      <p style={{ flex: 1, fontSize: '12px', color: '#94a3b8', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {rec.item.title}
                      </p>
                    </button>
                  ))}

                  <div style={{ padding: '10px 14px' }}>
                    <button
                      onClick={handleStartSession}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px', padding: '8px 16px', borderRadius: '8px', backgroundColor: '#f59e0b', color: '#000', fontSize: '12px', fontWeight: 700, border: 'none', cursor: 'pointer' }}
                      onMouseEnter={e => ((e.currentTarget as HTMLElement).style.backgroundColor = '#fbbf24')}
                      onMouseLeave={e => ((e.currentTarget as HTMLElement).style.backgroundColor = '#f59e0b')}
                    >
                      <PlayCircle className="w-3.5 h-3.5" />
                      {sessionIsThisCourse ? 'Resume Session →' : 'Start Session'}
                    </button>
                  </div>
                </div>
              )}

              {/* ── WORK SURFACE ─────────────────────────────────────────── */}
              <div style={{ marginBottom: '36px' }}>
                <p style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#263043', marginBottom: '4px', margin: '0 0 4px' }}>
                  Work
                </p>

                {exercisesGroup ? (
                  <>
                    {exercisesGroup.items.map(item => (
                      <div key={item.id} id={`item-${item.id}`}>
                        <WorkItem item={item} onToggle={toggleTask} onDelete={deleteItem} />
                      </div>
                    ))}
                    {exercisesGroup.items.length === 0 && (
                      <p style={{ fontSize: '13px', color: '#263043', padding: '10px 0', fontStyle: 'italic', margin: 0 }}>
                        Nothing here yet — add a task below.
                      </p>
                    )}
                  </>
                ) : (
                  <p style={{ fontSize: '13px', color: '#263043', padding: '10px 0', margin: 0 }}>
                    No work items yet.
                  </p>
                )}

                <WorkCapture onAdd={handleWorkCapture} />
              </div>

              {/* ── SHELF ────────────────────────────────────────────────── */}
              <div style={{ paddingTop: '24px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                <ResourcesBlock
                  groups={resourceGroups.filter(g => !(customization.hiddenLanes ?? []).includes(g.id))}
                  sectionId={section.id}
                  groupCallbacks={groupCallbacks}
                  density={customization.density || ''}
                />
              </div>

              {/* Mobile: ambient dates below shelf */}
              <div className="lg:hidden" style={{ marginTop: '24px', paddingTop: '20px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                <AmbientDates sectionId={section.id} sectionTitle={section.title} />
              </div>

            </div>
          </main>
        </div>
      )}

      {showCustomize && (
        <CustomizeModal
          sectionTitle={section.title}
          value={customization}
          onChange={setCustomization}
          onClose={() => setShowCustomize(false)}
        />
      )}
    </div>
  );
}


// ── ResourcesBlock ────────────────────────────────────────────────────────────

// ── ShelfAddForm — inline creation for a single item ─────────────────────────
// Appears in-place when the user picks a type. Auto-creates "Shelf" group if
// none exists so users never have to think about group structure.

type ShelfItemType = 'note' | 'link' | 'task';

interface ShelfFormProps {
  type:        ShelfItemType;
  groupId:     string | null;   // null → auto-create "Shelf" group
  onAddGroup:  (title: string) => Promise<string>;
  onAddItem:   (groupId: string, type: ItemType, title: string, content?: string) => Promise<void>;
  onDone:      () => void;
}

function ShelfAddForm({ type, groupId, onAddGroup, onAddItem, onDone }: ShelfFormProps) {
  const [title,   setTitle]   = useState('');
  const [content, setContent] = useState('');
  const [url,     setUrl]     = useState('');
  const [saving,  setSaving]  = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => { titleRef.current?.focus(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // For links, url is the key field; title is optional (falls back to url)
    const finalTitle   = type === 'link'
      ? (title.trim() || url.trim())
      : title.trim();
    const finalContent = type === 'link'
      ? url.trim()
      : content.trim() || undefined;
    if (!finalTitle) return;

    setSaving(true);
    try {
      let targetId = groupId;
      if (!targetId) {
        // Auto-create a default shelf — groups are an implementation detail
        targetId = await onAddGroup('Shelf');
      }
      await onAddItem(targetId, type, finalTitle, finalContent);
      onDone();
    } catch {
      setSaving(false);
    }
  };

  const cancel = () => { if (!saving) onDone(); };

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl p-3 flex flex-col gap-2.5"
      style={{ backgroundColor: '#070b14', border: '1px solid #1a2236' }}
    >
      {/* Type badge */}
      <div className="flex items-center justify-between">
        <span
          className="text-[9px] font-bold uppercase tracking-[0.14em] px-1.5 py-0.5 rounded"
          style={{ backgroundColor: '#1a2236', color: '#4b5563' }}
        >
          {type === 'task' ? 'Checklist item' : type}
        </span>
        <button
          type="button"
          onClick={cancel}
          style={{ color: '#374151', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1 }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#94a3b8'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#374151'; }}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Link URL — shown first for links since it's the primary field */}
      {type === 'link' && (
        <input
          ref={titleRef as React.RefObject<HTMLInputElement>}
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="https://…"
          className="w-full text-sm bg-transparent outline-none"
          style={{ color: '#f1f5f9' }}
          onKeyDown={e => { if (e.key === 'Escape') cancel(); }}
        />
      )}

      {/* Title / label */}
      <input
        ref={type !== 'link' ? titleRef : undefined}
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder={
          type === 'note' ? 'Title (e.g. "Chapter 3 notes")' :
          type === 'link' ? 'Label (optional)' :
          'What needs doing?'
        }
        className="w-full text-sm bg-transparent outline-none"
        style={{ color: '#f1f5f9' }}
        onKeyDown={e => { if (e.key === 'Escape') cancel(); }}
      />

      {/* Content body — only for notes */}
      {type === 'note' && (
        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder="Add details (optional)"
          rows={3}
          className="w-full text-xs bg-transparent outline-none resize-none"
          style={{ color: '#94a3b8' }}
          onKeyDown={e => { if (e.key === 'Escape') cancel(); }}
        />
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 pt-0.5">
        <button
          type="button"
          onClick={cancel}
          className="text-xs px-2.5 py-1.5 rounded-lg transition-colors"
          style={{ color: '#4b5563' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#94a3b8'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#4b5563'; }}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving || (type === 'link' ? !url.trim() : !title.trim())}
          className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
          style={{ backgroundColor: '#1a2236', color: '#94a3b8', border: '1px solid #263043' }}
          onMouseEnter={e => { if (!saving) (e.currentTarget as HTMLElement).style.backgroundColor = '#263043'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = '#1a2236'; }}
        >
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
          Save
        </button>
      </div>
    </form>
  );
}

// ── ResourcesBlock ────────────────────────────────────────────────────────────
// A lightweight shelf for keeping useful things close to the work.
// Groups (now "sections") are an optional organising layer — never required.

function ResourcesBlock({
  groups, sectionId, groupCallbacks, density = '',
}: {
  groups: GroupWithItems[];
  sectionId: string;
  density?: 'compact' | 'comfortable' | 'spacious' | '';
  groupCallbacks: {
    onAddItem:    (groupId: string, type: ItemType, title: string, content?: string) => Promise<void>;
    onPushItem:   (groupId: string, item: Item) => void;
    onToggleItem: (itemId: string, completed: boolean) => Promise<void>;
    onDeleteItem: (itemId: string) => Promise<void>;
    onUpdateItem: (itemId: string, updates: { title?: string; content?: string | null }) => Promise<void>;
    onRenameGroup: (groupId: string, title: string) => Promise<void>;
    onDeleteGroup: (groupId: string) => Promise<void>;
    onAddGroup:   (title: string) => Promise<string>;
    onRefresh:    () => void;
  };
}) {
  // Open by default — this shelf is part of the space, not a collapsed extra.
  const [isOpen,      setIsOpen]      = useState(true);
  const [addingType,  setAddingType]  = useState<ShelfItemType | null>(null);
  const [showSection, setShowSection] = useState(false);
  const [sectionName, setSectionName] = useState('');

  const totalItems  = groups.reduce((s, g) => s + g.items.length, 0);
  // The default landing group — first available, or null (auto-create "Shelf")
  const defaultGroupId = groups[0]?.id ?? null;

  const handleAddSection = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = sectionName.trim();
    if (!t) return;
    try { await groupCallbacks.onAddGroup(t); } catch { /* handled upstream */ }
    setSectionName('');
    setShowSection(false);
  };

  // Quick-add chips shown in header and inside the body
  const TYPE_CHIPS: Array<{ type: ShelfItemType; label: string }> = [
    { type: 'note', label: 'Note'      },
    { type: 'link', label: 'Link'      },
    { type: 'task', label: 'Checklist' },
  ];

  const QuickChips = ({ compact = false }: { compact?: boolean }) => (
    <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
      {TYPE_CHIPS.map(({ type, label }) => (
        <button
          key={type}
          onClick={() => { setAddingType(type); setIsOpen(true); }}
          className="flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-lg transition-colors"
          style={{
            backgroundColor: addingType === type ? '#1a2236' : 'transparent',
            color:           addingType === type ? '#94a3b8' : '#4b5563',
            border:          `1px solid ${addingType === type ? '#263043' : 'transparent'}`,
          }}
          onMouseEnter={e => {
            if (addingType !== type) {
              (e.currentTarget as HTMLElement).style.backgroundColor = '#111827';
              (e.currentTarget as HTMLElement).style.color = '#94a3b8';
            }
          }}
          onMouseLeave={e => {
            if (addingType !== type) {
              (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
              (e.currentTarget as HTMLElement).style.color = '#4b5563';
            }
          }}
        >
          <Plus className="w-2.5 h-2.5" />
          {compact ? null : label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="rounded-xl overflow-hidden mb-4"
         style={{ backgroundColor: '#0d111a', border: '1px solid #263043' }}>

      {/* ── Header ── */}
      <div
        className="px-4 py-2.5 flex items-center justify-between cursor-pointer select-none transition-colors"
        style={{ borderBottom: isOpen ? '1px solid #1a2230' : 'none' }}
        onClick={() => setIsOpen(o => !o)}
        onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#111827')}
        onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
      >
        <div className="flex items-center gap-2">
          <span className="flex-shrink-0" style={{ color: '#374151' }}>
            {isOpen
              ? <ChevronDown  className="w-3.5 h-3.5" />
              : <ChevronRight className="w-3.5 h-3.5" />}
          </span>
          <span className="text-xs font-bold uppercase tracking-[0.12em]"
                style={{ color: '#f8fafc' }}>
            Shelf
          </span>
          {totalItems > 0 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                  style={{ backgroundColor: '#111827', color: '#4b5563' }}>
              {totalItems}
            </span>
          )}
        </div>
        {/* Quick-add chips — stop propagation so they don't toggle collapse */}
        <QuickChips />
      </div>

      {/* ── Body ── */}
      {isOpen && (
        <div className="p-3 flex flex-col gap-3">

          {/* Inline add form — appears when a type chip is selected */}
          {addingType && (
            <ShelfAddForm
              type={addingType}
              groupId={defaultGroupId}
              onAddGroup={groupCallbacks.onAddGroup}
              onAddItem={groupCallbacks.onAddItem}
              onDone={() => setAddingType(null)}
            />
          )}

          {/* Groups / items */}
          {groups.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {groups.map(group => (
                <GroupComponent
                  key={group.id}
                  group={group}
                  sectionId={sectionId}
                  onAddItem={groupCallbacks.onAddItem}
                  onPushItem={groupCallbacks.onPushItem}
                  onToggleItem={groupCallbacks.onToggleItem}
                  onDeleteItem={groupCallbacks.onDeleteItem}
                  onUpdateItem={groupCallbacks.onUpdateItem}
                  onRenameGroup={groupCallbacks.onRenameGroup}
                  onDeleteGroup={groupCallbacks.onDeleteGroup}
                  onRefresh={groupCallbacks.onRefresh}
                  density={density}
                />
              ))}
            </div>
          ) : !addingType ? (
            /* ── Empty state ── */
            <div className="flex flex-col items-center justify-center py-8 gap-4"
                 style={{ borderRadius: '10px', backgroundColor: '#070b14', border: '1px dashed #1a2236' }}>
              <div className="flex items-center justify-center w-9 h-9 rounded-xl"
                   style={{ backgroundColor: '#111827' }}>
                <BookOpen className="w-4 h-4" style={{ color: '#374151' }} />
              </div>
              <div className="text-center px-4">
                <p className="text-sm font-semibold mb-1" style={{ color: '#94a3b8' }}>
                  Keep useful things here
                </p>
                <p className="text-xs leading-relaxed" style={{ color: '#374151' }}>
                  Notes, links, references, and files for this space
                </p>
              </div>
              {/* Primary CTAs — one per type */}
              <div className="flex items-center gap-2">
                {TYPE_CHIPS.map(({ type, label }) => (
                  <button
                    key={type}
                    onClick={() => setAddingType(type)}
                    className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                    style={{ backgroundColor: '#1a2236', color: '#94a3b8', border: '1px solid #263043' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = '#263043'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = '#1a2236'; }}
                  >
                    <Plus className="w-3 h-3" />
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {/* ── Add section (power-user feature — sits quietly at the bottom) ── */}
          {groups.length > 0 && (
            showSection ? (
              <form
                onSubmit={handleAddSection}
                className="flex items-center gap-2 px-2 py-2 rounded-lg"
                style={{ backgroundColor: '#070b14', border: '1px solid #1a2236' }}
              >
                <input
                  autoFocus
                  value={sectionName}
                  onChange={e => setSectionName(e.target.value)}
                  placeholder="Section name (e.g. Notes, Links, References)"
                  className="flex-1 text-xs bg-transparent outline-none"
                  style={{ color: '#f1f5f9' }}
                  onKeyDown={e => { if (e.key === 'Escape') { setShowSection(false); setSectionName(''); } }}
                />
                <button
                  type="submit"
                  disabled={!sectionName.trim()}
                  className="text-xs font-bold px-2.5 py-1 rounded-lg disabled:opacity-40 transition-colors"
                  style={{ backgroundColor: '#1a2236', color: '#94a3b8' }}
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => { setShowSection(false); setSectionName(''); }}
                  style={{ color: '#374151', background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </form>
            ) : (
              <button
                onClick={() => setShowSection(true)}
                className="self-start text-[10px] transition-colors"
                style={{ color: '#263043', background: 'none', border: 'none', cursor: 'pointer' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#4b5563'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#263043'; }}
              >
                + Add section
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}
