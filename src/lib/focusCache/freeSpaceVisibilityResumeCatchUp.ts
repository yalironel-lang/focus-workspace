/**
 * PR C: hidden-tab resume catch-up.
 *
 * Background Chrome tabs can miss Realtime. On hidden → visible, run the
 * existing PR7 pull catch-up (same path as SUBSCRIBED). No second geometry bus.
 */

export type DocumentVisibilityStateLike = 'visible' | 'hidden' | 'prerender';

export function shouldRunFreeSpaceVisibilityResumeCatchUp(
  previousHidden: boolean,
  nextVisibilityState: DocumentVisibilityStateLike,
): boolean {
  return previousHidden && nextVisibilityState === 'visible';
}

export type FreeSpaceVisibilityResumeCatchUpInput = {
  isCurrent: () => boolean;
  /** Enqueue/run the existing catch-up pull. Must be a no-op when already queued. */
  runCatchUp: () => void;
  getVisibilityState?: () => DocumentVisibilityStateLike;
  addEventListener?: (type: 'visibilitychange', listener: () => void) => void;
  removeEventListener?: (type: 'visibilitychange', listener: () => void) => void;
};

/**
 * Coalesce overlapping resume catch-up requests while one is queued/in-flight.
 * Call `end()` when the catch-up task finishes (success, skip, or error).
 */
export function createCoalescedVisibilityResumeCatchUp(run: () => void): {
  request: () => void;
  end: () => void;
  isOutstanding: () => boolean;
} {
  let outstanding = false;
  return {
    request() {
      if (outstanding) return;
      outstanding = true;
      run();
    },
    end() {
      outstanding = false;
    },
    isOutstanding() {
      return outstanding;
    },
  };
}

/**
 * Attach a document visibility listener. Pulls only on hidden → visible
 * while `isCurrent()` is true. Does not pull on mount if already visible.
 */
export function attachFreeSpaceVisibilityResumeCatchUp(
  input: FreeSpaceVisibilityResumeCatchUpInput,
): () => void {
  const getState =
    input.getVisibilityState ??
    (() =>
      typeof document === 'undefined' ? 'visible' : document.visibilityState);
  const add =
    input.addEventListener ??
    ((type, listener) => {
      if (typeof document === 'undefined') return;
      document.addEventListener(type, listener);
    });
  const remove =
    input.removeEventListener ??
    ((type, listener) => {
      if (typeof document === 'undefined') return;
      document.removeEventListener(type, listener);
    });

  let previousHidden = getState() === 'hidden';

  const onVisibilityChange = () => {
    const next = getState();
    if (
      shouldRunFreeSpaceVisibilityResumeCatchUp(previousHidden, next) &&
      input.isCurrent()
    ) {
      input.runCatchUp();
    }
    previousHidden = next === 'hidden';
  };

  add('visibilitychange', onVisibilityChange);
  return () => {
    remove('visibilitychange', onVisibilityChange);
  };
}
