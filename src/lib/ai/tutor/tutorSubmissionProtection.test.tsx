/** @vitest-environment happy-dom */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import * as gateway from '../gatewayClient';
import { useStandaloneTutor } from './useStandaloneTutor';
import { ContextualTutorCard } from '../../../components/project-space/ContextualTutorCard';
import type { AtmosphereTokens } from '../../../hooks/useAtmosphere';
import * as wireBudget from '../visualCapture/visualPayloadWireBudget';
import type { TutorCaptureIntent } from './tutorCaptureTypes';
import { writeTutorSession, readTutorSession } from './tutorSessionStorage';

vi.mock('../gatewayClient', async original => ({ ...await original<typeof import('../gatewayClient')>(), zikukAiRequest: vi.fn() }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const call = vi.mocked(gateway.zikukAiRequest);
const answer = { version: 1, ok: true, result: { type: 'ask_course', text: 'Synthetic answer', sources: [], knowledgeTier: 'general_academic' } } as const;
function deferred() {
  let resolve!: (value: any) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<any>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
let root: Root;
let host: HTMLDivElement;
let api: ReturnType<typeof useStandaloneTutor>;
function Harness({ section = 'section' }: { section?: string }) {
  api = useStandaloneTutor({ userId: 'user', sectionId: section, sourceObjectId: 'pdf' });
  return null;
}
beforeEach(() => {
  localStorage.clear(); call.mockReset();
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); });
async function mount(section = 'section') { await act(async () => root.render(createElement(Harness, { section }))); }

it('synchronously rejects two rapid direct calls and permits a later question', async () => {
  await mount(); const pending = deferred(); call.mockReturnValueOnce(pending.promise).mockResolvedValue(answer);
  let first!: Promise<void>;
  act(() => { first = api.sendQuestion('one', true); void api.sendQuestion('two', true); });
  expect(call).toHaveBeenCalledTimes(1);
  await act(async () => { pending.resolve(answer); await first; });
  await act(async () => api.sendQuestion('later'));
  expect(call).toHaveBeenCalledTimes(2);
});

it.each(['failure', 'throw', 'abort-error'] as const)('releases the guard after %s and permits explicit retry', async kind => {
  await mount();
  if (kind === 'failure') call.mockResolvedValueOnce({ version: 1, ok: false, error: { code: 'provider_unavailable', message: 'Synthetic failure' } });
  else call.mockRejectedValueOnce(kind === 'throw' ? new Error('Synthetic error') : new DOMException('Cancelled', 'AbortError'));
  call.mockResolvedValue(answer);
  await act(async () => api.sendQuestion('question', true));
  expect(api.status).toBe(kind === 'abort-error' ? 'idle' : 'error');
  await act(async () => api.retry());
  expect(call).toHaveBeenCalledTimes(2); expect(api.status).toBe('success');
});

it('permits an explicit retry after completion', async () => {
  await mount(); call.mockResolvedValue(answer);
  await act(async () => api.sendQuestion('question', true));
  await act(async () => api.retry());
  expect(call).toHaveBeenCalledTimes(2);
});

it.each(['abort', 'startNewThread', 'reset'] as const)('%s blocks overlap until cancellation settles and rejects a stale answer', async action => {
  await mount(); const pending = deferred(); call.mockReturnValueOnce(pending.promise).mockResolvedValue(answer);
  let first!: Promise<void>;
  act(() => { first = api.sendQuestion('old', true); });
  act(() => { api[action](); void api.sendQuestion('premature', true); });
  expect(call).toHaveBeenCalledTimes(1);
  expect(call.mock.calls[0][1]?.signal?.aborted).toBe(true);
  await act(async () => { pending.resolve(answer); await first; });
  expect(api.turns.some(t => t.role === 'assistant')).toBe(false);
  await act(async () => api.sendQuestion('new', true));
  expect(call).toHaveBeenCalledTimes(2); expect(api.status).toBe('success');
});

it('section switching rejects stale responses and stale persistence', async () => {
  await mount(); const pending = deferred(); call.mockReturnValueOnce(pending.promise).mockResolvedValue(answer);
  let first!: Promise<void>;
  act(() => { first = api.sendQuestion('old', true); });
  await mount('other');
  await act(async () => { pending.resolve(answer); await first; });
  expect(api.turns).toEqual([]);
  expect(readTutorSession('user', 'other', 'pdf')?.turns ?? []).toEqual([]);
  await act(async () => api.sendQuestion('new', true));
  expect(call.mock.calls[1][0]).toMatchObject({ sectionId: 'other' });
});

it('restoring an archived conversation prevents stale response insertion', async () => {
  await mount();
  writeTutorSession('user', 'section', 'pdf', { intent: null, turns: [], archivedThreads: [{ id: 'saved', mode: 'explain', createdAt: 1, turns: [{ id: 'a', role: 'assistant', content: 'Saved', timestamp: 1 }] }] });
  const pending = deferred(); call.mockReturnValueOnce(pending.promise);
  let first!: Promise<void>;
  act(() => { first = api.sendQuestion('old', true); });
  act(() => api.restoreArchivedThread('saved'));
  await act(async () => { pending.resolve(answer); await first; });
  expect(api.turns.map(t => t.content)).toEqual(['Saved']);
});

it('unmount aborts and a late result cannot persist an answer', async () => {
  await mount(); const pending = deferred(); call.mockReturnValueOnce(pending.promise);
  let first!: Promise<void>;
  act(() => { first = api.sendQuestion('old', true); });
  act(() => root.render(null));
  await act(async () => { pending.resolve(answer); await first; });
  expect(call.mock.calls[0][1]?.signal?.aborted).toBe(true);
  expect(readTutorSession('user', 'section', 'pdf')?.turns.some(t => t.role === 'assistant') ?? false).toBe(false);
});

it.each(['initial', 'followup', 'followup-enter-and-submit'] as const)('rapid %s UI entry points dispatch once', async variant => {
  if (variant !== 'initial') writeTutorSession('user', 'section', 'pdf', { intent: null, turns: [
    { id: 'u', role: 'user', content: 'Previous question', timestamp: 1 },
    { id: 'a', role: 'assistant', content: 'Previous answer', timestamp: 2 },
  ] });
  const pending = deferred(); call.mockReturnValue(pending.promise);
  await act(async () => root.render(createElement(ContextualTutorCard, {
    tokens: {} as AtmosphereTokens, userId: 'user', sectionId: 'section', sourceObjectId: 'pdf', visiblePage: 2,
    pdfTitle: 'Synthetic.pdf', onClose: () => {}, embedded: false,
  })));
  const field = host.querySelector<HTMLInputElement | HTMLTextAreaElement>(variant === 'initial' ? '[data-testid="tutor-initial-question-input"]' : '[data-testid="tutor-followup-input"]')!;
  expect(field).not.toBeNull();
  act(() => {
    const proto = field.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(field, 'Synthetic question');
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const form = field.closest('form')!;
  act(() => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    if (variant === 'followup-enter-and-submit') field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    else form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  expect(call).toHaveBeenCalledTimes(1);
  await act(async () => pending.resolve(answer));
});

it('retry and another submission in the same tick share the guard', async () => {
  await mount(); call.mockResolvedValueOnce({ version: 1, ok: false, error: { code: 'provider_unavailable', message: 'Synthetic' } });
  await act(async () => api.sendQuestion('failed', true));
  const pending = deferred(); call.mockReturnValueOnce(pending.promise);
  act(() => { api.retry(); void api.sendQuestion('other'); });
  expect(call).toHaveBeenCalledTimes(2);
  await act(async () => pending.resolve(answer));
  expect(api.status).toBe('success');
});

it('cancelling during asynchronous visual preparation prevents Gateway dispatch', async () => {
  const pending = deferred();
  vi.spyOn(wireBudget, 'fitVisualRequestToWireBudget').mockReturnValue(pending.promise);
  const intent: TutorCaptureIntent = {
    action: 'explain', mode: 'explain', attachment: {
      sourceKind: 'free_space_pdf', sourceObjectId: 'pdf', sectionId: 'section', pageNumber: 2,
      regionNorm: { x: 0, y: 0, w: 1, h: 1 }, attachmentType: 'visual_selection', extractedText: '',
      visual: { mime: 'image/jpeg', imageBase64: 'AA==', widthPx: 1, heightPx: 1 },
    },
  };
  function VisualHarness() {
    api = useStandaloneTutor({ userId: 'user', sectionId: 'section', sourceObjectId: 'pdf', initialIntent: intent });
    return null;
  }
  await act(async () => root.render(createElement(VisualHarness)));
  let first!: Promise<void>;
  act(() => { first = api.sendQuestion('visual', true); });
  act(() => { api.startNewThread(); void api.sendQuestion('overlap', true); });
  await act(async () => { pending.resolve({ ok: false, message: 'Synthetic size error' }); await first; });
  expect(call).not.toHaveBeenCalled();
  expect(api.status).toBe('idle'); expect(api.turns).toEqual([]);
  act(() => api.setAttachmentAttached(false));
  call.mockResolvedValue(answer);
  await act(async () => api.sendQuestion('later', true));
  expect(call).toHaveBeenCalledTimes(1);
});
