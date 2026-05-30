import type { ReactNode } from 'react';
import {
  spatialFocusPoint,
  spatialParallaxOffset,
  useLibrarySpatial,
} from '../workspace-library/spatial/LibrarySpatialContext';
import { mcEnvironmentStyle } from '../../lib/missionControlMaterials';
import './missionControl.css';

interface Props {
  accent: string;
  children: ReactNode;
  className?: string;
  /** Cursor-reactive depth layers (dashboard entry) */
  interactive?: boolean;
}

/** Calm spatial shell — depth + restrained cursor parallax */
export function MissionControlEnvironment({
  accent,
  children,
  className,
  interactive = false,
}: Props) {
  const spatial = useLibrarySpatial();
  const far = interactive ? spatialParallaxOffset(spatial, 0.28) : { x: 0, y: 0 };
  const mid = interactive ? spatialParallaxOffset(spatial, 0.45) : { x: 0, y: 0 };
  const focus = spatialFocusPoint(spatial);

  const style = mcEnvironmentStyle({
    accent,
    parallaxFar: far,
    parallaxMid: mid,
    lightX: focus.left,
    lightY: focus.top,
    engagement: spatial.engagement,
  });

  return (
    <div
      className={`mc-environment${className ? ` ${className}` : ''}`}
      style={style}
      data-reduced-motion={spatial.reducedMotion ? 'true' : 'false'}
      data-interactive={interactive ? 'true' : 'false'}
    >
      <div className="mc-depth__back" aria-hidden />
      <div className="mc-depth__haze" aria-hidden />
      <div className="mc-environment__floor" aria-hidden />
      <div className="mc-environment__vignette" aria-hidden />
      <div className="mc-depth__fore" aria-hidden />
      {interactive ? <div className="mc-depth__lens" aria-hidden /> : null}
      <div className="mc-environment__scroll mc-settle">
        {children}
      </div>
    </div>
  );
}
