import { useCallback, useEffect, useState } from 'react';
import { RotateCcw, Trash2 } from 'lucide-react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import { restoreFromTombstone } from '../../lib/knowledge/knowledgeRestore';
import { deleteTombstonePermanently, listTombstones } from '../../lib/knowledge/tombstoneStore';
import type { KnowledgeTombstone } from '../../lib/knowledge/knowledgeTypes';
import toast from 'react-hot-toast';

interface Props {
  tokens: AtmosphereTokens;
  /** When set, only tombstones for this workspace are shown. */
  sectionId?: string;
  /** Map sectionId → display title for cross-workspace view */
  sectionTitles?: Record<string, string>;
  onRestoreComplete?: () => void;
}

function formatDeletedAt(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 2) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

function tombstoneKindLabel(t: KnowledgeTombstone): string {
  if (t.kind === 'notebook_block') return 'Notebook block';
  return t.objectType || 'Object';
}

export function RecentlyDeletedPanel({
  tokens,
  sectionId,
  sectionTitles,
  onRestoreComplete,
}: Props) {
  const [rows, setRows] = useState<KnowledgeTombstone[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const list = await listTombstones(sectionId);
    setRows(list);
    setLoading(false);
  }, [sectionId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onRestore = useCallback(
    async (row: KnowledgeTombstone) => {
      setBusyId(row.id);
      try {
        const result = await restoreFromTombstone(row);
        if (!result.ok) {
          toast(result.reason, { duration: 4500 });
          return;
        }
        toast.success('Restored. Reloading…');
        onRestoreComplete?.();
        window.setTimeout(() => window.location.reload(), 350);
      } catch {
        toast('Restore failed. Try again.', { duration: 4000 });
      } finally {
        setBusyId(null);
      }
    },
    [onRestoreComplete],
  );

  const onPermanentDelete = useCallback(
    async (row: KnowledgeTombstone) => {
      const ok = window.confirm('Permanently delete this item from recovery? This cannot be undone.');
      if (!ok) return;
      setBusyId(row.id);
      try {
        await deleteTombstonePermanently(row);
        await refresh();
        toast.success('Removed from recently deleted');
      } catch {
        toast('Could not remove item.', { duration: 4000 });
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
        Loading recently deleted…
      </p>
    );
  }

  if (rows.length === 0) {
    return (
      <p className="text-[12px] m-0" style={{ color: tokens.textMuted }}>
        Nothing in recently deleted. Deleted objects and notebook blocks are kept for 30 days.
      </p>
    );
  }

  return (
    <ul className="list-none m-0 p-0 space-y-2">
      {rows.map(row => {
        const workspaceLabel =
          !sectionId && sectionTitles?.[row.sectionId]
            ? sectionTitles[row.sectionId]
            : !sectionId
              ? row.sectionId.slice(0, 8)
              : null;
        return (
          <li
            key={row.id}
            className="rounded-xl px-3 py-2.5 flex flex-col gap-2"
            style={{ backgroundColor: well, border: `1px solid ${border}` }}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[13px] font-medium m-0 truncate" style={{ color: tokens.textPrimary }}>
                  {row.label}
                </p>
                <p className="text-[11px] m-0 mt-0.5" style={{ color: tokens.textGhost }}>
                  {tombstoneKindLabel(row)} · {formatDeletedAt(row.deletedAt)}
                  {workspaceLabel ? ` · ${workspaceLabel}` : ''}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busyId === row.id}
                onClick={() => void onRestore(row)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-medium disabled:opacity-40"
                style={{
                  backgroundColor: tokens.accentSubtle,
                  color: tokens.textPrimary,
                  border: `1px solid ${border}`,
                }}
              >
                <RotateCcw className="w-3 h-3" strokeWidth={2} />
                Restore
              </button>
              <button
                type="button"
                disabled={busyId === row.id}
                onClick={() => void onPermanentDelete(row)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-medium disabled:opacity-40"
                style={{ color: tokens.textMuted, border: `1px solid ${border}` }}
              >
                <Trash2 className="w-3 h-3" strokeWidth={2} />
                Delete forever
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
