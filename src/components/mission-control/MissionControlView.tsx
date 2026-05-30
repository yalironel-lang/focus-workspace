/**
 * Mission Control — spatial memory surface inside a workspace.
 */

import { useMemo } from 'react';
import type { ProjectSpaceObject } from '../../hooks/useSectionFreeSpaceObjects';
import {
  deriveMissionControlSections,
  type ActiveItem,
} from '../../lib/deriveMissionControlSections';
import { MissionControlEnvironment } from './MissionControlEnvironment';
import { ContinuationSurface } from './ContinuationSurface';
import { SpatialObjectMass } from './SpatialObjectMass';
import './missionControl.css';

interface Props {
  objects: ProjectSpaceObject[];
  accent: string;
  onOpenObject: (id: string) => void;
}

function activeToTrace(item: ActiveItem): string {
  return item.secondary || item.recency;
}

export function MissionControlView({ objects, accent, onOpenObject }: Props) {
  const { next, active, fading } = useMemo(
    () => deriveMissionControlSections(objects),
    [objects],
  );

  const flankActive = active.slice(0, 3);

  if (!next && active.length === 0 && fading.length === 0) {
    return (
      <div style={{ marginBottom: 28, padding: '4px 0 20px' }}>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.22)', margin: 0, fontFamily: 'var(--fw-font-body)' }}>
          Nothing active yet — open Free Space to start.
        </p>
      </div>
    );
  }

  return (
    <MissionControlEnvironment accent={accent} className="mc-environment--in-section">
      <div className="library-page-pad" style={{ paddingTop: 8, paddingBottom: 32 }}>
        <div className="mc-stage">
          {next && (
            <div className="mc-stage__hero">
              <ContinuationSurface
                title={next.label}
                subtitle={next.sublabel || null}
                accent={accent}
                label="Pick up this thread"
                hint="Open"
                onResume={() => onOpenObject(next.object.id)}
              />
            </div>
          )}

          {flankActive.length > 0 && (
            <div className="mc-stage__flank">
              <div className="mc-flank-stack">
                {flankActive.map((item, i) => (
                  <SpatialObjectMass
                    key={item.object.id}
                    title={item.primary}
                    trace={activeToTrace(item)}
                    accent={accent}
                    settleDelay={40 + i * 30}
                    onOpen={() => onOpenObject(item.object.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </MissionControlEnvironment>
  );
}
