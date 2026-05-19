import { memo } from 'react';
import { FileText, BookOpen, Link2, Calculator, BarChart3, AlertCircle, Image } from 'lucide-react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import type { ProjectObjectType } from '../../hooks/useSectionFreeSpaceObjects';

interface Props {
  type: ProjectObjectType | string;
  title: string;
  tokens: AtmosphereTokens;
  /** chrome = label only; preview = light static hint */
  variant: 'chrome' | 'preview';
  subtitle?: string;
}

function typeIcon(type: string) {
  switch (type) {
    case 'notebook':
      return BookOpen;
    case 'pdf':
      return FileText;
    case 'companion':
      return Link2;
    case 'calculator':
      return Calculator;
    case 'graph':
      return BarChart3;
    case 'mistake':
      return AlertCircle;
    case 'image':
      return Image;
    default:
      return FileText;
  }
}

export const FreeSpaceObjectShell = memo(function FreeSpaceObjectShell({ type, title, tokens, variant, subtitle }: Props) {
  const Icon = typeIcon(type);
  return (
    <div
      className="flex flex-col h-full min-h-[120px] rounded-xl overflow-hidden"
      style={{
        backgroundColor: 'transparent',
        border: 'none',
      }}
    >
      <div
        className="flex items-center gap-2 px-3 py-2.5 shrink-0"
        style={{ borderBottom: `1px solid ${tokens.cardBorder}`, backgroundColor: tokens.wellBg }}
      >
        <Icon className="w-4 h-4 shrink-0" strokeWidth={2} style={{ color: tokens.accent }} />
        <span className="text-[12px] font-semibold truncate flex-1" style={{ color: tokens.textPrimary }}>
          {title || 'Untitled'}
        </span>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-6 text-center">
        {variant === 'preview' && subtitle ? (
          <p
            className="text-[11px] leading-relaxed line-clamp-4 max-w-full"
            style={{ color: tokens.textMuted }}
          >
            {subtitle}
          </p>
        ) : (
          <p className="text-[10px] font-medium" style={{ color: tokens.textGhost }}>
            {variant === 'chrome' ? 'Move closer to interact' : 'Paused — click to focus'}
          </p>
        )}
      </div>
    </div>
  );
});
