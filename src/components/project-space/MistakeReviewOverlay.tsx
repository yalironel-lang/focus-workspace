import { useCallback, useEffect, useMemo } from 'react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import type { ProjectSpaceObject } from '../../hooks/useSectionFreeSpaceObjects';
import { ensureProjectObjectContent, coerceFreeSpaceConnectionIds } from '../../hooks/useSectionFreeSpaceObjects';
import type { MistakeInsight } from '../../lib/mistakeIntelligence';

interface Props {
  open: boolean;
  tokens: AtmosphereTokens;
  objects: ProjectSpaceObject[];
  queueIds: string[];
  index: number;
  setIndex: (i: number) => void;
  insights: MistakeInsight[];
  onClose: () => void;
  onMarkReviewed: (id: string) => void;
}

export function MistakeReviewOverlay({
  open,
  tokens,
  objects,
  queueIds,
  index,
  setIndex,
  insights,
  onClose,
  onMarkReviewed,
}: Props) {
  const id = queueIds[index] ?? null;
  const obj = id ? objects.find(o => o.id === id) : undefined;

  const relatedMistakeIds = useMemo(() => {
    if (!id || !obj || obj.type !== 'mistake') return [];
    const set = new Set<string>();
    const neigh = coerceFreeSpaceConnectionIds(obj.connections);
    for (const nid of neigh) {
      const t = objects.find(o => o.id === nid);
      if (t?.type === 'mistake' && nid !== id) set.add(nid);
    }
    for (const ins of insights) {
      if (ins.relatedIds.includes(id)) {
        for (const r of ins.relatedIds) {
          if (r !== id && objects.some(o => o.id === r && o.type === 'mistake')) set.add(r);
        }
      }
    }
    return [...set].slice(0, 6);
  }, [id, obj, objects, insights]);

  const go = useCallback(
    (delta: number) => {
      if (queueIds.length === 0) return;
      const n = (index + delta + queueIds.length) % queueIds.length;
      setIndex(n);
    },
    [queueIds.length, index, setIndex],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'ArrowRight' || (e.key === ' ' && !e.shiftKey)) {
        e.preventDefault();
        go(1);
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        go(-1);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onClose, go]);

  if (!open) return null;

  const body =
    obj && obj.type === 'mistake'
      ? ensureProjectObjectContent('mistake', obj.content)
      : null;
  const m = body?.type === 'mistake' ? body : null;

  return (
    <div
      className="fixed inset-0 z-[290] flex flex-col items-center justify-center px-4 py-8"
      style={{ backgroundColor: 'rgba(4,8,16,0.72)', backdropFilter: 'blur(8px)' }}
      role="dialog"
      aria-modal
      aria-label="Mistake review"
    >
      <div
        className="w-full max-w-lg rounded-2xl overflow-hidden flex flex-col max-h-[min(86vh,640px)]"
        style={{
          backgroundColor: 'rgba(12,16,28,0.92)',
          border: `1px solid ${tokens.cardBorder}`,
          boxShadow: `0 24px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04) inset`,
        }}
        onMouseDown={e => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: `1px solid rgba(255,255,255,0.06)` }}
        >
          <span className="text-[11px] font-semibold tracking-widest uppercase" style={{ color: tokens.textGhost }}>
            Mistake review
          </span>
          <span className="text-[10px] tabular-nums" style={{ color: tokens.textMuted }}>
            {queueIds.length ? index + 1 : 0} / {queueIds.length}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-[11px] font-semibold px-2 py-1 rounded-lg"
            style={{ color: tokens.textGhost }}
          >
            Esc
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {!m || !obj ? (
            <p className="text-sm" style={{ color: tokens.textMuted }}>
              Nothing in this queue right now.
            </p>
          ) : (
            <>
              <h2 className="text-base font-semibold mb-3" style={{ color: tokens.textPrimary }}>
                {obj.title}
              </h2>
              <div className="space-y-4 text-[13px] leading-relaxed" style={{ color: tokens.textSecondary }}>
                <div>
                  <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: `${tokens.accent}aa` }}>
                    What went wrong
                  </div>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{m.whatWrong || '—'}</div>
                </div>
                {m.correction ? (
                  <div>
                    <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: tokens.textGhost }}>
                      Correct understanding
                    </div>
                    <div style={{ whiteSpace: 'pre-wrap' }}>{m.correction}</div>
                  </div>
                ) : null}
                {m.whyConfused ? (
                  <div>
                    <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: tokens.textGhost }}>
                      Why it confused me
                    </div>
                    <div style={{ whiteSpace: 'pre-wrap' }}>{m.whyConfused}</div>
                  </div>
                ) : null}
              </div>

              {relatedMistakeIds.length > 0 ? (
                <div className="mt-6 pt-4" style={{ borderTop: `1px solid rgba(255,255,255,0.06)` }}>
                  <div className="text-[10px] uppercase tracking-wider mb-2" style={{ color: tokens.textGhost }}>
                    Nearby in memory
                  </div>
                  <div className="relative h-[72px] rounded-xl overflow-hidden" style={{ backgroundColor: 'rgba(0,0,0,0.2)' }}>
                    <div
                      className="absolute rounded-full"
                      style={{
                        width: 10,
                        height: 10,
                        left: '50%',
                        top: '50%',
                        transform: 'translate(-50%, -50%)',
                        backgroundColor: tokens.accent,
                        opacity: 0.85,
                        boxShadow: `0 0 12px ${tokens.accent}66`,
                      }}
                    />
                    {relatedMistakeIds.map((rid, i) => {
                      const ang = (i / relatedMistakeIds.length) * Math.PI * 2;
                      const r = 26;
                      const cx = 50 + Math.cos(ang) * r;
                      const cy = 50 + Math.sin(ang) * r;
                      return (
                        <div
                          key={rid}
                          className="absolute rounded-full"
                          style={{
                            width: 6,
                            height: 6,
                            left: `${cx}%`,
                            top: `${cy}%`,
                            transform: 'translate(-50%, -50%)',
                            backgroundColor: 'rgba(255,255,255,0.25)',
                          }}
                        />
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>

        <div
          className="px-4 py-3 flex flex-wrap gap-2 justify-between items-center"
          style={{ borderTop: `1px solid rgba(255,255,255,0.06)` }}
        >
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => go(-1)}
              disabled={queueIds.length < 2}
              className="px-3 py-1.5 rounded-lg text-[11px] font-semibold disabled:opacity-35"
              style={{ backgroundColor: tokens.wellBg, color: tokens.textSecondary }}
            >
              ←
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              disabled={queueIds.length < 2}
              className="px-3 py-1.5 rounded-lg text-[11px] font-semibold disabled:opacity-35"
              style={{ backgroundColor: tokens.wellBg, color: tokens.textSecondary }}
            >
              Space →
            </button>
          </div>
          {id ? (
            <button
              type="button"
              onClick={() => onMarkReviewed(id)}
              className="px-4 py-2 rounded-xl text-[11px] font-semibold"
              style={{
                backgroundColor: `${tokens.accent}24`,
                color: tokens.accent,
                border: `1px solid ${tokens.accent}40`,
              }}
            >
              Mark reviewed
            </button>
          ) : null}
        </div>

        {insights.length > 0 ? (
          <div className="px-4 py-2 max-h-[88px] overflow-y-auto" style={{ backgroundColor: 'rgba(0,0,0,0.15)' }}>
            {insights.slice(0, 3).map(ins => (
              <div key={ins.id} className="text-[10px] py-1 leading-snug" style={{ color: tokens.textMuted }}>
                {ins.message}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
