import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { useSectionFreeSpaceObjects, normalizeProjectSpaceObject, type ProjectSpaceObject, type SectionFreeSpaceObjectsState } from '../../hooks/useSectionFreeSpaceObjects';
import { closeNotebook, isObjectActive, notebookTitle, reopenNotebook } from '../notebookLifecycle';
import { boardScopedFreeSpaceKeys } from '../freeSpacePersistence';
import { flushAllFreeSpacePersistence } from '../freeSpacePersistFlush';
import { buildFreeSpaceObjectWritePayload } from '../focusCache/freeSpaceObjectCreateEnqueue';
import { mergeIncomingFreeSpaceObject } from '../focusCache/freeSpaceObjectGeometryLww';
import { enqueueFreeSpaceObjectUpdatesAfterLocalPersist } from '../focusCache/freeSpaceObjectUpdateEnqueue';
import { enqueueFreeSpaceObjectDeletesAfterLocalDelete } from '../focusCache/freeSpaceObjectDeleteEnqueue';
import { writeFreeSpaceObjectTombstone } from '../knowledge/tombstoneStore';
import { readLocalFreeSpaceObjectsForBoard } from './loadSectionFreeSpaceIndexSource';
import { projectFreeSpaceEntry, projectLiveBoardMissionControlItems } from './projectFreeSpace';
import { runMissionControlFreeSpaceFocus } from './runMissionControlFreeSpaceFocus';
import { MissionControlResourceRow } from '../../components/mission-control/MissionControlResourceRow';
import { FreeformBlock } from '../../components/canvas/FreeformBlock';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';

vi.mock('../supabase', () => ({ supabase: {} }));
vi.mock('../focusCache/freeSpaceObjectUpdateEnqueue', () => ({ enqueueFreeSpaceObjectUpdatesAfterLocalPersist: vi.fn() }));
vi.mock('../focusCache/freeSpaceObjectDeleteEnqueue', () => ({ enqueueFreeSpaceObjectDeletesAfterLocalDelete: vi.fn() }));
vi.mock('../knowledge/tombstoneStore', () => ({ writeFreeSpaceObjectTombstone: vi.fn() }));
vi.mock('../focusCache/freeSpaceObjectDeleteCancel', () => ({ cancelOrphanPendingFreeSpaceObjectWrites: vi.fn() }));

const sectionId = 'isolated-lifecycle-fixture';
const boardId = 'main';
const key = boardScopedFreeSpaceKeys(sectionId, boardId).objects;
const original: ProjectSpaceObject = {
  id: 'fixture-notebook', type: 'notebook', title: 'Original Notebook',
  content: { type: 'notebook', body: 'Known English שלום content\n**Formatted** $x$' },
  createdAt: 1, updatedAt: 2,
  geometry: { x: 20, y: 30, w: 400, h: 300, updatedAt: 2 },
};
let root: Root;
let host: HTMLDivElement;
let store: SectionFreeSpaceObjectsState;
const flush = vi.fn(async () => true);
const deleteAction = vi.fn();
function Probe() {
  store = useSectionFreeSpaceObjects(sectionId, boardId);
  return <>{store.objects.filter(isObjectActive).map(object => (
    <FreeformBlock key={object.id} id={object.id} label={object.title}
      pos={{ x: 20, y: 30, w: 400, h: 300 }} tokens={{} as AtmosphereTokens}
      selected designMode isDragging={false} onBlockMouseDown={() => {}} onSelect={() => {}}
      removeLabel="Close Notebook" onRemove={id => { void closeNotebook(id, { flush, update: store.updateObjectFields }); }}
      onDelete={deleteAction} onRename={id => store.updateObjectFields(id, { title: notebookTitle('Renamed שלום') })}>
      <div data-active-notebook>{object.content.type === 'notebook' && object.content.body}</div>
    </FreeformBlock>
  ))}</>;
}
function mount() { act(() => root.render(<Probe />)); }
function disk() { return JSON.parse(localStorage.getItem(key)!)[0] as ProjectSpaceObject; }
async function click(label: string) {
  await act(async () => { (host.querySelector(`[aria-label="${label}"]`) as HTMLButtonElement).click(); });
  act(() => flushAllFreeSpacePersistence());
}
function refresh() {
  act(() => root.unmount());
  root = createRoot(host);
  mount();
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks(); flush.mockResolvedValue(true);
  localStorage.clear(); localStorage.setItem(key, JSON.stringify([original]));
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); localStorage.clear(); });

