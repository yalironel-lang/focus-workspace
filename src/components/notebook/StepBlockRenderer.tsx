import { memo, type CSSProperties } from 'react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';

interface EditableLineProps {
  id: string;
  text: string;
  tokens: AtmosphereTokens;
  placeholder: string;
  style: CSSProperties;
  onUpdate: (id: string, raw: string) => void;
  onFocusIndex: (id: string) => void;
  onAfterInput?: (el: HTMLDivElement) => void;
}

interface StepBlock {
  id: string;
  kind: 'step';
  text: string;
}

interface Props {
  block: StepBlock;
  /** 1-based position among consecutive step blocks (resets after any non-step block) */
  stepIndex: number;
  /** Wired now for future focus-mode fading; intentionally unused in v1 */
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
}

export const StepBlockRenderer = memo(function StepBlockRenderer({
  block,
  stepIndex,
  // isFocused intentionally unused — available for future focus-mode fading
  tokens,
  ink,
  typeScale,
  morphPulse,
  blockSurfaceChrome,
  EditableLine,
  onUpdate,
  onFocusIndex,
  onAfterInput,
}: Props) {
  return (
    <div
      data-nb-surface-block
      data-block-id={block.id}
      data-nb-pulse={morphPulse ? '1' : undefined}
      style={{
        ...blockSurfaceChrome,
        margin: `${typeScale.s2 + 8}px 0`,
        display: 'flex',
        alignItems: 'baseline',
        gap: '14px',
        paddingLeft: '18px',
        paddingTop: '6px',
        paddingBottom: '6px',
        borderLeft: `2px solid ${tokens.accent}38`,
      }}
    >
      {/* Editorial margin marker — quiet, paper-like, not a primary label */}
      <span
        style={{
          fontSize: `${typeScale.l5 - 1}px`,
          fontWeight: 400,
          color: tokens.accent,
          opacity: 0.35,
          minWidth: '14px',
          userSelect: 'none',
          letterSpacing: '0.04em',
          fontVariantNumeric: 'tabular-nums',
          flexShrink: 0,
        }}
        aria-hidden
      >
        {stepIndex}
      </span>
      <EditableLine
        id={block.id}
        text={block.text}
        tokens={tokens}
        placeholder="Derivation step…"
        onUpdate={onUpdate}
        onFocusIndex={onFocusIndex}
        onAfterInput={onAfterInput}
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
