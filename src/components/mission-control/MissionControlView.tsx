/**
 * Mission Control view — NEXT / ACTIVE / FADING.
 * Derived entirely from Free Space objects. No persistence. No configuration.
 * Every item is a single tap: switch to Free Space and center on that object.
 */

import { useMemo } from 'react';
import { ChevronRight } from 'lucide-react';
import type { ProjectSpaceObject } from '../../hooks/useSectionFreeSpaceObjects';
import {
  deriveMissionControlSections,
  type NextItem,
  type ActiveItem,
  type FadingItem,
} from '../../lib/deriveMissionControlSections';

// ── Colour tokens (matches existing Mission Control palette) ──────────────────
const C = {
  textPrimary:   '#e2e8f0',
  textTertiary:  '#cbd5e1',
  textMuted:     '#64748b',
  textHint:      '#374151',
  textGhost:     '#263043',
  textNearBlack: '#1e2a38',
  border:        'rgba(255,255,255,0.022)',
  borderFaint:   'rgba(255,255,255,0.015)',
  hoverBg:       'rgba(255,255,255,0.018)',
  hoverBgFaint:  'rgba(255,255,255,0.012)',
  label:         'rgba(255,255,255,0.2)',
  divider:       'rgba(255,255,255,0.055)',
} as const;

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  objects: ProjectSpaceObject[];
  accent: string;
  onOpenObject: (id: string) => void;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: string }) {
  return (
    <p style={{
      margin: '0 0 10px',
      fontSize: 9,
      fontWeight: 750,
      letterSpacing: '0.14em',
      textTransform: 'uppercase',
      color: C.label,
      userSelect: 'none',
    }}>
      {children}
    </p>
  );
}

function NextSection({ item, accent, onOpen }: { item: NextItem; accent: string; onOpen: () => void }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <SectionLabel>Next</SectionLabel>
      <div style={{ borderTop: `1px solid ${C.divider}`, borderBottom: `1px solid ${C.divider}` }}>
        <button
          type="button"
          onClick={onOpen}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 14,
            padding: '14px 0', background: 'none', border: 'none',
            cursor: 'pointer', textAlign: 'left',
            transition: 'opacity 0.15s ease',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.76'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{
              margin: '0 0 4px',
              fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: `${accent}bb`,
            }}>
              {item.verb} →
            </p>
            <p style={{
              margin: 0,
              fontSize: 14, fontWeight: 500, color: C.textPrimary,
              lineHeight: 1.45,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {item.label}
            </p>
            {item.sublabel && (
              <p style={{
                margin: '3px 0 0',
                fontSize: 11, color: C.textHint, lineHeight: 1.3,
              }}>
                {item.sublabel}
              </p>
            )}
          </div>
          <ChevronRight style={{ width: 14, height: 14, color: C.textGhost, flexShrink: 0 }} />
        </button>
      </div>
    </div>
  );
}

function ActiveRow({ item, onOpen }: { item: ActiveItem; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      style={{
        width: '100%', display: 'flex', alignItems: 'flex-start', gap: 12,
        padding: '10px 0', background: 'none', border: 'none',
        borderBottom: `1px solid ${C.border}`,
        cursor: 'pointer', textAlign: 'left',
        transition: 'background-color 0.12s ease',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = C.hoverBg; }}
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'; }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          margin: 0,
          fontSize: 13, fontWeight: 450, color: C.textTertiary,
          lineHeight: 1.4,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {item.primary}
        </p>
        {item.secondary && (
          <p style={{ margin: '2px 0 0', fontSize: 11, color: C.textHint, lineHeight: 1.3 }}>
            {item.secondary}
          </p>
        )}
      </div>
      <span style={{
        flexShrink: 0, fontSize: 11, color: C.textGhost,
        paddingTop: 2, whiteSpace: 'nowrap',
      }}>
        {item.recency}
      </span>
      <ChevronRight style={{ width: 12, height: 12, color: C.textNearBlack, flexShrink: 0, marginTop: 3 }} />
    </button>
  );
}

function FadingRow({ item, onOpen }: { item: FadingItem; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      style={{
        width: '100%', display: 'flex', alignItems: 'flex-start', gap: 12,
        padding: '11px 0', background: 'none', border: 'none',
        borderBottom: `1px solid ${C.borderFaint}`,
        cursor: 'pointer', textAlign: 'left',
        transition: 'background-color 0.12s ease',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = C.hoverBgFaint; }}
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'; }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          margin: 0,
          fontSize: 13, color: C.textMuted,
          lineHeight: 1.4,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {item.concept}
        </p>
        {item.signal && (
          <p style={{
            margin: '2px 0 0',
            fontSize: 11, color: C.textHint, fontStyle: 'italic', lineHeight: 1.3,
          }}>
            {item.signal}
          </p>
        )}
      </div>
      {item.recencyHint && (
        <span style={{
          flexShrink: 0, fontSize: 11, color: C.textNearBlack,
          paddingTop: 2, whiteSpace: 'nowrap',
        }}>
          {item.recencyHint}
        </span>
      )}
      <ChevronRight style={{ width: 12, height: 12, color: C.textNearBlack, flexShrink: 0, marginTop: 3 }} />
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function MissionControlView({ objects, accent, onOpenObject }: Props) {
  const { next, active, fading } = useMemo(
    () => deriveMissionControlSections(objects),
    [objects],
  );

  const hasContent = next !== null || active.length > 0 || fading.length > 0;

  if (!hasContent) {
    return (
      <div style={{ marginBottom: 28, padding: '4px 0 20px' }}>
        <p style={{ fontSize: 13, color: C.textGhost, margin: 0 }}>
          Nothing active yet — open Free Space to start.
        </p>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 32 }}>

      {next && (
        <NextSection
          item={next}
          accent={accent}
          onOpen={() => onOpenObject(next.object.id)}
        />
      )}

      {active.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <SectionLabel>Active</SectionLabel>
          <div>
            {active.map(item => (
              <ActiveRow
                key={item.object.id}
                item={item}
                onOpen={() => onOpenObject(item.object.id)}
              />
            ))}
          </div>
        </div>
      )}

      {fading.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <SectionLabel>Fading</SectionLabel>
          <div>
            {fading.map(item => (
              <FadingRow
                key={item.object.id}
                item={item}
                onOpen={() => onOpenObject(item.object.id)}
              />
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
