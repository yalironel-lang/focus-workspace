/**
 * P0 remaining freeze — More menu must not setPos-storm on scroll.
 * After fix: scroll closes the menu (no per-tick position React updates).
 *
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { NotebookTiptapProductMoreMenu } from '../components/notebook/tiptap/NotebookTiptapProductMoreMenu';
import {
  nbP0ForensicsReset,
  nbP0ForensicsSnapshot,
} from './notebookP0Forensics';

(globalThis as { __NB_P0_FORENSICS__?: boolean }).__NB_P0_FORENSICS__ = true;

function flush() {
  return new Promise<void>(r => setTimeout(r, 0));
}

describe('P0 remaining — More menu scroll close (no setPos storm)', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    nbP0ForensicsReset();
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
      configurable: true,
      value() {
        return {
          x: 100,
          y: 40,
          top: 40,
          left: 100,
          bottom: 70,
          right: 130,
          width: 30,
          height: 30,
          toJSON() {
            return {};
          },
        };
      },
    });
  });

  afterEach(() => {
    root.unmount();
    host.remove();
    nbP0ForensicsReset();
  });

  it('open More + scroll → menu closes; pos state updates stay bounded', async () => {
    await act(async () => {
      root.render(
        createElement(NotebookTiptapProductMoreMenu, {
          onCustomizeNotebook: () => {},
          onExportPdf: () => {},
        }),
      );
    });
    await flush();

    const trigger = host.querySelector('[data-nb-product-more="1"]') as HTMLButtonElement;
    await act(async () => {
      trigger.click();
    });
    await flush();
    expect(document.querySelector('[data-nb-product-more-menu="1"]')).toBeTruthy();

    const before = nbP0ForensicsSnapshot();
    const posBefore = before.moreMenuPosStateUpdates;

    await act(async () => {
      window.dispatchEvent(new Event('scroll'));
    });
    await flush();
    await flush();

    expect(document.querySelector('[data-nb-product-more-menu="1"]')).toBeNull();

    const after = nbP0ForensicsSnapshot();
    // Scroll may bump moreMenuScrollRepositions once (close path), but must not
    // flood pos state updates for dozens of ticks.
    expect(after.moreMenuPosStateUpdates - posBefore).toBeLessThanOrEqual(1);

    // Further scrolls while closed must not reposition.
    nbP0ForensicsReset();
    for (let i = 0; i < 50; i++) window.dispatchEvent(new Event('scroll'));
    await flush();
    const idle = nbP0ForensicsSnapshot();
    expect(idle.moreMenuPosStateUpdates).toBe(0);
    expect(idle.moreMenuRepositions).toBe(0);
  });
});
