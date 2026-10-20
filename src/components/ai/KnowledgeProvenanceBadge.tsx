import type { ContextAvailable, KnowledgeTier } from '../../lib/ai/gatewayClient';

const COPY: Record<KnowledgeTier, { label: string; title: string }> = {
  course_material: {
    label: 'Course material',
    title: 'The answer repeats wording from retrieved course material. Shared terms alone are not treated as verified grounding.',
  },
  pdf_selection: {
    label: 'Selected PDF',
    title: 'The answer repeats wording from the selected PDF text. Shared terms alone are not treated as verified grounding.',
  },
  general_academic: {
    label: 'General academic knowledge',
    title: 'Not attributed to your course materials or the selected PDF.',
  },
  mixed: {
    label: 'Mixed or uncertain',
    title: 'Attribution is uncertain. Distinctive-term overlap is not verified course or PDF grounding.',
  },
};

type Props = {
  tier: KnowledgeTier;
  contextAvailable?: ContextAvailable;
  color: string;
  borderColor: string;
};

export function KnowledgeProvenanceBadge({ tier, contextAvailable, color, borderColor }: Props) {
  const copy = COPY[tier];
  const notes: string[] = [];
  if (tier === 'general_academic' && contextAvailable?.hasPdfCapture) {
    notes.push('A PDF selection was attached and is not the source of this answer.');
  }
  if (tier === 'general_academic' && contextAvailable?.hasIndexedChunks) {
    notes.push('Course passages were retrieved and are not the source of this answer.');
  }
  const title = [copy.title, ...notes].join(' ');

  return (
    <div
      data-testid="knowledge-provenance"
      data-ask-zikuk-knowledge-tier={tier}
      title={title}
      style={{
        marginTop: 10,
        display: 'inline-flex',
        alignItems: 'center',
        maxWidth: '100%',
        fontSize: 12,
        lineHeight: 1.35,
        color,
        padding: '4px 10px',
        borderRadius: 6,
        background: `${borderColor}22`,
        border: `1px solid ${borderColor}44`,
        cursor: 'help',
      }}
    >
      <span>{copy.label}</span>
    </div>
  );
}
