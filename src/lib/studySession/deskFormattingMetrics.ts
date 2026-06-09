import type { ToolbarCommand } from '../notebookSelectionToolbar';
import { nbToolbarDebug } from '../notebookToolbarDebug';

const STORAGE_KEY = 'fw_desk_formatting_metrics_v1';

export interface DeskFormattingMetricsSnapshot {
  commandCount: number;
  fontSizeByPx: Record<string, number>;
  clearFormattingCount: number;
  updatedAt: string;
}

function emptySnapshot(): DeskFormattingMetricsSnapshot {
  return {
    commandCount: 0,
    fontSizeByPx: {},
    clearFormattingCount: 0,
    updatedAt: new Date().toISOString(),
  };
}

function load(): DeskFormattingMetricsSnapshot {
  try {
    if (typeof localStorage === 'undefined') return emptySnapshot();
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptySnapshot();
    const parsed = JSON.parse(raw) as Partial<DeskFormattingMetricsSnapshot>;
    return {
      commandCount: typeof parsed.commandCount === 'number' ? parsed.commandCount : 0,
      fontSizeByPx:
        parsed.fontSizeByPx && typeof parsed.fontSizeByPx === 'object'
          ? { ...parsed.fontSizeByPx }
          : {},
      clearFormattingCount:
        typeof parsed.clearFormattingCount === 'number' ? parsed.clearFormattingCount : 0,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
    };
  } catch {
    return emptySnapshot();
  }
}

function save(snapshot: DeskFormattingMetricsSnapshot): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    nbToolbarDebug('desk-format-metric', snapshot);
  } catch {
    /* quota / private mode */
  }
}

/** Lightweight local counters for Desk Formatting V1 experiment (Study Session desk only). */
export function recordDeskFormattingMetric(cmd: ToolbarCommand): void {
  const snap = load();
  if (cmd.type === 'clearFormatting') {
    snap.clearFormattingCount += 1;
  } else if (cmd.type === 'setFontSize') {
    snap.commandCount += 1;
    const key = String(cmd.px);
    snap.fontSizeByPx[key] = (snap.fontSizeByPx[key] ?? 0) + 1;
  } else if (cmd.type === 'toggleMark' && (cmd.mark === 'b' || cmd.mark === 'i' || cmd.mark === 'u')) {
    snap.commandCount += 1;
  }
  snap.updatedAt = new Date().toISOString();
  save(snap);
}

export function readDeskFormattingMetrics(): DeskFormattingMetricsSnapshot {
  return load();
}
