import { Component, type ErrorInfo, type ReactNode } from 'react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import { fwPersistWarn } from '../../lib/freeSpacePersistence';

interface Props {
  children: ReactNode;
  tokens: AtmosphereTokens;
  /** Match FreeformCanvas `topOffset` so the fallback panel sits under the nav. */
  topOffset?: number;
  fillParent?: boolean;
}

interface State {
  hasError: boolean;
}

/**
 * Catches render errors inside Free Space canvas so a bad block never blanks the whole view.
 */
export class FreeSpaceCanvasErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    fwPersistWarn(`Free Space canvas render error (boundary caught): ${error.message}${info.componentStack ? ` — ${info.componentStack.slice(0, 400)}` : ''}`);
  }

  render(): ReactNode {
    const { tokens, children } = this.props;
    if (!this.state.hasError) return children;

    const { fillParent, topOffset = 0 } = this.props;
    return (
      <div
        style={{
          position: fillParent ? 'absolute' : 'fixed',
          top: fillParent ? 0 : topOffset,
          left: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          backgroundColor: tokens.pageBg,
          color: tokens.textMuted,
          fontSize: '13px',
          lineHeight: 1.5,
          textAlign: 'center',
          maxWidth: '420px',
          margin: '0 auto',
        }}
      >
        <div
          style={{
            borderRadius: '12px',
            border: `1px solid ${tokens.cardBorder}`,
            backgroundColor: `${tokens.cardBg}ee`,
            padding: '20px',
          }}
        >
          <p style={{ margin: '0 0 8px', fontWeight: 700, color: tokens.textPrimary }}>
            Free Space hit a display error
          </p>
          <p style={{ margin: 0 }}>
            One of the objects could not be rendered safely. Reload the page, or run{' '}
            <code style={{ color: tokens.accent }}>__FW_RESET_FREE_SPACE__()</code> in the console to clear
            this section&apos;s Free Space storage, then reload.
          </p>
        </div>
      </div>
    );
  }
}
