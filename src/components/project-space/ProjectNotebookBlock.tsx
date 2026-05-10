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

