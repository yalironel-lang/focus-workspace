import { useCallback, useEffect, useState } from 'react';
import { History, RotateCcw, X } from 'lucide-react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import { restoreNotebookSnapshot } from '../../lib/knowledge/knowledgeRestore';
import { deleteNotebookSnapshot, listNotebookSnapshots } from '../../lib/knowledge/notebookSnapshotStore';
import type { NotebookSnapshot } from '../../lib/knowledge/knowledgeTypes';
import toast from 'react-hot-toast';

interface Props {
  tokens: AtmosphereTokens;
  sectionId: string;
}

function formatSnapshotTime(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function previewBody(body: string): string {
  const line = body.split('\n').find(l => l.trim()) ?? '';
  return line.trim().slice(0, 72) || '(empty notebook)';
}

export function NotebookSnapshotsPanel({ tokens, sectionId }: Props) {
  const [rows, setRows] = useState<NotebookSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!sectionId) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const list = await listNotebookSnapshots(sectionId);
    setRows(list);
    setLoading(false);
  }, [sectionId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onRestore = useCallback(
    async (row: NotebookSnapshot) => {
      const ok = window.confirm(
        `Replace the current notebook "${row.objectTitle}" with this snapshot from ${formatSnapshotTime(row.createdAt)}?`,
      );
      if (!ok) return;
      setBusyId(row.id);
      try {
        const result = await restoreNotebookSnapshot(row);
        if (!result.ok) {
          toast(result.reason, { duration: 4500 });
          return;
        }
        toast.success('Notebook restored. Reloading…');
        window.setTimeout(() => window.location.reload(), 350);
      } catch {
        toast('Restore failed. Try again.', { duration: 4000 });
      } finally {
        setBusyId(null);
      }
    },
    [],
  );

  const onDelete = useCallback(
    async (row: NotebookSnapshot) => {
      setBusyId(row.id);
      try {
        await deleteNotebookSnapshot(row.id);
        await refresh();
      } finally {
        setBusyId(null);
      }
    },
    [refresh],
  );

  const border = tokens.cardBorder;
  const well = tokens.wellBg;

  if (loading) {
    return (
      <p className="text-[12px] m-0" style={{ color: tokens.textGhost }}>
        Loading notebook snapshots…
      </p>
    );
  }

  if (rows.length === 0) {
    return (
      <p className="text-[12px] m-0" style={{ color: tokens.textMuted }}>
        No notebook snapshots yet. Snapshots are saved automatically while you edit (every ~40 edits or 2 minutes).
      </p>
    );
  }

  return (
    <ul className="list-none m-0 p-0 space-y-2 max-h-48 overflow-y-auto">
      {rows.map(row => (
        <li
          key={row.id}
          className="rounded-xl px-3 py-2 flex items-center justify-between gap-2"
          style={{ backgroundColor: well, border: `1px solid ${border}` }}
        >
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-medium m-0 truncate" style={{ color: tokens.textPrimary }}>
              {row.objectTitle}
            </p>
            <p className="text-[11px] m-0 truncate" style={{ color: tokens.textGhost }}>
              {formatSnapshotTime(row.createdAt)} · {previewBody(row.body)}
            </p>
          </div>
          <div className="flex gap-1.5 shrink-0">
            <button
              type="button"
              disabled={busyId === row.id}
              title="Restore snapshot"
              onClick={() => void onRestore(row)}
              className="p-1.5 rounded-lg disabled:opacity-40"
              style={{ color: tokens.textPrimary, border: `1px solid ${border}` }}
            >
              <RotateCcw className="w-3.5 h-3.5" strokeWidth={2} />
            </button>
            <button
              type="button"
              disabled={busyId === row.id}
              title="Delete snapshot"
              onClick={() => void onDelete(row)}
              className="p-1.5 rounded-lg disabled:opacity-40"
              style={{ color: tokens.textMuted, border: `1px solid ${border}` }}
            >
              <X className="w-3.5 h-3.5" strokeWidth={2} />
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

interface SectionProps {
  tokens: AtmosphereTokens;
  sectionId: string;
}

export function NotebookSnapshotsSection({ tokens, sectionId }: SectionProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <History className="w-3.5 h-3.5" strokeWidth={2} style={{ color: tokens.textMuted }} />
        <h3 className="text-[12px] font-semibold m-0" style={{ color: tokens.textSecondary }}>
          Notebook snapshots
        </h3>
      </div>
      <NotebookSnapshotsPanel tokens={tokens} sectionId={sectionId} />
    </div>
  );
}
