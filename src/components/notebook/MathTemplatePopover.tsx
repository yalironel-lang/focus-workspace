import { memo, useCallback, useEffect, useRef, useState } from 'react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import type { MathTemplateDef } from '../../lib/mathInputAssistant';
import { KatexPreview } from './KatexPreview';

interface Props {
  template: MathTemplateDef;
  tokens: AtmosphereTokens;
  textColor: string;
  onApply: (values: Record<string, string>) => void;
  onClose: () => void;
}

export const MathTemplatePopover = memo(function MathTemplatePopover({
  template,
  tokens,
  textColor,
  onApply,
  onClose,
}: Props) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(template.fields.map(f => [f.key, ''])),
  );
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstRef.current?.focus();
  }, [template.id]);

  const previewLatex = template.buildLatex(values);
  const gridCols = template.fields.length > 2 ? 2 : 1;

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      onApply(values);
      onClose();
    },
    [onApply, onClose, values],
  );

  return (
    <div
      role="dialog"
      aria-label={template.title}
      onMouseDown={e => e.stopPropagation()}
      style={{
        position: 'absolute',
        bottom: 'calc(100% + 4px)',
        right: 0,
        zIndex: 50,
        width: gridCols === 2 ? 228 : 196,
        padding: '8px 9px',
        borderRadius: 10,
        border: `1px solid ${tokens.cardBorder}`,
        background: `${tokens.cardBg}f2`,
        backdropFilter: 'blur(10px)',
        boxShadow: '0 6px 24px rgba(0,0,0,0.28)',
      }}
    >
      <form onSubmit={handleSubmit}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: gridCols === 2 ? '1fr 1fr' : '1fr',
            gap: 6,
            marginBottom: 6,
          }}
        >
          {template.fields.map((field, idx) => (
            <label
              key={field.key}
              style={{
                display: 'block',
                fontSize: 9,
                color: tokens.textMuted,
                fontWeight: 600,
                letterSpacing: '0.04em',
              }}
            >
              {field.label}
              <input
                ref={idx === 0 ? firstRef : undefined}
                type="text"
                value={values[field.key] ?? ''}
                placeholder={field.placeholder}
                onChange={e => setValues(v => ({ ...v, [field.key]: e.target.value }))}
                style={{
                  display: 'block',
                  width: '100%',
                  marginTop: 2,
                  padding: '4px 6px',
                  borderRadius: 5,
                  border: `1px solid ${tokens.cardBorder}`,
                  background: 'rgba(0,0,0,0.2)',
                  color: textColor,
                  fontSize: 11,
                  outline: 'none',
                }}
              />
            </label>
          ))}
        </div>
        <div
          className="math-nb-hero"
          style={{
            padding: '4px 2px 6px',
            marginBottom: 6,
            borderRadius: 6,
            background: 'rgba(0,0,0,0.12)',
          }}
        >
          <KatexPreview
            latex={previewLatex}
            displayMode
            hero
            textColor={textColor}
            mutedColor={tokens.textMuted}
          />
        </div>
        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              border: 'none',
              background: 'transparent',
              color: tokens.textMuted,
              borderRadius: 5,
              padding: '3px 6px',
              fontSize: 10,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            style={{
              border: 'none',
              background: tokens.accent,
              color: '#fff',
              borderRadius: 5,
              padding: '3px 8px',
              fontSize: 10,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Insert
          </button>
        </div>
      </form>
    </div>
  );
});
