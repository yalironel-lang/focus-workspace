import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Props {
  collapsed: boolean;
  accent: string;
  reducedMotion: boolean;
  onToggle: () => void;
}

/** Embedded edge control — folds the navigation rail without dashboard snap. */
export function LibrarySidebarRailToggle({ collapsed, accent, reducedMotion, onToggle }: Props) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);

  const scale = pressed ? 0.97 : hovered ? 1.035 : 1;
  const opacity = hovered ? 1 : 0.88;

  return (
    <button
      type="button"
      className="library-rail-toggle"
      aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
      aria-expanded={!collapsed}
      onClick={onToggle}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => { setHovered(false); setPressed(false); }}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerCancel={() => setPressed(false)}
      style={{
        ['--rail-accent' as string]: accent,
        opacity,
        transform: `translateY(-50%) scale(${scale})`,
        transition: reducedMotion
          ? 'opacity 0.01ms'
          : 'transform 0.34s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.26s ease, border-color 0.26s ease, box-shadow 0.34s ease',
      }}
    >
      <span className="library-rail-toggle__glow" aria-hidden />
      <span className="library-rail-toggle__surface" aria-hidden />
      {collapsed ? (
        <ChevronRight className="library-rail-toggle__icon" strokeWidth={2.25} />
      ) : (
        <ChevronLeft className="library-rail-toggle__icon" strokeWidth={2.25} />
      )}
    </button>
  );
}
