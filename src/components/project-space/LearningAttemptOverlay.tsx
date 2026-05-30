import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import type { ProjectSpaceObject } from '../../hooks/useSectionFreeSpaceObjects';
import {
  ensureProjectObjectContent,
  type ProjectObjectContent,
} from '../../hooks/useSectionFreeSpaceObjects';
import {
  applyAttemptFail,
  applyAttemptPass,
  applyRepairSaved,
  hasRepairLink,
  inferAnchorObjectId,
  inferSourceObjectIdForTarget,
  resolveAttemptPrompt,
  type LearningAttemptTarget,
} from '../../lib/learningLoop';
import { findLinkedNotebook, findLinkedSource } from '../../lib/studyConnections';
import { WorkspaceSurfaceErrorBoundary } from '../common/WorkspaceSurfaceErrorBoundary';

type Phase = 'try' | 'belief' | 'reveal' | 'done';

type MistakeBody = Extract<ProjectObjectContent, { type: 'mistake' }>;

interface Props {
  open: boolean;
  tokens: AtmosphereTokens;
  objects: ProjectSpaceObject[];
  target: LearningAttemptTarget | null;
  queueIds?: string[];
  queueIndex?: number;
  onClose: () => void;
  onUpdateMistake: (id: string, content: MistakeBody) => void;
  onPersistSourceAttempt?: (target: LearningAttemptTarget, patch: Partial<MistakeBody>) => void;
}

