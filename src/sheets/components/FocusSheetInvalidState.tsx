import type { AtmosphereTokens } from '../../hooks/useAtmosphere';

export function FocusSheetInvalidState({
  tokens,
  reason,
}: {
  tokens: AtmosphereTokens;
  reason: string;
}) {
  return (
    <div
      className="h-full w-full rounded-lg p-4 text-xs leading-relaxed"
      style={{
        backgroundColor: `${tokens.cardBg}ee`,
        border: `1px solid ${tokens.cardBorder}`,
        color: tokens.textMuted,
      }}
    >
      <p className="m-0 font-semibold" style={{ color: tokens.textPrimary }}>
        This Sheet could not be opened
      </p>
      <p className="mt-2 mb-0">
        The stored document is invalid or unsupported. The original content was not replaced.
      </p>
      <p className="mt-2 mb-0 break-words" style={{ color: tokens.textGhost }}>
        {reason}
      </p>
    </div>
  );
}
