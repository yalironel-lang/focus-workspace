/**
 * QuickAddFab — a single floating action button.
 *
 * Previously this was a duplicate mini-panel with its own item list.
 * Now it just opens the unified AddWorkspacePanel, keeping one consistent surface
 * for adding things to the workspace and eliminating the dual-UI confusion.
 */

import { Plus, X } from 'lucide-react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import type { BlockType } from '../../hooks/useCustomBlocks';

interface Props {
  tokens:        AtmosphereTokens;
  /** Kept for API compatibility — used when the panel is not open */
  onAddBlock:    (type: BlockType) => void;
  onOpenModules: () => void;
  panelOpen?:    boolean;
}

export function QuickAddFab({ tokens, onOpenModules, panelOpen }: Props) {
  return (
    <div
      style={{
        position:  'fixed',
        bottom:    '24px',
        right:     '24px',
        zIndex:    45,
      }}
    >
      <button
        onClick={onOpenModules}
        title={panelOpen ? 'Close' : 'Add to workspace'}
        style={{
          width:           '48px',
          height:          '48px',
          borderRadius:    '50%',
          border:          'none',
          backgroundColor: panelOpen ? tokens.cardBg : tokens.accent,
          color:           panelOpen ? tokens.textPrimary : '#000',
          display:         'flex',
          alignItems:      'center',
          justifyContent:  'center',
          cursor:          'pointer',
          boxShadow:       panelOpen
            ? `0 0 0 1px ${tokens.cardBorder}, 0 8px 32px rgba(0,0,0,0.4)`
            : `0 0 0 1px ${tokens.accent}50, 0 8px 32px ${tokens.accentGlow}, 0 4px 12px rgba(0,0,0,0.3)`,
          transition:      'all 0.2s cubic-bezier(0.34,1.56,0.64,1)',
        }}
        onMouseEnter={e => {
          if (!panelOpen)
            (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.08)';
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLButtonElement).style.transform = 'none';
        }}
      >
        <div style={{
          transform:  panelOpen ? 'rotate(45deg)' : 'rotate(0deg)',
          transition: 'transform 0.2s cubic-bezier(0.34,1.56,0.64,1)',
          display:    'flex',
        }}>
          {panelOpen
            ? <X    style={{ width: '16px', height: '16px' }} />
            : <Plus style={{ width: '16px', height: '16px' }} strokeWidth={2.5} />
          }
        </div>
      </button>
    </div>
  );
}
