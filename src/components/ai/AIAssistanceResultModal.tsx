import { X } from 'lucide-react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';

interface AIAssistanceResultModalProps {
  title: string;
  body: string;
  onClose: () => void;
  tokens: AtmosphereTokens;
}

export function AIAssistanceResultModal({ title, body, onClose, tokens }: AIAssistanceResultModalProps) {
  return (
    <div className="fixed inset-0 z-[315] flex items-center justify-center p-4" role="dialog" aria-modal aria-labelledby="fw-intelligence-cloud-result-title">
      <button
        type="button"
        className="absolute inset-0"
        style={{ backgroundColor: 'rgba(2,6,14,0.5)', backdropFilter: 'blur(4px)' }}
        aria-label="Close"
        onClick={onClose}
      />
      <div
        className="relative w-full max-w-lg rounded-2xl overflow-hidden flex flex-col max-h-[min(80vh,520px)]"
        style={{
          backgroundColor: 'rgba(12,16,28,0.96)',
          border: `1px solid ${tokens.cardBorder}`,
          boxShadow: '0 20px 64px rgba(0,0,0,0.45)',
        }}
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3" style={{ borderBottom: `1px solid ${tokens.cardBorder}` }}>
          <h2 id="fw-intelligence-cloud-result-title" className="text-sm font-semibold truncate pr-2" style={{ color: tokens.textPrimary }}>
            {title}
          </h2>
          <button type="button" onClick={onClose} className="p-2 rounded-lg shrink-0" style={{ color: tokens.textGhost }} aria-label="Close">
            <X className="w-4 h-4" strokeWidth={2} />
          </button>
        </div>
        <div className="px-4 py-3 overflow-y-auto flex-1">
          <pre
            className="whitespace-pre-wrap font-sans text-[13px] leading-relaxed"
            style={{ color: tokens.textMuted }}
          >
            {body}
          </pre>
        </div>
      </div>
    </div>
  );
}
