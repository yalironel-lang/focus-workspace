/**
 * WC-6A2 — Structured Student Work Question Navigation.
 * Quiet, compact, surface-local navigation toolbar rendered above the student notebook.
 *
 * Rules:
 * - Appears only when derivedQuestions.length >= 2.
 * - <= 8 questions: compact horizontal pill row (`Q1`, `Q2`...).
 * - > 8 questions: compact native select/dropdown (`Question 3 of 40`).
 * - Accessible: role="toolbar", aria-label="Notebook questions", semantic buttons / select.
 * - Minimum 44px touch targets on mobile/tablet.
 * - Never intercepts handwriting, never modifies document content.
 */

import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import type { DerivedQuestionSection } from '../../lib/academicComposition/questionSections';

interface Props {
  tokens: AtmosphereTokens;
  questions: DerivedQuestionSection[];
  activeQuestionNumber: number | null;
  onSelectQuestion: (questionNumber: number) => void;
  isNarrow?: boolean;
}

export function AcademicNotebookQuestionNav({
  tokens,
  questions,
  activeQuestionNumber,
  onSelectQuestion,
  isNarrow = false,
}: Props) {
  if (questions.length < 2) return null;

  const isDropdownMode = questions.length > 8;

  if (isDropdownMode) {
    const activeQ = questions.find(q => q.number === activeQuestionNumber);
    return (
      <div
        role="toolbar"
        aria-label="Notebook questions"
        data-testid="academic-notebook-question-nav"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: isNarrow ? '6px 12px' : '4px 10px',
          background: tokens.wellBg,
          borderBottom: `1px solid ${tokens.cardBorder}`,
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: tokens.textMuted,
            whiteSpace: 'nowrap',
          }}
        >
          Section:
        </span>
        <select
          aria-label="Jump to question"
          data-testid="academic-notebook-question-select"
          value={activeQuestionNumber ?? questions[0]!.number}
          onChange={e => onSelectQuestion(Number(e.target.value))}
          style={{
            fontSize: 12,
            fontWeight: 600,
            padding: isNarrow ? '6px 12px' : '3px 8px',
            borderRadius: 6,
            border: `1px solid ${tokens.cardBorder}`,
            background: tokens.cardBg,
            color: tokens.textPrimary,
            cursor: 'pointer',
            minHeight: isNarrow ? 44 : 28,
            outline: 'none',
          }}
        >
          {questions.map(q => (
            <option key={q.number} value={q.number}>
              {q.label} (of {questions.length})
            </option>
          ))}
        </select>
        {activeQ ? (
          <span
            style={{
              fontSize: 11,
              color: tokens.textSecondary,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {activeQ.label}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div
      role="toolbar"
      aria-label="Notebook questions"
      data-testid="academic-notebook-question-nav"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: isNarrow ? '6px 12px' : '4px 10px',
        background: tokens.wellBg,
        borderBottom: `1px solid ${tokens.cardBorder}`,
        flexShrink: 0,
        overflowX: 'auto',
        scrollbarWidth: 'none',
      }}
    >
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: tokens.textMuted,
          marginRight: 2,
          whiteSpace: 'nowrap',
        }}
      >
        Questions:
      </span>
      {questions.map(q => {
        const isActive = activeQuestionNumber === q.number;
        return (
          <button
            key={q.number}
            type="button"
            aria-pressed={isActive}
            aria-label={q.label}
            data-testid={`academic-question-btn-${q.number}`}
            onClick={() => onSelectQuestion(q.number)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: isNarrow ? 44 : 26,
              minWidth: isNarrow ? 44 : 32,
              padding: isNarrow ? '0 10px' : '2px 8px',
              borderRadius: 6,
              border: `1px solid ${isActive ? `${tokens.accent}66` : tokens.cardBorder}`,
              background: isActive ? `${tokens.accent}22` : tokens.cardBg,
              color: isActive ? tokens.accent : tokens.textSecondary,
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              touchAction: 'manipulation',
              transition: 'background 0.15s ease, color 0.15s ease, border 0.15s ease',
            }}
          >
            {`Q${q.number}`}
          </button>
        );
      })}
    </div>
  );
}
