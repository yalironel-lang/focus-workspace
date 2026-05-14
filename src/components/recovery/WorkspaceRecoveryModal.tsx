import { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import { clearFreeSpacePersistenceForSection } from '../../lib/freeSpacePersistence';
import { deleteAllPdfBlobsForSection } from '../../lib/freeSpacePdfIdb';
import { runSectionPersistenceHealth } from '../../lib/persistenceHealth';
import {
  applyWorkspaceBackupToSection,
  buildWorkspaceBackupV1,
  downloadWorkspaceBackupJson,
  validateWorkspaceBackup,
} from '../../lib/workspaceBackup';
import toast from 'react-hot-toast';

interface Props {
  open: boolean;
  onClose: () => void;
  tokens: AtmosphereTokens;
  sectionId: string;
  sectionTitle?: string;
}

export function WorkspaceRecoveryModal({ open, onClose, tokens, sectionId, sectionTitle }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [lastNote, setLastNote] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);

  const onExport = useCallback(async () => {
    if (!sectionId) return;
    setBusy(true);
    setLastNote(null);
    try {
      const backup = await buildWorkspaceBackupV1(sectionId, { sectionTitle });
      downloadWorkspaceBackupJson(backup);
      toast.success('Backup downloaded');
      setLastNote('JSON file includes Free Space layout and local PDFs when present. API keys are never included.');
    } catch {
      toast('Could not build a backup. Try again after a moment.', { duration: 4000 });
    } finally {
      setBusy(false);
    }
  }, [sectionId, sectionTitle]);

  const onPickImport = useCallback(() => {
    fileRef.current?.click();
  }, []);

  const onImportFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file || !sectionId) return;

      const ok = window.confirm(
        'Replace all Free Space data, canvas layout, and local PDF files for this workspace with the contents of this backup? This cannot be undone.',
      );
      if (!ok) return;

      setBusy(true);
      setLastNote(null);
      try {
        const text = await file.text();
        let parsed: unknown;
        try {
          parsed = JSON.parse(text) as unknown;
        } catch {
          toast('That file is not valid JSON.', { duration: 4500 });
          setBusy(false);
          return;
        }
        const v = validateWorkspaceBackup(parsed);
        if (!v.ok) {
          toast(v.message, { duration: 5000 });
          setBusy(false);
          return;
        }
        await applyWorkspaceBackupToSection(v.backup, sectionId);
        toast.success('Backup restored. Reloading…');
        window.setTimeout(() => window.location.reload(), 400);
      } catch {
        toast('Import could not finish. Nothing was changed.', { duration: 4500 });
      } finally {
        setBusy(false);
      }
    },
    [sectionId],
  );

  const onRepair = useCallback(() => {
    if (!sectionId) return;
    setBusy(true);
    setLastNote(null);
    try {
      const r = runSectionPersistenceHealth(sectionId);
      const summary = r.messages.join(' ');
      setLastNote(summary);
      toast(r.wrote ? 'Local data was repaired where needed.' : 'Check complete.', { duration: 3800 });
    } finally {
      setBusy(false);
    }
  }, [sectionId]);

  const onResetFreeSpace = useCallback(async () => {
    if (!sectionId) return;
    const ok = window.confirm(
      'Remove every Free Space object, layout, canvas view, and stored PDF for this workspace? Your tasks and lanes stay in the cloud. This cannot be undone.',
    );
    if (!ok) return;
    setBusy(true);
    try {
      clearFreeSpacePersistenceForSection(sectionId);
      await deleteAllPdfBlobsForSection(sectionId);
      toast.success('Free Space cleared. Reloading…');
      window.setTimeout(() => window.location.reload(), 400);
    } catch {
      toast('Reset could not finish. Try again.', { duration: 4000 });
      setBusy(false);
    }
  }, [sectionId]);

  if (!open) return null;

  const border = tokens.cardBorder;
  const well = tokens.wellBg;

  return (
    <div
      className="fixed inset-0 z-[325] flex items-center justify-center p-4"
      role="dialog"
      aria-modal
      aria-labelledby="fw-recovery-title"
    >
      <button
        type="button"
        className="absolute inset-0"
        style={{ backgroundColor: 'rgba(4,8,16,0.72)', backdropFilter: 'blur(6px)' }}
        aria-label="Close recovery"
        onClick={onClose}
      />
      <div
        className="relative w-full max-w-md rounded-2xl overflow-hidden flex flex-col max-h-[90vh]"
        style={{
          backgroundColor: 'rgba(12,16,28,0.96)',
          border: `1px solid ${border}`,
          boxShadow: '0 24px 80px rgba(0,0,0,0.55)',
        }}
      >
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: `1px solid ${border}` }}
        >
          <h2 id="fw-recovery-title" className="text-sm font-semibold m-0" style={{ color: tokens.textPrimary }}>
            Workspace recovery
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg"
            style={{ color: tokens.textGhost }}
            aria-label="Close"
          >
            <X className="w-4 h-4" strokeWidth={2} />
          </button>
        </div>

        <div className="px-4 py-4 space-y-3 overflow-y-auto">
          <p className="text-[12px] leading-relaxed m-0" style={{ color: tokens.textMuted }}>
            Export a backup, import an earlier snapshot, repair local storage, or clear only Free Space on this device.
          </p>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              disabled={busy || !sectionId}
              onClick={() => void onExport()}
              className="w-full text-left px-3 py-2.5 rounded-xl text-[13px] font-medium transition-colors disabled:opacity-40"
              style={{ backgroundColor: well, color: tokens.textPrimary, border: `1px solid ${border}` }}
            >
              Export backup…
            </button>
            <button
              type="button"
              disabled={busy || !sectionId}
              onClick={onPickImport}
              className="w-full text-left px-3 py-2.5 rounded-xl text-[13px] font-medium transition-colors disabled:opacity-40"
              style={{ backgroundColor: well, color: tokens.textPrimary, border: `1px solid ${border}` }}
            >
              Import backup…
            </button>
            <button
              type="button"
              disabled={busy || !sectionId}
              onClick={onRepair}
              className="w-full text-left px-3 py-2.5 rounded-xl text-[13px] font-medium transition-colors disabled:opacity-40"
              style={{ backgroundColor: well, color: tokens.textPrimary, border: `1px solid ${border}` }}
            >
              Repair local data
            </button>
            <button
              type="button"
              disabled={busy || !sectionId}
              onClick={() => void onResetFreeSpace()}
              className="w-full text-left px-3 py-2.5 rounded-xl text-[13px] font-medium transition-colors disabled:opacity-40"
              style={{ backgroundColor: well, color: tokens.textSecondary, border: `1px solid ${border}` }}
            >
              Reset current Free Space…
            </button>
          </div>

          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={e => void onImportFile(e)}
          />

          {lastNote ? (
            <p className="text-[11px] leading-snug m-0" style={{ color: tokens.textGhost }}>
              {lastNote}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