describe('Notebook lifecycle through existing object persistence', () => {
  it('missing or unknown lifecycle metadata remains active', () => {
    expect(isObjectActive(normalizeProjectSpaceObject(original)!)).toBe(true);
    expect(isObjectActive(normalizeProjectSpaceObject({ ...original, lifecycleState: 'invalid' })!)).toBe(true);
    mount(); expect(host.querySelector('[data-active-notebook]')).not.toBeNull();
  });
  it('actual X closes once, hides the canvas block and retains persisted content/geometry', async () => {
    mount(); await click('Close Notebook');
    expect(flush).toHaveBeenCalledTimes(1);
    expect(disk().lifecycleState).toBe('closed');
    expect(disk().content).toEqual(store.objects[0].content);
    expect(disk().content.type === 'notebook' && disk().content.body).toBe(original.content.type === 'notebook' && original.content.body);
    expect(disk().geometry).toEqual(original.geometry);
    expect(host.querySelector('[data-active-notebook]')).toBeNull();
    expect(store.objects).toHaveLength(1);
  });
  it('Safe Close never invokes Delete, a tombstone or the cloud delete enqueue', async () => {
    mount(); await click('Close Notebook');
    expect(deleteAction).not.toHaveBeenCalled();
    expect(writeFreeSpaceObjectTombstone).not.toHaveBeenCalled();
    expect(enqueueFreeSpaceObjectDeletesAfterLocalDelete).not.toHaveBeenCalled();
    expect(enqueueFreeSpaceObjectUpdatesAfterLocalPersist).toHaveBeenCalled();
    const args = vi.mocked(enqueueFreeSpaceObjectUpdatesAfterLocalPersist).mock.calls.at(-1)!;
    expect(args[1].objects[0].lifecycleState).toBe('closed');
  });
  it('closed state survives remount and remains in the Mission Control source', async () => {
    mount(); await click('Close Notebook'); refresh();
    expect(host.querySelector('[data-active-notebook]')).toBeNull();
    const objects = readLocalFreeSpaceObjectsForBoard(sectionId, boardId);
    expect(objects).toHaveLength(1);
    const item = projectFreeSpaceEntry(sectionId, { boardId, object: objects[0] })!;
    expect(item.lifecycleState).toBe('closed'); expect(item.category).toBe('notebook');
    expect(item.openAction).toEqual({ type: 'freespace-focus', objectId: original.id, boardId });
  });
  it('reopen restores active workspace access, title and content through refresh', async () => {
    mount(); await click('Rename Notebook'); await click('Close Notebook');
    act(() => { expect(reopenNotebook(store.objects[0], store.updateObjectFields)).toBe(true); });
    act(() => flushAllFreeSpacePersistence()); refresh();
    expect(isObjectActive(store.objects[0])).toBe(true);
    expect(host.querySelector('[data-active-notebook]')?.textContent).toContain('Known English שלום');
    expect(store.objects[0].title).toBe('Renamed שלום');
    expect(projectFreeSpaceEntry(sectionId, { boardId, object: store.objects[0] })?.title).toBe('Renamed שלום');
    expect(writeFreeSpaceObjectTombstone).not.toHaveBeenCalled();
  });
  it('does not rewrite already active objects during Open', () => {
    const update = vi.fn(); expect(reopenNotebook(original, update)).toBe(false); expect(update).not.toHaveBeenCalled();
  });
  it('failed handwriting save leaves the Notebook active', async () => {
    mount(); flush.mockResolvedValue(false);
    await expect(closeNotebook(original.id, { flush, update: store.updateObjectFields })).rejects.toThrow('Notebook save failed');
    expect(isObjectActive(store.objects[0])).toBe(true); expect(isObjectActive(disk())).toBe(true);
  });
  it('Delete remains a distinct explicit control and never calls Safe Close', async () => {
    mount(); await click('Delete Notebook');
    expect(deleteAction).toHaveBeenCalledExactlyOnceWith(original.id);
    expect(flush).not.toHaveBeenCalled(); expect(isObjectActive(disk())).toBe(true);
  });
  it('blank names retain a sensible Notebook fallback', () => {
    expect(notebookTitle('  ')).toBe('Notebook'); expect(notebookTitle('  Notes  ')).toBe('Notes');
  });
  it.each(['closed', 'active'] as const)('existing cloud JSON payload and LWW round-trip %s', state => {
    const object = { ...original, lifecycleState: state, updatedAt: 20 };
    const payload = buildFreeSpaceObjectWritePayload(boardId, object) as unknown as { object: ProjectSpaceObject };
    const cloud = normalizeProjectSpaceObject(payload.object)!;
    const merged = mergeIncomingFreeSpaceObject({ local: original, cloud, protectedEntityIds: new Set() }).nextObject;
    expect(isObjectActive(merged)).toBe(state === 'active');
    expect(merged.content).toEqual(normalizeProjectSpaceObject(original)!.content);
  });
  it.each(['pdf', 'sheet', 'image'] as const)('legacy %s remains active and is not reopened as a Notebook', type => {
    const object = normalizeProjectSpaceObject({ ...original, type, content: { type } })!;
    expect(isObjectActive(object)).toBe(true);
    const update = vi.fn(); expect(reopenNotebook({ ...object, lifecycleState: 'closed' }, update)).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });
  it('Mission Control shows name, type, context, Closed and a single-fire Reopen', async () => {
    const item = { ...projectFreeSpaceEntry(sectionId, { boardId, object: { ...original, lifecycleState: 'closed' } })!, workspaceContext: 'Calculus' };
    const open = vi.fn();
    act(() => root.render(<MissionControlResourceRow item={item} menuOpen={false} onMenuOpenChange={() => {}} onOpen={open} onShowInWorkspace={() => {}} />));
    expect(host.textContent).toContain('Original Notebook'); expect(host.textContent).toContain('Notebook → Calculus');
    expect(host.textContent).toContain('Closed'); expect(host.textContent).not.toContain('Recently Deleted');
    await click('Reopen Original Notebook'); expect(open).toHaveBeenCalledExactlyOnceWith(item);
  });
  it('a pending editor content flush after close preserves closed state', async () => {
    mount(); await click('Close Notebook');
    act(() => store.updateObjectContent(original.id, { type: 'notebook', body: 'Last typed text שלום' }));
    act(() => flushAllFreeSpacePersistence()); refresh();
    expect(disk().lifecycleState).toBe('closed');
    expect(store.objects[0].content.type === 'notebook' && store.objects[0].content.body).toBe('Last typed text שלום');
    expect(host.querySelector('[data-active-notebook]')).toBeNull();
  });
  it('live Mission Control overlay updates name/state without duplicating or losing other boards', () => {
    const stale = projectFreeSpaceEntry(sectionId, { boardId, object: original })!;
    const other = projectFreeSpaceEntry(sectionId, { boardId: 'calculus', object: { ...original, id: 'other', lifecycleState: 'closed' } })!;
    const items = projectLiveBoardMissionControlItems({ items: [stale, other], sectionId, boardId,
      objects: [{ ...original, title: 'New name', lifecycleState: 'closed' }],
      boards: [{ id: 'main', name: 'Main' }, { id: 'calculus', name: 'Calculus' }], sectionTitle: 'Course',
    });
    expect(items).toHaveLength(2);
    expect(items.find(item => item.sourceId === original.id)).toMatchObject({ title: 'New name', lifecycleState: 'closed', workspaceContext: 'Main' });
    expect(items.find(item => item.sourceId === 'other')).toMatchObject({ lifecycleState: 'closed', workspaceContext: 'Calculus' });
  });
  it('cross-board Open defers presentation and reopens the target after it becomes available', () => {
    const floating = vi.fn(); const focus = vi.fn(); const queued = vi.fn();
    expect(runMissionControlFreeSpaceFocus({ objectId: original.id, boardId: 'calculus' }, {
      activeBoardId: 'main', focusNotebook: focus, queueFloatingPresentation: queued, setPresentationModeFloating: floating,
    })).toBe('pending-board-switch');
    expect(floating).not.toHaveBeenCalled(); expect(focus).toHaveBeenCalledExactlyOnceWith(original.id, 'calculus');
    const update = vi.fn();
    expect(reopenNotebook({ ...original, lifecycleState: 'closed' }, update)).toBe(true);
    expect(update).toHaveBeenCalledExactlyOnceWith(original.id, { lifecycleState: 'active' });
  });

});
