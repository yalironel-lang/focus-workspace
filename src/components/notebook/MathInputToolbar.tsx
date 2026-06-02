import { Fragment, memo, useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import {
  MATH_TEMPLATES,
  MATH_TOOLBAR_GROUPS,
  QUICK_MATH_SYMBOLS,
  buildSimpleDefault,
  getMathTemplate,
  type MathTemplateId,
} from '../../lib/mathInputAssistant';
import { MathTemplatePopover } from './MathTemplatePopover';

interface Props {
  tokens: AtmosphereTokens;
  textColor: string;
  variant?: 'spatial' | 'desk-paper';
  onInsertSymbol: (text: string) => void;
  onApplyTemplate: (templateId: MathTemplateId, values: Record<string, string>) => void;
}

const btnStyle = (tokens: AtmosphereTokens): CSSProperties => ({
  border: `1px solid ${tokens.cardBorder}`,
  background: 'rgba(255,255,255,0.04)',
  color: tokens.textPrimary,
  borderRadius: 6,
  minWidth: 26,
  height: 24,
  padding: '0 5px',
  fontSize: 11,
  fontWeight: 600,
  cursor: 'pointer',
  lineHeight: 1,
});

export const MathInputToolbar = memo(function MathInputToolbar({
  tokens,
  textColor,
  variant = 'spatial',
  onInsertSymbol,
  onApplyTemplate,
}: Props) {
  const [openTemplate, setOpenTemplate] = useState<MathTemplateId | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const isDeskPaper = variant === 'desk-paper';

  const closePopover = useCallback(() => setOpenTemplate(null), []);

  useEffect(() => {
    if (!openTemplate) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        closePopover();
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [openTemplate, closePopover]);

  const activeDef = openTemplate ? getMathTemplate(openTemplate) : undefined;

  const insertDefaultTemplate = useCallback(
    (id: MathTemplateId) => {
      onInsertSymbol(buildSimpleDefault(id));
    },
    [onInsertSymbol],
  );

  if (isDeskPaper) {
    return (
      <div
        className="desk-math-palette desk-math-palette--strip"
        ref={wrapRef}
        data-math-input-toolbar="1"
        role="toolbar"
        aria-label="Math tools"
      >
        <div className="desk-math-palette__strip">
          {MATH_TOOLBAR_GROUPS.map((group, groupIndex) => (
            <Fragment key={group.id}>
              {groupIndex > 0 ? <span className="desk-math-palette__sep" aria-hidden /> : null}
              {group.templates?.map(templateId => {
                const t = getMathTemplate(templateId);
                if (!t) return null;
                const isLim = templateId === 'limit';
                return (
                  <div key={templateId} className="desk-math-palette__btn-wrap">
                    <button
                      type="button"
                      className={`desk-math-palette__btn${isLim ? ' desk-math-palette__btn--lim' : ''}${
                        openTemplate === templateId ? ' desk-math-palette__btn--active' : ''
                      }`}
                      title={`Insert ${t.title}`}
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => insertDefaultTemplate(templateId)}
                    >
                      {t.label}
                    </button>
                    <button
                      type="button"
                      className="desk-math-palette__btn desk-math-palette__btn--chevron"
                      title={`Customize ${t.title}`}
                      aria-label={`Customize ${t.title}`}
                      onMouseDown={e => e.preventDefault()}
                      onClick={() =>
                        setOpenTemplate(prev => (prev === templateId ? null : templateId))
                      }
                    >
                      ▾
                    </button>
                    {openTemplate === templateId && activeDef?.id === templateId ? (
                      <MathTemplatePopover
                        template={activeDef}
                        tokens={tokens}
                        textColor={textColor}
                        onApply={values => onApplyTemplate(templateId, values)}
                        onClose={closePopover}
                      />
                    ) : null}
                  </div>
                );
              })}
              {group.symbols?.map(s => (
                <button
                  key={s.insert}
                  type="button"
                  className="desk-math-palette__btn"
                  title={s.title ?? s.label}
                  onMouseDown={e => {
                    e.preventDefault();
                    onInsertSymbol(s.insert);
                  }}
                >
                  {s.label}
                </button>
              ))}
            </Fragment>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 8 }}>
      <p
        style={{
          margin: '0 0 5px',
          fontSize: 10,
          color: tokens.textMuted,
          opacity: 0.75,
          lineHeight: 1.4,
          fontStyle: 'italic',
        }}
      >
        Write formulas naturally — e.g. y=x^2
      </p>
      <div
        ref={wrapRef}
        data-math-input-toolbar="1"
        role="toolbar"
        aria-label="Math tools"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 3,
          padding: '4px 6px',
          borderRadius: 8,
          border: `1px solid ${tokens.cardBorder}`,
          background: 'rgba(0,0,0,0.1)',
          position: 'relative',
        }}
      >
        {MATH_TEMPLATES.map(t => (
          <div key={t.id} style={{ position: 'relative' }}>
            <button
              type="button"
              title={t.title}
              onMouseDown={e => e.preventDefault()}
              onClick={() => setOpenTemplate(prev => (prev === t.id ? null : t.id))}
              style={{
                ...btnStyle(tokens),
                borderColor: openTemplate === t.id ? `${tokens.accent}55` : tokens.cardBorder,
                background:
                  openTemplate === t.id ? `${tokens.accent}14` : 'rgba(255,255,255,0.04)',
              }}
            >
              {t.label}
            </button>
            {openTemplate === t.id && activeDef ? (
              <MathTemplatePopover
                template={activeDef}
                tokens={tokens}
                textColor={textColor}
                onApply={values => onApplyTemplate(t.id, values)}
                onClose={closePopover}
              />
            ) : null}
          </div>
        ))}
        <span
          style={{
            width: 1,
            height: 16,
            background: tokens.cardBorder,
            alignSelf: 'center',
            margin: '0 1px',
            opacity: 0.6,
          }}
          aria-hidden
        />
        {QUICK_MATH_SYMBOLS.map(s => (
          <button
            key={s.insert}
            type="button"
            title={s.title ?? s.label}
            onMouseDown={e => {
              e.preventDefault();
              onInsertSymbol(s.insert);
            }}
            style={btnStyle(tokens)}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
});
