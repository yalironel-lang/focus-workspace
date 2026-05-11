import { useRef, useEffect, useMemo, useState } from 'react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import type { ProjectObjectContent } from '../../hooks/useSectionFreeSpaceObjects';

type NotebookContent = Extract<ProjectObjectContent, { type: 'notebook' }>;

type NotebookLine =
  | { kind: 'blank' }
  | { kind: 'title'; text: string }
  | { kind: 'section'; text: string }
  | { kind: 'divider' }
  | { kind: 'task'; checked: boolean; text: string }
  | { kind: 'quote'; text: string }
  | { kind: 'paragraph'; text: string };

function parseNotebookLine(raw: string): NotebookLine {
  const trimmed = raw.trim();
  if (trimmed === '') return { kind: 'blank' };
  if (trimmed === '---') return { kind: 'divider' };
  if (trimmed.startsWith('## ')) return { kind: 'section', text: trimmed.slice(3) };
  if (trimmed.startsWith('# ')) return { kind: 'title', text: trimmed.slice(2) };
  const taskMatch = trimmed.match(/^- \[([ xX])\]\s*(.*)$/);
  if (taskMatch) {
    const checked = taskMatch[1].toLowerCase() === 'x';
    return { kind: 'task', checked, text: taskMatch[2] };
  }
  if (trimmed.startsWith('> ')) return { kind: 'quote', text: trimmed.slice(2) };
  if (trimmed.startsWith('>')) return { kind: 'quote', text: trimmed.slice(1).trimStart() };
  return { kind: 'paragraph', text: raw };
}

interface Props {
  content: NotebookContent;
  tokens: AtmosphereTokens;
  onChange: (content: NotebookContent) => void;
}

export function ProjectNotebookBlock({ content, tokens, onChange }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [editorMode, setEditorMode] = useState<'edit' | 'preview'>('edit');

  const autoResize = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(420, el.scrollHeight)}px`;
  };

  useEffect(() => {
    if (editorMode === 'edit') autoResize();
  }, [content.body, editorMode]);

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

  const previewLines = useMemo(() => {
    const body = content.body ?? '';
    return body.split('\n').map(parseNotebookLine);
  }, [content.body]);

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

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: '10px',
          }}
        >
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {(['edit', 'preview'] as const).map((mode) => {
              const active = editorMode === mode;
              const label = mode === 'edit' ? 'Edit' : 'Preview';
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setEditorMode(mode)}
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
                  {label}
                </button>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {(['blank', 'ruled', 'grid'] as const).map((style) => {
              const active = paperStyle === style;

              return (
                <button
                  key={style}
                  type="button"
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
      </div>

      {editorMode === 'edit' ? (
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
              type="button"
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
      ) : null}

      {editorMode === 'edit' ? (
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
      ) : (
        <div
          role="document"
          aria-label="Notebook preview"
          style={{
            width: '100%',
            minHeight: '420px',
            boxSizing: 'border-box',
            backgroundColor: 'transparent',
            backgroundImage: paperBackground,
            backgroundSize: paperSize,
            color: tokens.textPrimary,
            fontSize: '16px',
            lineHeight: 2,
            letterSpacing: '0.01em',
            fontFamily: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
            paddingBottom: '80px',
          }}
        >
          {previewLines.map((line, index) => {
            if (line.kind === 'blank') {
              return <div key={index} style={{ height: '16px' }} />;
            }
            if (line.kind === 'title') {
              return (
                <div
                  key={index}
                  style={{
                    fontSize: '26px',
                    fontWeight: 800,
                    letterSpacing: '-0.02em',
                    lineHeight: 1.25,
                    margin: '8px 0 10px',
                    color: tokens.textPrimary,
                  }}
                >
                  {line.text}
                </div>
              );
            }
            if (line.kind === 'section') {
              return (
                <div
                  key={index}
                  style={{
                    fontSize: '18px',
                    fontWeight: 700,
                    lineHeight: 1.35,
                    margin: '22px 0 8px',
                    color: tokens.textPrimary,
                  }}
                >
                  {line.text}
                </div>
              );
            }
            if (line.kind === 'divider') {
              return (
                <div
                  key={index}
                  style={{
                    height: '1px',
                    margin: '18px 0',
                    background: tokens.cardBorder,
                    opacity: 0.85,
                  }}
                  role="separator"
                />
              );
            }
            if (line.kind === 'task') {
              return (
                <div
                  key={index}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                    margin: '6px 0',
                    color: tokens.textPrimary,
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      flexShrink: 0,
                      width: '18px',
                      height: '18px',
                      marginTop: '5px',
                      borderRadius: '5px',
                      border: `2px solid ${line.checked ? tokens.accent : tokens.cardBorder}`,
                      background: line.checked ? `${tokens.accent}22` : 'transparent',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '12px',
                      fontWeight: 800,
                      color: tokens.accent,
                      lineHeight: 1,
                    }}
                  >
                    {line.checked ? '✓' : ''}
                  </span>
                  <span style={{ flex: 1, whiteSpace: 'pre-wrap' }}>{line.text}</span>
                </div>
              );
            }
            if (line.kind === 'quote') {
              return (
                <blockquote
                  key={index}
                  style={{
                    margin: '10px 0',
                    paddingLeft: '16px',
                    borderLeft: `3px solid ${tokens.accent}66`,
                    color: tokens.textMuted,
                    fontStyle: 'italic',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {line.text}
                </blockquote>
              );
            }
            return (
              <p
                key={index}
                style={{
                  margin: '4px 0',
                  color: tokens.textPrimary,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {line.text}
              </p>
            );
          })}
        </div>
      )}
    </div>
  );
}