export function LearningAttemptOverlay({
  open,
  tokens,
  objects,
  target,
  queueIds = [],
  queueIndex = 0,
  onClose,
  onUpdateMistake,
  onPersistSourceAttempt,
}: Props) {
  const [phase, setPhase] = useState<Phase>('try');
  const [belief, setBelief] = useState('');
  const [draftCorrection, setDraftCorrection] = useState('');
  const [draftWhy, setDraftWhy] = useState('');

  const resolved = useMemo(
    () => (target ? resolveAttemptPrompt(target, objects) : null),
    [target, objects],
  );

  const mistakeObj = useMemo(() => {
    if (!target || target.kind !== 'mistake') return null;
    return objects.find(o => o.id === target.objectId) ?? null;
  }, [target, objects]);

  const mistakeBody = useMemo(() => {
    if (!mistakeObj || mistakeObj.type !== 'mistake') return null;
    const c = ensureProjectObjectContent('mistake', mistakeObj.content);
    return c.type === 'mistake' ? c : null;
  }, [mistakeObj]);

  const [doneMessage, setDoneMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setPhase('try');
    setBelief('');
    setDoneMessage(null);
    setDraftCorrection(mistakeBody?.correction ?? resolved?.hiddenAnswer ?? '');
    setDraftWhy(mistakeBody?.whyConfused ?? '');
  }, [open, target?.objectId, target?.kind, mistakeBody?.correction, mistakeBody?.whyConfused, resolved?.hiddenAnswer]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);

  const linkedSourceTitle = useMemo(() => {
    if (mistakeObj) {
      const s = findLinkedSource(mistakeObj, objects);
      if (s) return s.title;
    }
    if (target && target.kind !== 'mistake') {
      const o = objects.find(x => x.id === target.objectId);
      return o?.title ?? null;
    }
    return null;
  }, [mistakeObj, objects, target]);

  const linkedNotebookTitle = useMemo(() => {
    if (!mistakeObj) return null;
    const nb = findLinkedNotebook(mistakeObj, objects);
    return nb?.title ?? null;
  }, [mistakeObj, objects]);

  const repairLinked = mistakeObj ? hasRepairLink(mistakeObj, objects) : Boolean(target && target.kind !== 'mistake');

  const handlePass = useCallback(() => {
    if (!target) return;
    if (target.kind === 'mistake' && mistakeBody && mistakeObj) {
      const wasReAttempt = mistakeBody.pendingReAttempt === true;
      onUpdateMistake(mistakeObj.id, applyAttemptPass(mistakeBody));
      setDoneMessage(
        wasReAttempt
          ? 'Re-attempt passed. This confusion is closed.'
          : 'Attempt recorded. Keep practicing closed-book.',
      );
      setPhase('done');
      return;
    }
    onPersistSourceAttempt?.(target, {
      lastAttemptOutcome: 'pass',
      lastAttemptAt: Date.now(),
      loopOpen: false,
      pendingReAttempt: false,
      confidence: 'high',
    });
    setDoneMessage('Attempt recorded.');
    setPhase('done');
  }, [target, mistakeBody, mistakeObj, onUpdateMistake, onPersistSourceAttempt]);

  const handleMissed = useCallback(() => {
    setPhase('belief');
  }, []);

  const handleSubmitBelief = useCallback(() => {
    if (!belief.trim()) return;
    setDraftCorrection(prev => prev || resolved?.hiddenAnswer || '');
    setPhase('reveal');
  }, [belief, resolved?.hiddenAnswer]);

  const handleSaveRepair = useCallback(() => {
    if (!target) return;
    const correction = draftCorrection.trim();
    if (!correction && target.kind !== 'pdf' && target.kind !== 'studyfile') return;

    if (target.kind === 'mistake' && mistakeBody && mistakeObj) {
      const sourceId = mistakeBody.sourceObjectId ?? inferSourceObjectIdForTarget(target, objects);
      const anchorId = mistakeBody.anchorObjectId ?? inferAnchorObjectId(mistakeObj, objects);
      let next = applyAttemptFail(mistakeBody, belief);
      next = {
        ...next,
        correction: correction || next.correction,
        whyConfused: draftWhy.trim() || next.whyConfused,
        sourceObjectId: sourceId,
        anchorObjectId: anchorId,
      };
      next = applyRepairSaved(next);
      onUpdateMistake(mistakeObj.id, next);
      setDoneMessage('Repair saved. Pass a closed-book re-attempt to close this loop.');
      setPhase('done');
      return;
    }

    onPersistSourceAttempt?.(target, {
      whatWrong: resolved?.prompt ?? '',
      correction,
      whyConfused: draftWhy.trim() || belief.trim(),
      confusionBelief: belief.trim(),
      sourceObjectId: inferSourceObjectIdForTarget(target, objects),
      loopOpen: true,
      pendingReAttempt: true,
      repairedAt: Date.now(),
      lastAttemptOutcome: 'fail',
      lastAttemptAt: Date.now(),
    });
    setDoneMessage('Saved as a recall card. Re-attempt when ready.');
    setPhase('done');
  }, [
    target,
    belief,
    draftCorrection,
    draftWhy,
    mistakeBody,
    mistakeObj,
    objects,
    onUpdateMistake,
    onPersistSourceAttempt,
    resolved?.prompt,
  ]);

  if (!open || !target || !resolved) return null;

  const isRecall = resolved.isRecall;
  const queueLabel =
    queueIds.length > 1 ? `${queueIndex + 1} / ${queueIds.length}` : null;

  return (
    <div
      className="fixed inset-0 z-[295] flex flex-col items-center justify-center px-4 py-8"
      style={{ backgroundColor: 'rgba(4,8,16,0.78)', backdropFilter: 'blur(8px)' }}
      role="dialog"
      aria-modal
      aria-label="Learning attempt"
    >
      <div
        className="w-full max-w-lg rounded-2xl overflow-hidden flex flex-col max-h-[min(88vh,680px)]"
        style={{
          backgroundColor: 'rgba(12,16,28,0.94)',
          border: `1px solid ${tokens.cardBorder}`,
          boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
        }}
        onMouseDown={e => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between px-4 py-3 gap-3"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
        >
          <span className="text-[11px] font-semibold tracking-widest uppercase" style={{ color: tokens.accent }}>
            Closed-book attempt
          </span>
          {queueLabel ? (
            <span className="text-[10px] tabular-nums" style={{ color: tokens.textMuted }}>
              {queueLabel}
            </span>
          ) : null}
          <button type="button" onClick={onClose} className="text-[11px] font-semibold px-2 py-1" style={{ color: tokens.textGhost }}>
            Esc
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          <WorkspaceSurfaceErrorBoundary tokens={tokens} label="Learning attempt">
            <>
              <h2 className="text-base font-semibold mb-1" style={{ color: tokens.textPrimary }}>
                {resolved.title}
              </h2>
              {(linkedSourceTitle || linkedNotebookTitle) && (
                <p className="text-[11px] mb-4" style={{ color: tokens.textMuted }}>
                  {linkedSourceTitle ? `Source · ${linkedSourceTitle}` : null}
                  {linkedSourceTitle && linkedNotebookTitle ? ' · ' : null}
                  {linkedNotebookTitle ? `Notebook · ${linkedNotebookTitle}` : null}
                </p>
              )}

              {phase === 'try' && (
                <>
                  <p className="text-[10px] uppercase tracking-wider mb-2" style={{ color: tokens.textGhost }}>
                    {isRecall ? 'Prompt' : 'Question'}
                  </p>
                  <div
                    className="text-[14px] leading-relaxed mb-6 rounded-xl px-3 py-3"
                    style={{
                      color: tokens.textPrimary,
                      whiteSpace: 'pre-wrap',
                      border: `1px solid ${tokens.cardBorder}`,
                      background: `${tokens.wellBg}88`,
                    }}
                  >
                    {resolved.prompt || '—'}
                  </div>
                  <p className="text-[12px] mb-4 leading-relaxed" style={{ color: tokens.textSecondary }}>
                    Try from memory first. The answer stays hidden until you mark a miss.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handlePass}
                      className="px-4 py-2.5 rounded-xl text-[12px] font-semibold"
                      style={{
                        backgroundColor: `${tokens.accent}22`,
                        color: tokens.accent,
                        border: `1px solid ${tokens.accent}44`,
                      }}
                    >
                      I got it
                    </button>
                    <button
                      type="button"
                      onClick={handleMissed}
                      className="px-4 py-2.5 rounded-xl text-[12px] font-semibold"
                      style={{
                        backgroundColor: tokens.wellBg,
                        color: tokens.textSecondary,
                        border: `1px solid ${tokens.cardBorder}`,
                      }}
                    >
                      I missed it
                    </button>
                  </div>
                </>
              )}

              {phase === 'belief' && (
                <>
                  <p className="text-[12px] mb-3 leading-relaxed" style={{ color: tokens.textSecondary }}>
                    Before seeing the correction, write what you believed.
                  </p>
                  <label className="block text-[10px] uppercase tracking-wider mb-2" style={{ color: tokens.accent }}>
                    What did you believe?
                  </label>
                  <textarea
                    value={belief}
                    onChange={e => setBelief(e.target.value)}
                    rows={4}
                    autoFocus
                    placeholder="Your misconception or guess…"
                    className="w-full resize-none rounded-xl px-3 py-2.5 text-[13px] leading-relaxed outline-none mb-4"
                    style={{
                      color: tokens.textPrimary,
                      border: `1px solid ${tokens.cardBorder}`,
                      background: `${tokens.wellBg}66`,
                    }}
                  />
                  <button
                    type="button"
                    disabled={!belief.trim()}
                    onClick={handleSubmitBelief}
                    className="px-4 py-2.5 rounded-xl text-[12px] font-semibold disabled:opacity-40"
                    style={{
                      backgroundColor: tokens.accent,
                      color: '#0a0805',
                    }}
                  >
                    Continue to correction
                  </button>
                </>
              )}

              {phase === 'reveal' && (
                <>
                  <div className="mb-4 rounded-xl px-3 py-2.5" style={{ border: `1px solid ${tokens.accent}33`, background: `${tokens.accent}10` }}>
                    <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: tokens.accent }}>
                      What you believed
                    </div>
                    <div className="text-[13px]" style={{ color: tokens.textPrimary, whiteSpace: 'pre-wrap' }}>
                      {belief}
                    </div>
                  </div>
                  <label className="block text-[10px] uppercase tracking-wider mb-2" style={{ color: tokens.textGhost }}>
                    {isRecall ? 'Answer' : 'Correction'}
                  </label>
                  <textarea
                    value={draftCorrection}
                    onChange={e => setDraftCorrection(e.target.value)}
                    rows={3}
                    className="w-full resize-none rounded-xl px-3 py-2.5 text-[13px] leading-relaxed outline-none mb-3"
                    style={{
                      color: tokens.textSecondary,
                      border: `1px solid ${tokens.cardBorder}`,
                      background: 'transparent',
                    }}
                  />
                  <label className="block text-[10px] uppercase tracking-wider mb-2" style={{ color: tokens.textGhost }}>
                    Repair notes
                  </label>
                  <textarea
                    value={draftWhy}
                    onChange={e => setDraftWhy(e.target.value)}
                    rows={2}
                    placeholder="Why this fixes the gap…"
                    className="w-full resize-none rounded-xl px-3 py-2.5 text-[13px] leading-relaxed outline-none mb-4"
                    style={{
                      color: tokens.textMuted,
                      border: `1px solid ${tokens.cardBorder}`,
                      background: 'transparent',
                    }}
                  />
                  {!repairLinked ? (
                    <p className="text-[11px] mb-3" style={{ color: '#fbbf24' }}>
                      Link this card to a source or notebook on the canvas for a complete repair.
                    </p>
                  ) : null}
                  <button
                    type="button"
                    onClick={handleSaveRepair}
                    disabled={!draftCorrection.trim() && target.kind !== 'pdf' && target.kind !== 'studyfile'}
                    className="px-4 py-2.5 rounded-xl text-[12px] font-semibold disabled:opacity-40"
                    style={{
                      backgroundColor: `${tokens.accent}24`,
                      color: tokens.accent,
                      border: `1px solid ${tokens.accent}40`,
                    }}
                  >
                    Save repair — re-attempt required
                  </button>
                </>
              )}

              {phase === 'done' && (
                <div className="text-center py-4">
                  <p className="text-[14px] font-semibold mb-2" style={{ color: tokens.textPrimary }}>
                    {doneMessage ?? 'Attempt recorded.'}
                  </p>
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 rounded-xl text-[12px] font-semibold"
                    style={{ backgroundColor: tokens.wellBg, color: tokens.textSecondary }}
                  >
                    Done
                  </button>
                </div>
              )}
            </>
          </WorkspaceSurfaceErrorBoundary>
        </div>
      </div>
    </div>
  );
}
