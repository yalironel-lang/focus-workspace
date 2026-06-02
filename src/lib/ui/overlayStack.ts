type EscapeHandlerEntry = {
  id: number;
  onEscape: () => void;
};

let nextEscapeHandlerId = 1;
const escapeHandlers: EscapeHandlerEntry[] = [];
let escapeListenerAttached = false;

let bodyScrollLockCount = 0;
let previousBodyOverflow: string | null = null;

function ensureEscapeListener() {
  if (escapeListenerAttached || typeof window === 'undefined') return;
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    const top = escapeHandlers[escapeHandlers.length - 1];
    if (!top) return;
    e.preventDefault();
    top.onEscape();
  };
  window.addEventListener('keydown', onKey);
  escapeListenerAttached = true;
}

export function pushEscapeHandler(onEscape: () => void): () => void {
  const id = nextEscapeHandlerId++;
  escapeHandlers.push({ id, onEscape });
  ensureEscapeListener();
  return () => {
    const idx = escapeHandlers.findIndex(h => h.id === id);
    if (idx >= 0) escapeHandlers.splice(idx, 1);
  };
}

export function acquireBodyScrollLock(): () => void {
  if (typeof document === 'undefined') return () => {};
  if (bodyScrollLockCount === 0) {
    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  bodyScrollLockCount += 1;
  let released = false;
  return () => {
    if (released || typeof document === 'undefined') return;
    released = true;
    bodyScrollLockCount = Math.max(0, bodyScrollLockCount - 1);
    if (bodyScrollLockCount === 0) {
      document.body.style.overflow = previousBodyOverflow ?? '';
      previousBodyOverflow = null;
    }
  };
}
