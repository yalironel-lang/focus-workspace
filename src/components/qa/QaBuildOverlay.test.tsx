/**
 * The ink QA badge stays off unless someone explicitly opts in.
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QaBuildOverlay } from './QaBuildOverlay';
import { FW_QA_MODE_KEY } from '../../lib/qaMode';
import { buildInkQaExportPayload } from '../../lib/qaInkPanelMetrics';

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function mount() {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(createElement(QaBuildOverlay));
  });
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  host?.remove();
  host = null;
  localStorage.removeItem(FW_QA_MODE_KEY);
  window.history.replaceState({}, '', '/');
});

describe('QA overlay visibility', () => {
  it('stays hidden in a normal session, including local development', () => {
    localStorage.removeItem(FW_QA_MODE_KEY);
    window.history.replaceState({}, '', '/section/sec-1');
    mount();
    expect(document.querySelector('[data-fw-qa-overlay]')).toBeNull();
  });

  it('appears for an explicit ?qa=1 or stored QA flag', () => {
    window.history.replaceState({}, '', '/section/sec-1?qa=1');
    mount();
    expect(document.querySelector('[data-fw-qa-overlay]')).toBeTruthy();
    act(() => {
      root?.unmount();
    });
    root = null;
    host?.remove();
    window.history.replaceState({}, '', '/section/sec-1');
    localStorage.setItem(FW_QA_MODE_KEY, '1');
    mount();
    expect(document.querySelector('[data-fw-qa-overlay]')).toBeTruthy();
  });

  it('exports stroke metrics only', () => {
    const payload = buildInkQaExportPayload('abc', 'dev', null, []);
    expect(Object.keys(payload).sort()).toEqual(
      ['build', 'exportedAt', 'gates', 'lastStroke', 'recentStrokes'].sort(),
    );
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toMatch(/notebook|password|token|email|filename/i);
  });
});
