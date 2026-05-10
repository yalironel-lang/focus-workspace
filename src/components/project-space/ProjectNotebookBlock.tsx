import { useRef, useEffect } from 'react';
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
    el.style.height = `${Math.max(360, el.scrollHeight)}px`;
  };

  useEffect(() => { autoResize(); }, [content.body]);

  const paperStyle = content.paperStyle ?? 'ruled';
  const paperBackground = paperStyle === 'blank'
    ? 'none'
    : paperStyle === 'grid'
      ? `linear-gradient(${tokens.cardBorder}35 1px, transparent 1px), linear-gradient(90deg, ${tokens.cardBorder}35 1px, transparent 1px)`
      : `repeating-linear-gradient(180deg, transparent, transparent 30px, ${tokens.cardBorder}50 30px, ${tokens.cardBorder}50 31px)`;
  const paperSize = paperStyle === 'grid' ? '28px 28px' : '100% 31px';

  return (
    <div
      style={{
        padding: '18px 20px 20px',
        minHeight: '380px',
        background: `linear-gradient(180deg, ${tokens.cardBg}, ${tokens.wellBg})`,
      }}
    >
      <p
        style={{
          margin: '0 0 12px',
          fontSize: '10px',
          fontWeight: 700,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: tokens.textGhost,
        }}
      >
        Notebook
      </p>
      <div style={{ display: 'flex', gap: '5px', marginBottom: '10px' }}>
        {(['blank', 'ruled', 'grid'] as const).map(style => (
          <button
            key={style}
            onClick={() => onChange({ ...content, paperStyle: style })}
            style={{
              border: `1px solid ${paperStyle === style ? `${tokens.accent}50` : tokens.cardBorder}`,
              backgroundColor: paperStyle === style ? `${tokens.accent}1a` : 'transparent',
              color: paperStyle === style ? tokens.accent : tokens.textGhost,
              borderRadius: '6px',
              fontSize: '10px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              padding: '3px 7px',
              cursor: 'pointer',
            }}
            title={`Paper style: ${style}`}
          >
            {style}
          </button>
        ))}
      </div>
      <textarea
        ref={ref}
        value={content.body}
        onChange={e => { onChange({ ...content, body: e.target.value }); autoResize(); }}
        onFocus={autoResize}
        placeholder="Write freely... ideas, rough drafts, references, plans."
        rows={16}
        style={{
          width: '100%',
          minHeight: '360px',
          resize: 'none',
          border: 'none',
          outline: 'none',
          background: 'transparent',
          backgroundImage: paperBackground,
          backgroundSize: paperSize,
          color: tokens.textPrimary,
          fontSize: '16px',
          lineHeight: 1.7,
          letterSpacing: '0.005em',
          fontFamily: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
          overflow: 'hidden',
          caretColor: tokens.accent,
        }}
      />
    </div>
  );
}

