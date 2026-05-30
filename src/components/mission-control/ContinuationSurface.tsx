import { useRef, useState } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';
import { relativeTimeShort } from '../../lib/missionControlMaterials';
import { useLibrarySpatial } from '../workspace-library/spatial/LibrarySpatialContext';
import { WorkspaceOrb } from './WorkspaceOrb';

export interface ContinuationSurfaceProps {
  title: string;
  subtitle?: string | null;
  openedAt?: string | null;
  accent: string;
  icon?: string | null;
  label?: string;
  hint?: string;
  onResume: () => void;
  className?: string;
}

/**
 * Primary continuation affordance — spatial glass monument + workspace orb.
 */
export function ContinuationSurface({
  title,
  subtitle,
  openedAt,
  accent,
  icon,
  label = 'Resume where you stopped',
  hint = 'Open workspace',
  onResume,
  className,
}: ContinuationSurfaceProps) {
  const reducedMotion = usePrefersReducedMotion();
  const { setFocusRegion } = useLibrarySpatial();
  const monumentRef = useRef<HTMLButtonElement>(null);
  const [hovered, setHovered] = useState(false);
  const timeLabel = openedAt ? relativeTimeShort(openedAt) : null;
  const displaySubtitle = subtitle?.trim() || null;

  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const rotateX = useSpring(useTransform(my, [-0.5, 0.5], [2, -2]), {
    stiffness: 160,
    damping: 30,
  });
  const rotateY = useSpring(useTransform(mx, [-0.5, 0.5], [-2.5, 2.5]), {
    stiffness: 160,
    damping: 30,
  });
  const liftY = useSpring(hovered ? -2 : 0, { stiffness: 200, damping: 30 });

  const onPointerMove = (e: React.PointerEvent) => {
    if (reducedMotion || !monumentRef.current) return;
    const rect = monumentRef.current.getBoundingClientRect();
    mx.set((e.clientX - rect.left) / rect.width - 0.5);
    my.set((e.clientY - rect.top) / rect.height - 0.5);
  };

  const onPointerLeave = () => {
    mx.set(0);
    my.set(0);
    setHovered(false);
    setFocusRegion(null);
  };

  return (
    <motion.button
      ref={monumentRef}
      type="button"
      className={`mc-continuation${className ? ` ${className}` : ''}`}
      style={{
        ['--mc-accent' as string]: accent,
        rotateX: reducedMotion ? 0 : rotateX,
        rotateY: reducedMotion ? 0 : rotateY,
        y: reducedMotion ? (hovered ? -2 : 0) : liftY,
        transformPerspective: 1200,
        transformStyle: 'preserve-3d',
      }}
      onClick={onResume}
      onPointerMove={onPointerMove}
      onPointerEnter={() => {
        setHovered(true);
        setFocusRegion('hero');
      }}
      onPointerLeave={onPointerLeave}
      aria-label={`Resume ${title}`}
      whileTap={reducedMotion ? undefined : { scale: 0.996 }}
    >
      <div className="mc-continuation__pool" aria-hidden />
      <div className="mc-continuation__surface">
        <div className="mc-continuation__light" aria-hidden />
        <div className="mc-continuation__body">
          <div className="mc-continuation__copy">
            <p className="mc-continuation__label">{label}</p>
            <h2 className="mc-continuation__title">{title}</h2>
            {displaySubtitle ? (
              <p className="mc-continuation__subtitle">{displaySubtitle}</p>
            ) : null}
            {timeLabel ? (
              <p className="mc-continuation__meta">Last opened {timeLabel}</p>
            ) : null}
            <span className="mc-continuation__cta">
              {hint}
              <span className="mc-continuation__cta-arrow" aria-hidden>
                →
              </span>
            </span>
          </div>
          <div className="mc-continuation__orb-wrap">
            <WorkspaceOrb
              accent={accent}
              title={title}
              icon={icon}
              size="hero"
              presence="present"
              hovered={hovered}
            />
          </div>
        </div>
      </div>
    </motion.button>
  );
}
