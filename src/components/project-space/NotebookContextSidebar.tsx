import { useMemo } from 'react';
import {
  BookOpenText,
  FileText,
  GitBranch,
  Sigma,
  StickyNote,
  TriangleAlert,
} from 'lucide-react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import {
  coerceFreeSpaceConnectionIds,
  ensureProjectObjectContent,
  type ProjectSpaceObject,
} from '../../hooks/useSectionFreeSpaceObjects';

export interface NotebookContextItem {
  id: string;
  type: ProjectSpaceObject['type'];
  title: string;
  subtitle: string;
  relation: 'linked' | 'mentioned';
}

export interface NotebookContextData {
  directCount: number;
  mentionCount: number;
  totalCount: number;
  linkedNotes: NotebookContextItem[];
  connectedMistakes: NotebookContextItem[];
  references: NotebookContextItem[];
  tools: NotebookContextItem[];
  mentionedIn: NotebookContextItem[];
}

function previewForObject(obj: ProjectSpaceObject): string {
  const content = ensureProjectObjectContent(obj.type, obj.content);
  switch (content.type) {
    case 'notebook': {
      const lines = content.body.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      return lines[0] || 'Thinking surface';
    }
    case 'note':
      return content.body.trim() || 'Quick note';
    case 'mistake':
      return content.whatWrong.trim() || (content.variant === 'recall' ? 'Recall prompt' : 'Mistake reference');
    case 'pdf':
      return content.fileName ? `PDF · page ${content.page}` : 'PDF reference';
    case 'graph':
      return `Graph · ${content.expression}`;
    case 'calculator':
      return content.input.trim() || content.history[content.history.length - 1]?.expr || 'Calculator surface';
    case 'link':
      return content.url || content.description || 'Reference link';
    case 'checklist':
      return `${content.items.length} checklist item${content.items.length === 1 ? '' : 's'}`;
    case 'image':
      return content.caption || content.alt || 'Visual reference';
    case 'companion':
      return content.description || content.url || 'External companion';
  }
}

function toContextItem(obj: ProjectSpaceObject, relation: 'linked' | 'mentioned'): NotebookContextItem {
  return {
    id: obj.id,
    type: obj.type,
    title: obj.title || (obj.type === 'pdf' ? 'PDF' : 'Untitled'),
    subtitle: previewForObject(obj),
    relation,
  };
}

