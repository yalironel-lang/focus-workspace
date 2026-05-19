import { useCallback, useState } from 'react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import type { ProjectObjectContent, MistakeConfidence } from '../../hooks/useSectionFreeSpaceObjects';

type MistakeBody = Extract<ProjectObjectContent, { type: 'mistake' }>;

interface Props {
  title: string;
  content: MistakeBody;
  tokens: AtmosphereTokens;
  linkedSourceTitle?: string | null;
  linkedNotebookTitle?: string | null;
  needsReview?: boolean;
  reviewLabel?: string;
  onChange: (c: MistakeBody) => void;
  onTitleChange?: (title: string) => void;
}

const CONF: { id: MistakeConfidence; label: string }[] = [
  { id: 'low', label: 'Fragile' },
  { id: 'medium', label: 'Settling' },
  { id: 'high', label: 'Solid' },
  { id: 'mastered', label: 'Quiet' },
];

function formatAgo(ts: number | null): string {
  if (ts == null) return 'never';
  const d = Math.floor((Date.now() - ts) / 86_400_000);
  if (d <= 0) return 'today';
  if (d === 1) return 'yesterday';
  return `${d} days ago`;
}

export function FreeSpaceMistakeCard({
  title,
  content,
  tokens,
  linkedSourceTitle,
  linkedNotebookTitle,
  needsReview = false,
  reviewLabel,
  onChange,
  onTitleChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const variant = content.variant === 'recall' ? 'recall' : 'mistake';
  const isRecall = variant === 'recall';

  const patch = useCallback((p: Partial<MistakeBody>) => {
    onChange({ ...content, ...p });
  }, [content, onChange]);

  const markReviewed = useCallback(() => {
    onChange({
      ...content,
      timesReviewed: content.timesReviewed + 1,
      lastReviewedAt: Date.now(),
    });
  }, [content, onChange]);

  const parseTags = (raw: string): string[] => {
    const parts = raw.split(/[,;]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
    const seen = new Set<string>();
    const out: string[] = [];
    for (const p of parts) {
      if (seen.has(p)) continue;
      seen.add(p);
      out.push(p);
    }
    return out;
  };

  const field = (label: string, children: React.ReactNode) => (
    <div style={{ marginBottom: 10 }}>
      <div
        style={{
          fontSize: '9px',
          fontWeight: 700,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: `${tokens.accent}99`,
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );

  return (
    <div
      style={{
        padding: '14px 16px 12px',
        minHeight: 120,
        background: isRecall
          ? `linear-gradient(165deg, ${tokens.accent}12 0%, transparent 48%)`
          : `linear-gradient(165deg, rgba(180,40,40,0.05) 0%, transparent 46%)`,
        borderTop: isRecall
          ? `1px solid ${tokens.accent}26`
          : `1px solid rgba(248,113,113,0.12)`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
        <div
          style={{
            fontSize: '9px',
            fontWeight: 700,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: isRecall ? `${tokens.accent}b5` : `${tokens.accent}99`,
          }}
        >
          {isRecall ? 'Recall item' : 'Mistake'}
        </div>
        {needsReview ? (
          <span
            style={{
              fontSize: 9,
              fontWeight: 750,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: tokens.accent,
              padding: '2px 7px',
              borderRadius: 6,
              border: `1px solid ${tokens.accent}44`,
              background: `${tokens.accent}14`,
            }}
          >
            Needs review
          </span>
        ) : null}
      </div>
      {(linkedSourceTitle || linkedNotebookTitle) && (
        <p style={{ margin: '0 0 8px', fontSize: 10.5, color: tokens.textMuted, lineHeight: 1.4 }}>
          {linkedSourceTitle ? (
            <span>
              Linked source · <span style={{ color: tokens.textSecondary }}>{linkedSourceTitle}</span>
            </span>
          ) : null}
          {linkedSourceTitle && linkedNotebookTitle ? ' · ' : null}
          {linkedNotebookTitle ? (
            <span>
              From notebook · <span style={{ color: tokens.textSecondary }}>{linkedNotebookTitle}</span>
            </span>
          ) : null}
        </p>
      )}
      <input
        value={title}
        onChange={e => onTitleChange?.(e.target.value)}
        placeholder={isRecall ? 'Recall prompt' : 'Mistake title'}
        className="w-full bg-transparent outline-none font-semibold text-sm mb-2"
        style={{ color: tokens.textPrimary, caretColor: tokens.accent }}
      />

      {field(
        isRecall ? 'Prompt' : 'What went wrong',
        <textarea
          value={content.whatWrong}
          onChange={e => patch({ whatWrong: e.target.value })}
          rows={3}
          placeholder={isRecall ? 'What do you want to remember or answer?' : 'The slip-up…'}
          className="w-full resize-none bg-transparent outline-none text-[13px] leading-relaxed rounded-lg px-2 py-1.5"
          style={{
            color: tokens.textPrimary,
            border: `1px solid ${isRecall ? tokens.cardBorder : tokens.cardBorderHover}`,
            fontFamily: "'Space Grotesk', system-ui, sans-serif",
          }}
        />,
      )}

      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="text-[10px] font-semibold mb-2"
        style={{ color: tokens.textMuted, letterSpacing: '0.06em' }}
      >
        {open
          ? '− Fewer details'
          : isRecall
            ? '+ Answer & notes'
            : '+ Correct understanding & why'}
      </button>

      {open ? (
        <>
          {field(
            isRecall ? 'Answer' : 'Correct understanding',
            <textarea
              value={content.correction}
              onChange={e => patch({ correction: e.target.value })}
              rows={2}
              placeholder={isRecall ? 'What should you recall?' : 'What is actually true…'}
              className="w-full resize-none bg-transparent outline-none text-[13px] leading-relaxed rounded-lg px-2 py-1.5"
              style={{
                color: tokens.textSecondary,
                border: `1px solid ${tokens.cardBorder}`,
                fontFamily: "'Space Grotesk', system-ui, sans-serif",
              }}
            />,
          )}
          {field(
            isRecall ? 'Notes' : 'Why it confused me',
            <textarea
              value={content.whyConfused}
              onChange={e => patch({ whyConfused: e.target.value })}
              rows={2}
              placeholder={isRecall ? 'Optional connection or context…' : 'The mix-up in your own words…'}
              className="w-full resize-none bg-transparent outline-none text-[13px] leading-relaxed rounded-lg px-2 py-1.5"
              style={{
                color: tokens.textMuted,
                border: `1px solid ${tokens.cardBorder}`,
                fontFamily: "'Space Grotesk', system-ui, sans-serif",
              }}
            />,
          )}
        </>
      ) : null}

      {field(
        'Tags',
        <input
          type="text"
          value={content.tags.join(', ')}
          onChange={e => patch({ tags: parseTags(e.target.value) })}
          placeholder="elasticity, units, sign…"
          className="w-full bg-transparent outline-none text-[12px] rounded-lg px-2 py-1"
          style={{ color: tokens.textSecondary, border: `1px solid ${tokens.cardBorder}` }}
        />,
      )}

      <div style={{ marginTop: 8, marginBottom: 8 }}>
        <div
          style={{
            fontSize: '9px',
            fontWeight: 700,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: `${tokens.accent}99`,
            marginBottom: 6,
          }}
        >
          Confidence
        </div>
        <div className="flex flex-wrap gap-1.5">
          {CONF.map(({ id, label }) => {
            const on = content.confidence === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => patch({ confidence: id })}
                className="px-2 py-1 rounded-lg text-[10px] font-semibold transition-colors"
                style={{
                  border: `1px solid ${on ? `${tokens.accent}55` : tokens.cardBorderHover}`,
                  backgroundColor: on ? `${tokens.accent}22` : 'transparent',
                  color: on ? tokens.textPrimary : tokens.textMuted,
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div
        className="flex items-center justify-between gap-2 pt-1"
        style={{ borderTop: `1px solid ${tokens.divider}` }}
      >
        <div style={{ fontSize: '10px', color: tokens.textMuted }}>
          {reviewLabel ?? `${isRecall ? 'Revisited' : 'Seen'} ${content.timesReviewed}× · last ${formatAgo(content.lastReviewedAt)}`}
        </div>
        <button
          type="button"
          onClick={markReviewed}
          className="px-2.5 py-1 rounded-lg text-[10px] font-semibold"
          style={{
            backgroundColor: `${tokens.accent}20`,
            color: tokens.accent,
            border: `1px solid ${tokens.accent}35`,
          }}
        >
          {isRecall ? 'Recalled now' : 'Reviewed now'}
        </button>
      </div>
    </div>
  );
}
