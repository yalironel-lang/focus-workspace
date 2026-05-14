import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import type { WorkspaceStarterId } from '../../workspaceStarter/workspaceStarterTypes';
import {
  WORKSPACE_STARTER_IDS,
  WORKSPACE_STARTER_FOCUS,
  WORKSPACE_STARTER_LABEL,
  WORKSPACE_STARTER_TAGLINE,
} from '../../workspaceStarter/workspaceStarterTypes';
import { FOCUS_MODE_LABEL } from '../../focusMode/focusModeTypes';
import { WorkspaceMicroScene, type WorkspaceMicroSceneVariant } from '../workspace-guidance/WorkspaceMicroScene';

const STARTER_SCENE: Record<WorkspaceStarterId, WorkspaceMicroSceneVariant> = {
  'exam-prep': 'review-column',
  'deep-reading': 'reading-focus',
  'problem-solving': 'problem-tools',
  'research-thinking': 'thinking-map',
};

const STARTER_WHY: Record<WorkspaceStarterId, string> = {
  'exam-prep': 'Source, notes, mistakes, and recall stay readable together.',
  'deep-reading': 'Documents and margin notes remain part of the same reading flow.',
  'problem-solving': 'Workings, tools, and slips sit close enough to think with.',
  'research-thinking': 'Ideas spread out just enough to connect without becoming noise.',
};

const VALUE_STRIPS: Array<{ title: string; body: string; scene: WorkspaceMicroSceneVariant }> = [
  {
    title: 'Connected study spaces',
    body: 'Link notes, PDFs, mistakes, and tools into one working thought.',
    scene: 'thinking-map',
  },
  {
    title: 'Thinking flow',
    body: 'Arrange keeps the room readable without flattening it into a grid.',
    scene: 'study-flow',
  },
  {
    title: 'Quiet focus',
    body: 'Focus reduces distraction while nearby context stays gently visible.',
    scene: 'reading-focus',
  },
];

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
            Choose how you want to begin.
          </h2>
          <p style={{ margin: '8px 0 0', fontSize: 13, color: tokens.textSecondary, lineHeight: 1.45 }}>
            Start with a calm working shape, then let the workspace teach itself through use.
          </p>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 10,
            marginBottom: 16,
          }}
        >
          {VALUE_STRIPS.map((strip) => (
            <div
              key={strip.title}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 12px',
                borderRadius: 12,
                border: `1px solid ${tokens.cardBorder}`,
                background: `${tokens.wellBg}cc`,
              }}
            >
              <WorkspaceMicroScene tokens={tokens} variant={strip.scene} size="compact" />
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: tokens.textPrimary }}>{strip.title}</div>
                <div style={{ fontSize: 10.5, lineHeight: 1.45, color: tokens.textGhost, marginTop: 2 }}>
                  {strip.body}
                </div>
              </div>
            </div>
          ))}
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
                background: `${tokens.wellBg}e6`,
                padding: '14px 14px 12px',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                transition: 'border-color 0.25s ease, background 0.25s ease, transform 0.25s ease, box-shadow 0.25s ease',
              }}
              onMouseEnter={e => {
                const el = e.currentTarget;
                el.style.borderColor = `${tokens.accent ?? '#f59e0b'}55`;
                el.style.background = `${tokens.cardBg}f0`;
                el.style.transform = 'translateY(-1px)';
                el.style.boxShadow = '0 12px 30px rgba(0,0,0,0.18)';
              }}
              onMouseLeave={e => {
                const el = e.currentTarget;
                el.style.borderColor = tokens.cardBorder;
                el.style.background = `${tokens.wellBg}e6`;
                el.style.transform = 'none';
                el.style.boxShadow = 'none';
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
                <WorkspaceMicroScene tokens={tokens} variant={STARTER_SCENE[sid]} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    color: tokens.textGhost,
                  }}
                >
                  {FOCUS_MODE_LABEL[WORKSPACE_STARTER_FOCUS[sid]]} Focus
                </span>
                <span style={{ width: 3, height: 3, borderRadius: '50%', backgroundColor: `${tokens.accent}88` }} />
                <span style={{ fontSize: 10.5, lineHeight: 1.45, color: tokens.textSecondary }}>
                  {STARTER_WHY[sid]}
                </span>
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
