import type { CSSProperties } from 'react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import type { WorkspaceStarterId } from '../../workspaceStarter/workspaceStarterTypes';
import {
  WORKSPACE_STARTER_IDS,
  WORKSPACE_STARTER_LABEL,
  WORKSPACE_STARTER_TAGLINE,
} from '../../workspaceStarter/workspaceStarterTypes';

function MicroLayoutPreview({ id }: { id: WorkspaceStarterId }) {
  const box = (style: CSSProperties) => (
    <span
      style={{
        borderRadius: 3,
        background: 'rgba(148,163,184,0.14)',
        border: '1px solid rgba(148,163,184,0.22)',
        ...style,
      }}
    />
  );
  switch (id) {
    case 'exam-prep':
      return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 0.45fr', gap: 3, width: 52, height: 36 }}>
          {box({ gridRow: 'span 2' })}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {box({ flex: 1 })}
            {box({ flex: 1 })}
          </div>
          <div style={{ gridColumn: 'span 2', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 2, height: 10 }}>
            {box({})}
            {box({})}
            {box({})}
          </div>
        </div>
      );
    case 'deep-reading':
      return (
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.75fr', gap: 3, width: 52, height: 36 }}>
          {box({})}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {box({ flex: 1.4 })}
            {box({ flex: 1 })}
          </div>
        </div>
      );
    case 'problem-solving':
      return (
        <div style={{ width: 52, height: 36, display: 'grid', gridTemplateColumns: '1fr 0.4fr 0.45fr', gridTemplateRows: '1fr 0.55fr', gap: 2 }}>
          {box({ gridRow: 'span 1' })}
          {box({})}
          {box({})}
          {box({ gridColumn: 'span 2' })}
          {box({})}
        </div>
      );
    case 'research-thinking':
      return (
        <div style={{ width: 52, height: 36, position: 'relative' }}>
          {box({ position: 'absolute', left: 14, top: 10, width: 16, height: 12 })}
          {box({ position: 'absolute', right: 8, top: 6, width: 14, height: 11 })}
          {box({ position: 'absolute', left: 4, bottom: 6, width: 14, height: 11 })}
          {box({ position: 'absolute', right: 10, bottom: 4, width: 16, height: 12 })}
        </div>
      );
  }
}

export function WorkspaceStarterOverlay({
  tokens,
  onChoose,
  onDismiss,
}: {
  tokens: AtmosphereTokens;
  onChoose: (id: WorkspaceStarterId) => void;
  onDismiss: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ws-starter-title"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 45,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
        background: 'radial-gradient(ellipse 80% 70% at 50% 45%, rgba(7,11,20,0.55) 0%, rgba(7,11,20,0.82) 100%)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        pointerEvents: 'auto',
      }}
    >
      <div
        style={{
          width: 'min(920px, 100%)',
          maxHeight: 'min(560px, 92vh)',
          overflow: 'auto',
          borderRadius: 16,
          border: `1px solid ${tokens.cardBorder}`,
          background: `${tokens.cardBg}e8`,
          boxShadow: '0 24px 80px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.04)',
          padding: '28px 26px 22px',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 22 }}>
          <p
            id="ws-starter-title"
            style={{
              margin: 0,
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: tokens.textGhost,
            }}
          >
            Workspace starter
          </p>
          <h2
            style={{
              margin: '10px 0 0',
              fontSize: 22,
              fontWeight: 600,
              letterSpacing: '-0.02em',
              color: tokens.textPrimary,
            }}
          >
            Choose how you want to work.
          </h2>
          <p style={{ margin: '8px 0 0', fontSize: 13, color: tokens.textSecondary, lineHeight: 1.45 }}>
            A calm desk layout—no walkthrough, no checklist.
          </p>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 12,
          }}
        >
          {WORKSPACE_STARTER_IDS.map(sid => (
            <button
              key={sid}
              type="button"
              onClick={() => onChoose(sid)}
              style={{
                textAlign: 'left',
                borderRadius: 12,
                border: `1px solid ${tokens.cardBorder}`,
                background: tokens.wellBg,
                padding: '14px 14px 12px',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                transition: 'border-color 0.25s ease, background 0.25s ease, transform 0.25s ease',
              }}
              onMouseEnter={e => {
                const el = e.currentTarget;
                el.style.borderColor = `${tokens.accent ?? '#f59e0b'}55`;
                el.style.background = `${tokens.cardBg}f0`;
                el.style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={e => {
                const el = e.currentTarget;
                el.style.borderColor = tokens.cardBorder;
                el.style.background = tokens.wellBg;
                el.style.transform = 'none';
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: tokens.textPrimary }}>
                    {WORKSPACE_STARTER_LABEL[sid]}
                  </div>
                  <div style={{ fontSize: 11, color: tokens.textGhost, marginTop: 4, lineHeight: 1.35 }}>
                    {WORKSPACE_STARTER_TAGLINE[sid]}
                  </div>
                </div>
                <MicroLayoutPreview id={sid} />
              </div>
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 20 }}>
          <button
            type="button"
            onClick={onDismiss}
            style={{
              fontSize: 12,
              color: tokens.textGhost,
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '6px 12px',
              borderRadius: 8,
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.color = tokens.textSecondary;
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.color = tokens.textGhost;
            }}
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
