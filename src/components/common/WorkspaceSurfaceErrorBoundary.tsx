import { Component, type ErrorInfo, type ReactNode } from 'react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import { fwPersistWarn } from '../../lib/freeSpacePersistence';

interface Props {
  children: ReactNode;
  tokens: AtmosphereTokens;
  /** Short label for the surface (e.g. "Notebook", "Minimap"). */
  label: string;
}

interface State {
  hasError: boolean;
}

/**
 * Isolates a single Free Space surface so a render error does not blank the whole canvas or page.
 */
export class WorkspaceSurfaceErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    fwPersistWarn(
      `${this.props.label} render error (isolated): ${error.message}${info.componentStack ? ` — ${info.componentStack.slice(0, 280)}` : ''}`,
    );
  }

  render(): ReactNode {
    const { tokens, label, children } = this.props;
    if (!this.state.hasError) return children;

    return (
      <div
        className="rounded-xl p-4 text-xs leading-relaxed"
        style={{
          backgroundColor: `${tokens.cardBg}ee`,
          border: `1px solid ${tokens.cardBorder}`,
          color: tokens.textMuted,
        }}
      >
        <p className="m-0 font-semibold" style={{ color: tokens.textPrimary }}>
          {label} is unavailable
        </p>
        <p className="mt-2 mb-0">
          Something in this panel could not be displayed safely. Your other workspace data is unchanged.
        </p>
      </div>
    );
  }
}
