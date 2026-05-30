const REMOTE_INGEST =
  'http://127.0.0.1:7714/ingest/e6af15d9-7b0a-4fc6-884e-236751805517';
const SESSION_ID = '3f83e8';
const LS_KEY = 'nb-debug-3f83e8';

function ingestUrl(): string {
  if (import.meta.env.DEV) return '/__debug_ingest';
  return REMOTE_INGEST;
}

/** Runtime debug ingest for notebook toolbar investigation (debug session 3f83e8). */
export function nbAgentLog(
  location: string,
  message: string,
  data: Record<string, unknown>,
  hypothesisId: string,
  runId = 'pre-fix',
): void {
  const entry = {
    sessionId: SESSION_ID,
    location,
    message,
    data,
    hypothesisId,
    runId,
    timestamp: Date.now(),
  };
  const payload = JSON.stringify(entry);
  // #region agent log
  try {
    if (typeof localStorage !== 'undefined') {
      const prev: unknown[] = JSON.parse(localStorage.getItem(LS_KEY) ?? '[]');
      prev.push(entry);
      while (prev.length > 80) prev.shift();
      localStorage.setItem(LS_KEY, JSON.stringify(prev));
    }
  } catch {
    /* quota / private mode */
  }
  fetch(ingestUrl(), {
    method: 'POST',
    headers: import.meta.env.DEV
      ? { 'Content-Type': 'application/json' }
      : {
          'Content-Type': 'application/json',
          'X-Debug-Session-Id': SESSION_ID,
        },
    body: payload,
    keepalive: true,
  }).catch(() => {
    try {
      if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
        navigator.sendBeacon(ingestUrl(), payload);
      }
    } catch {
      /* ignore */
    }
  });
  try {
    if (typeof console !== 'undefined') {
      console.info('[nb-agent]', location, message, data);
    }
  } catch {
    /* ignore */
  }
  // #endregion
}

export function readNbAgentLogs(): unknown[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    return JSON.parse(localStorage.getItem(LS_KEY) ?? '[]');
  } catch {
    return [];
  }
}

export function clearNbAgentLogs(): void {
  try {
    localStorage.removeItem(LS_KEY);
  } catch {
    /* ignore */
  }
}

if (typeof window !== 'undefined') {
  (window as unknown as { __nbDebugDump?: () => unknown[] }).__nbDebugDump = readNbAgentLogs;
}

/** App-level traces — independent of React component mount/HMR state. */
function initNbGlobalDebugTraces(): void {
  if (!import.meta.env.DEV || typeof document === 'undefined') return;
  if ((window as unknown as { __nbGlobalTrace?: boolean }).__nbGlobalTrace) return;
  (window as unknown as { __nbGlobalTrace?: boolean }).__nbGlobalTrace = true;

  // #region agent log
  nbAgentLog(
    'global:init',
    'debug-traces-ready',
    { href: window.location.href, build: typeof __APP_BUILD_ID__ !== 'undefined' ? __APP_BUILD_ID__ : null },
    'init',
    'post-fix',
  );
  // #endregion

  let selThrottle: ReturnType<typeof setTimeout> | null = null;
  document.addEventListener('selectionchange', () => {
    const sel = window.getSelection();
    const text = sel?.toString() ?? '';
    if (!text || selThrottle) return;
    selThrottle = setTimeout(() => {
      selThrottle = null;
    }, 180);
    const anchorNode = sel?.anchorNode ?? null;
    const anchorEl =
      anchorNode instanceof Element ? anchorNode : anchorNode?.parentElement ?? null;
    const rich = anchorEl?.closest?.('[data-rich-editable="1"]') ?? null;
    const tiptap = anchorEl?.closest?.('[data-math-editor] .ProseMirror, [data-math-editor]') ?? null;
    // #region agent log
    nbAgentLog(
      'global:selectionchange',
      'non-empty-selection',
      {
        text: text.slice(0, 48),
        hasRichEditable: Boolean(rich),
        hasTiptapEditor: Boolean(tiptap),
        blockId: rich?.getAttribute('data-block-id') ?? null,
      },
      'trace',
      'post-fix',
    );
    // #endregion
  });

  document.addEventListener(
    'mousedown',
    (e) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      const btn = t.closest('.nb-toolbar-btn');
      const rich = t.closest('[data-rich-editable="1"]');
      const tiptapToolbar = t.closest('[data-nb-tiptap-format-toolbar="1"]');
      const richToolbar = t.closest('[data-nb-format-toolbar="1"]');
      if (!btn && !rich && !tiptapToolbar && !richToolbar) return;
      // #region agent log
      nbAgentLog(
        'global:mousedown',
        btn ? 'toolbar-btn' : rich ? 'rich-editable' : 'toolbar-root',
        {
          title: btn?.getAttribute('title') ?? null,
          hasTiptapToolbar: Boolean(tiptapToolbar),
          hasRichToolbar: Boolean(richToolbar),
          blockId: rich?.getAttribute('data-block-id') ?? null,
          domText: rich?.textContent?.slice(0, 60) ?? null,
        },
        btn ? 'A' : 'trace',
        'post-fix',
      );
      // #endregion
    },
    { capture: true },
  );

  document.addEventListener(
    'input',
    (e) => {
      const t = e.target;
      if (!(t instanceof Element) || !t.closest('[data-rich-editable="1"]')) return;
      // #region agent log
      nbAgentLog(
        'global:input',
        'rich-editable-input',
        {
          inputType: (e as InputEvent).inputType,
          data: (e as InputEvent).data ?? null,
          domText: t.textContent?.slice(0, 60) ?? '',
        },
        'C',
        'post-fix',
      );
      // #endregion
    },
    { capture: true },
  );
}

initNbGlobalDebugTraces();
