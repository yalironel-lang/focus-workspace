import { memo, type CSSProperties } from 'react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import type { InlineMark } from '../../lib/notebookInlineMarks';

interface EditableLineProps {
  id: string;
  text: string;
  marks?: InlineMark[];
  tokens: AtmosphereTokens;
  placeholder: string;
  style: CSSProperties;
  onUpdate: (id: string, raw: string, marks?: InlineMark[]) => void;
  onFocusIndex: (id: string) => void;
  onAfterInput?: (el: HTMLDivElement) => void;
  onSelectionChange?: (id: string, el: HTMLDivElement) => void;
}

interface StepBlock {
  id: string;
  kind: 'step';
  text: string;
  marks?: InlineMark[];
}

interface Props {
  block: StepBlock;
  /** 1-based position among consecutive step blocks (resets after any non-step block) */
  stepIndex: number;
  /** True if this is the first step in a consecutive sequence (preceded by non-step or start) */
  isFirst?: boolean;
  /** True if this is the last step in a consecutive sequence (followed by non-step or end) */
  isLast?: boolean;
  /** Wired for future focus-mode fading; intentionally unused in v1 */
  isFocused: boolean;
  tokens: AtmosphereTokens;
  ink: { primary: string };
  typeScale: { l3: number; l5: number; s2: number; s3: number };
  morphPulse?: boolean;
  blockSurfaceChrome: CSSProperties;
  EditableLine: React.ComponentType<EditableLineProps>;
  onUpdate: (id: string, raw: string) => void;
  onFocusIndex: (id: string) => void;
  onAfterInput?: (el: HTMLDivElement) => void;
  onSelectionChange?: (id: string, el: HTMLDivElement) => void;
}

export const StepBlockRenderer = memo(function StepBlockRenderer({
  block,
  // stepIndex kept in interface for future use; not rendered (no numbered cards)
  // isFocused intentionally unused — available for future focus-mode fading
  isFirst = true,
  isLast = true,
  tokens,
  ink,
  typeScale,
  morphPulse,
  blockSurfaceChrome,
  EditableLine,
  onUpdate,
  onFocusIndex,
  onAfterInput,
  onSelectionChange,
}: Props) {
  const sequenceGap = `${typeScale.s2 + 8}px`;
  return (
    <div
      data-nb-surface-block
      data-block-id={block.id}
      data-nb-pulse={morphPulse ? '1' : undefined}
      style={{
        ...blockSurfaceChrome,
        // Breathing room only at sequence boundaries — zero gap between consecutive steps
        marginTop: isFirst ? sequenceGap : '1px',
        marginBottom: isLast ? sequenceGap : '0',
        display: 'flex',
        alignItems: 'baseline',
        paddingLeft: '18px',
        paddingTop: isFirst ? '5px' : '2px',
        paddingBottom: isLast ? '5px' : '2px',
        // Whisper rail: marks the derivation column without creating a bordered section
        borderLeft: `2px solid ${tokens.accent}22`,
      }}
    >
      <EditableLine
        id={block.id}
        text={block.text}
        marks={block.marks}
        tokens={tokens}
        placeholder="…"
        onUpdate={onUpdate}
        onFocusIndex={onFocusIndex}
        onAfterInput={onAfterInput}
        onSelectionChange={onSelectionChange}
        style={{
          flex: 1,
          border: 'none',
          outline: 'none',
          background: 'transparent',
          color: ink.primary,
          fontSize: `${typeScale.l3}px`,
          fontWeight: 400,
          lineHeight: 1.84,
          margin: 0,
          caretColor: tokens.accent,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      />
    </div>
  );
});
