import { useRef, useEffect, useMemo } from 'react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import type { ProjectObjectContent } from '../../hooks/useSectionFreeSpaceObjects';

type NotebookContent = Extract<ProjectObjectContent, { type: 'notebook' }>;

interface Props {
  content: NotebookContent;
  tokens: AtmosphereTokens;
  onChange: (content: NotebookContent) => void;
}

export function ProjectNotebookBlock({ content, tokens, onChange }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const autoResize = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(420, el.scrollHeight)}px`;
  };

  useEffect(() => {
    autoResize();
  }, [content.body]);

  const paperStyle = content.paperStyle ?? 'ruled';

  const insertAtCursor = (text: string) => {
    const el = ref.current;
    const body = content.body ?? '';

    if (!el) {
      onChange({ ...content, body: body + text });
      return;
    }

    const start = el.selectionStart;
    const end = el.selectionEnd;

    const before = body.slice(0, start);
    const after = body.slice(end);

    const nextBody = `${before}${text}${after}`;

    onChange({ ...content, body: nextBody });

    requestAnimationFrame(() => {
      el.focus();
      const cursor = start + text.length;
      el.selectionStart = cursor;
      el.selectionEnd = cursor;
      autoResize();
    });
  };

  const paperBackground = useMemo(() => {
    if (paperStyle === 'blank') return 'none';

    if (paperStyle === 'grid') {
      return `
        linear-gradient(${tokens.cardBorder}20 1px, transparent 1px),
        linear-gradient(90deg, ${tokens.cardBorder}20 1px, transparent 1px)
      `;
    }

    return `
      repeating-linear-gradient(
        180deg,
        transparent,
        transparent 31px,
        ${tokens.cardBorder}35 31px,
        ${tokens.cardBorder}35 32px
      )
    `;
  }, [paperStyle, tokens.cardBorder]);

  const paperSize = paperStyle === 'grid' ? '28px 28px' : '100% 32px';

  const helperButtons = [
    { label: 'Title', insert: '# Title\n\n' },
    { label: 'Section', insert: '## Section\n\n' },
    { label: 'Task', insert: '- [ ] Task\n' },
    { label: 'Quote', insert: '> Quote\n\n' },
    { label: 'Line', insert: '\n---\n\n' },
  ];

  return (
    <div
      style={{
        padding: '22px 24px 28px',
        minHeight: '420px',
        background: `linear-gradient(180deg, ${tokens.cardBg}, ${tokens.wellBg})`,
        borderRadius: '22px',
        position: 'relative',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: '16px',
          marginBottom: '16px',
        }}
      >
        <div>
          <div
            style={{
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: tokens.textGhost,
              marginBottom: '6px',
            }}
          >
            Notebook
          </div>

          <div
            style={{
              fontSize: '13px',
              color: tokens.textMuted,
            }}
          >
            Write, divide, collect, return.
          </div>
        </div>

        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {(['blank', 'ruled', 'grid'] as const).map((style) => {
            const active = paperStyle === style;

            return (
              <button
                key={style}
                onClick={() => onChange({ ...content, paperStyle: style })}
                style={{
                  border: active ? `1px solid ${tokens.accent}55` : `1px solid ${tokens.cardBorder}`,
                  background: active ? `${tokens.accent}18` : 'transparent',
                  color: active ? tokens.accent : tokens.textGhost,
                  borderRadius: '999px',
                  fontSize: '10px',
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  padding: '5px 10px',
                  cursor: 'pointer',
                }}
              >
                {style}
              </button>
            );
          })}
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          gap: '6px',
          flexWrap: 'wrap',
          marginBottom: '14px',
          opacity: 0.9,
        }}
      >
        {helperButtons.map((button) => (
          <button
            key={button.label}
            onClick={() => insertAtCursor(button.insert)}
            style={{
              border: `1px solid ${tokens.cardBorder}`,
              background: `${tokens.wellBg}80`,
              color: tokens.textMuted,
              borderRadius: '999px',
              fontSize: '11px',
              fontWeight: 600,
              padding: '6px 10px',
              cursor: 'pointer',
            }}
          >
            + {button.label}
          </button>
        ))}
      </div>

      <textarea
        ref={ref}
        value={content.body ?? ''}
        onChange={(e) => {
          onChange({ ...content, body: e.target.value });
          autoResize();
        }}
        onFocus={autoResize}
        placeholder={`# Main idea

## Section

Write freely here...

- [ ] task
> reference or quote`}
        rows={18}
        spellCheck={false}
        style={{
          width: '100%',
          minHeight: '420px',
          resize: 'none',
          border: 'none',
          outline: 'none',
          backgroundColor: 'transparent',
          backgroundImage: paperBackground,
          backgroundSize: paperSize,
          color: tokens.textPrimary,
          fontSize: '16px',
          lineHeight: 2,
          letterSpacing: '0.01em',
          fontFamily: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
          overflow: 'hidden',
          caretColor: tokens.accent,
          paddingBottom: '80px',
          whiteSpace: 'pre-wrap',
        }}
      />
    </div>
  );
}

