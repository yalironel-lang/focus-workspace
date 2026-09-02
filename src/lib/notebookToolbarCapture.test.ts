import { describe, expect, it } from 'vitest';

/**
 * Documents why NotebookSelectionToolbar container must not stopPropagation
 * on capture — child ToolbarBtn handlers are registered on capture too.
 */
describe('toolbar capture propagation', () => {
  it('parent capture stopPropagation blocks child capture handlers', () => {
    const parent = document.createElement('div');
    const child = document.createElement('button');
    parent.appendChild(child);
    let childCapture = false;
    parent.addEventListener(
      'mousedown',
      (e) => {
        e.preventDefault();
        e.stopPropagation();
      },
      true,
    );
    child.addEventListener(
      'mousedown',
      () => {
        childCapture = true;
      },
      true,
    );
    child.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(childCapture).toBe(false);
  });

  it('parent capture preventDefault only allows child capture handlers', () => {
    const parent = document.createElement('div');
    const child = document.createElement('button');
    parent.appendChild(child);
    let childCapture = false;
    parent.addEventListener(
      'mousedown',
      (e) => {
        e.preventDefault();
      },
      true,
    );
    child.addEventListener(
      'mousedown',
      () => {
        childCapture = true;
      },
      true,
    );
    child.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(childCapture).toBe(true);
  });
});