function dedupeItems(items: NotebookContextItem[]): NotebookContextItem[] {
  const seen = new Set<string>();
  const out: NotebookContextItem[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

export function deriveNotebookContextData(
  notebookId: string | undefined,
  allObjects: ProjectSpaceObject[] | undefined,
): NotebookContextData {
  if (!notebookId || !allObjects?.length) {
    return {
      directCount: 0,
      mentionCount: 0,
      totalCount: 0,
      linkedNotes: [],
      connectedMistakes: [],
      references: [],
      tools: [],
      mentionedIn: [],
    };
  }

  const current = allObjects.find(o => o.id === notebookId);
  if (!current) {
    return {
      directCount: 0,
      mentionCount: 0,
      totalCount: 0,
      linkedNotes: [],
      connectedMistakes: [],
      references: [],
      tools: [],
      mentionedIn: [],
    };
  }

  const directIds = new Set(coerceFreeSpaceConnectionIds(current.connections));
  const backlinkIds = new Set(
    allObjects
      .filter(o => o.id !== notebookId && coerceFreeSpaceConnectionIds(o.connections).includes(notebookId))
      .map(o => o.id),
  );

  const direct = dedupeItems(
    allObjects
      .filter(o => o.id !== notebookId && directIds.has(o.id))
      .map(o => toContextItem(o, 'linked')),
  );
  const mentions = dedupeItems(
    allObjects
      .filter(o => o.id !== notebookId && backlinkIds.has(o.id))
      .map(o => toContextItem(o, 'mentioned')),
  );

  const linkedNotes = direct.filter(item => item.type === 'notebook' || item.type === 'note');
  const connectedMistakes = dedupeItems([
    ...direct.filter(item => item.type === 'mistake'),
    ...mentions.filter(item => item.type === 'mistake'),
  ]);
  const references = dedupeItems([
    ...direct.filter(item => item.type === 'pdf' || item.type === 'link' || item.type === 'image' || item.type === 'companion'),
    ...mentions.filter(item => item.type === 'pdf' || item.type === 'link' || item.type === 'image' || item.type === 'companion'),
  ]);
  const tools = dedupeItems([
    ...direct.filter(item => item.type === 'graph' || item.type === 'calculator' || item.type === 'checklist'),
    ...mentions.filter(item => item.type === 'graph' || item.type === 'calculator' || item.type === 'checklist'),
  ]);

  return {
    directCount: direct.length,
    mentionCount: mentions.length,
    totalCount: dedupeItems([...direct, ...mentions]).length,
    linkedNotes,
    connectedMistakes,
    references,
    tools,
    mentionedIn: mentions,
  };
}

function typeIcon(type: ProjectSpaceObject['type']) {
  if (type === 'notebook') return BookOpenText;
  if (type === 'pdf' || type === 'link' || type === 'image' || type === 'companion') return FileText;
  if (type === 'mistake') return TriangleAlert;
  if (type === 'graph' || type === 'calculator') return Sigma;
  return StickyNote;
}

function Section({
  tokens,
  label,
  items,
  onSelectObject,
}: {
  tokens: AtmosphereTokens;
  label: string;
  items: NotebookContextItem[];
  onSelectObject?: (id: string) => void;
}) {
  if (!items.length) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: tokens.textGhost,
        }}
      >
        {label}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map(item => {
          const Icon = typeIcon(item.type);
          return (
            <button
              key={`${label}-${item.id}`}
              type="button"
              onClick={() => onSelectObject?.(item.id)}
              style={{
                width: '100%',
                textAlign: 'left',
                border: `1px solid ${tokens.cardBorder}`,
                background: `${tokens.wellBg}cc`,
                borderRadius: 12,
                padding: '10px 11px',
                cursor: onSelectObject ? 'pointer' : 'default',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                transition: 'background 0.18s ease, border-color 0.18s ease, transform 0.18s ease',
              }}
              onMouseEnter={e => {
                const el = e.currentTarget;
                el.style.background = `${tokens.cardBg}f0`;
                el.style.borderColor = tokens.cardBorderHover;
                el.style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={e => {
                const el = e.currentTarget;
                el.style.background = `${tokens.wellBg}cc`;
                el.style.borderColor = tokens.cardBorder;
                el.style.transform = 'none';
              }}
            >
              <span
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 8,
                  flexShrink: 0,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: `${tokens.accent}18`,
                  color: tokens.accent,
                  marginTop: 1,
                }}
              >
                <Icon style={{ width: 12, height: 12 }} />
              </span>
              <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span
                  style={{
                    fontSize: 12.5,
                    fontWeight: 600,
                    color: tokens.textPrimary,
                    lineHeight: 1.25,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {item.title}
                </span>
                <span
                  style={{
                    fontSize: 10.5,
                    color: tokens.textMuted,
                    lineHeight: 1.4,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {item.subtitle}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function NotebookContextSidebar({
  tokens,
  title,
  data,
  floating = false,
  onClose,
  onSelectObject,
}: {
  tokens: AtmosphereTokens;
  title: string;
  data: NotebookContextData;
  floating?: boolean;
  onClose?: () => void;
  onSelectObject?: (id: string) => void;
}) {
  const chips = useMemo(
    () =>
      [
        data.directCount ? `${data.directCount} linked` : null,
        data.mentionCount ? `${data.mentionCount} mentioned in` : null,
      ].filter(Boolean) as string[],
    [data.directCount, data.mentionCount],
  );

  return (
    <aside
      style={{
        width: floating ? 240 : '100%',
        minWidth: 0,
        alignSelf: 'stretch',
        borderRadius: 18,
        border: `1px solid ${tokens.cardBorder}`,
        background: `${tokens.cardBg}d9`,
        boxShadow: `0 18px 48px rgba(0,0,0,0.26), inset 0 1px 0 rgba(255,255,255,0.06)`,
        backdropFilter: 'blur(16px) saturate(1.1)',
        WebkitBackdropFilter: 'blur(16px) saturate(1.1)',
        padding: '14px 14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: tokens.textGhost,
              marginBottom: 4,
            }}
          >
            Context
          </div>
          <div
            style={{
              fontSize: 13.5,
              fontWeight: 600,
              color: tokens.textPrimary,
              lineHeight: 1.3,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {title || 'Notebook'}
          </div>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            style={{
              border: 'none',
              background: 'transparent',
              color: tokens.textMuted,
              fontSize: 11,
              cursor: 'pointer',
              padding: '2px 4px',
            }}
          >
            Close
          </button>
        ) : null}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 11px',
          borderRadius: 14,
          border: `1px solid ${tokens.cardBorder}`,
          background: `${tokens.wellBg}cc`,
        }}
      >
        <span
          style={{
            width: 28,
            height: 28,
            borderRadius: 10,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: `${tokens.accent}18`,
            color: tokens.accent,
            flexShrink: 0,
          }}
        >
          <GitBranch style={{ width: 14, height: 14 }} />
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: tokens.textPrimary }}>
            {data.totalCount} connected object{data.totalCount === 1 ? '' : 's'}
          </div>
          <div style={{ fontSize: 10.5, color: tokens.textMuted, lineHeight: 1.35 }}>
            {chips.length ? chips.join(' · ') : 'Build links on the canvas to shape context.'}
          </div>
        </div>
      </div>

      <Section tokens={tokens} label="Linked notes" items={data.linkedNotes} onSelectObject={onSelectObject} />
      <Section tokens={tokens} label="Connected mistakes" items={data.connectedMistakes} onSelectObject={onSelectObject} />
      <Section tokens={tokens} label="References" items={data.references} onSelectObject={onSelectObject} />
      <Section tokens={tokens} label="Tools" items={data.tools} onSelectObject={onSelectObject} />
      <Section tokens={tokens} label="Mentioned in" items={data.mentionedIn} onSelectObject={onSelectObject} />
    </aside>
  );
}
