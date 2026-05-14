import { useCallback, useEffect, useMemo, useState } from 'react';
import { X, Loader2, Sparkles, ChevronDown, ChevronRight } from 'lucide-react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import { aiComplete } from '../../lib/ai/client';
import { DEFAULT_AI_SETTINGS, type AIProviderId, type AIUserSettings } from '../../lib/ai/types';
import { loadAIUserSettings, saveAIUserSettings } from '../../lib/ai/storage';
import { promptTestConnection } from '../../lib/ai/prompts';

const PROVIDERS: { id: AIProviderId; label: string; hint: string }[] = [
  { id: 'openai', label: 'OpenAI', hint: 'OpenAI-compatible API.' },
  { id: 'openrouter', label: 'OpenRouter', hint: 'OpenAI-compatible API.' },
  { id: 'custom', label: 'Custom base URL', hint: 'Local or other OpenAI-compatible endpoint.' },
];

function defaultModelForProvider(id: AIProviderId): string {
  if (id === 'openrouter') return 'openai/gpt-4o-mini';
  return DEFAULT_AI_SETTINGS.model;
}

interface IntelligenceModalProps {
  onClose: () => void;
  tokens: AtmosphereTokens;
}

export function IntelligenceModal({ onClose, tokens }: IntelligenceModalProps) {
  const [draft, setDraft] = useState<AIUserSettings>(() => loadAIUserSettings());
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(() => {
    const s = loadAIUserSettings();
    return !!(s.apiKey.trim() || s.enabled);
  });

  useEffect(() => {
    const s = loadAIUserSettings();
    setDraft(s);
    setTestMsg(null);
    setAdvancedOpen(!!(s.apiKey.trim() || s.enabled));
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const onSave = useCallback(() => {
    saveAIUserSettings(draft);
    setTestMsg('Saved on this device.');
  }, [draft]);

  const onTest = useCallback(async () => {
    setTestMsg(null);
    setTesting(true);
    try {
      const r = await aiComplete({ messages: promptTestConnection(), settingsOverride: draft });
      if (r.ok) setTestMsg('Connection OK.');
      else setTestMsg(r.error);
    } finally {
      setTesting(false);
    }
  }, [draft]);

  const border = tokens.cardBorder;
  const well = tokens.wellBg;

  const localBullets = useMemo(
    () => [
      'Mistake slips, notebooks, and notes on your Free Space canvas',
      'Review passes and gentle queues for mistakes you have marked',
      'Connections between canvas objects (stored on this device)',
      'Work surface lanes, tasks, and shelf items in each workspace',
    ],
    [],
  );

  return (
    <div
      className="fixed inset-0 z-[320] flex items-center justify-center p-4"
      role="dialog"
      aria-modal
      aria-labelledby="fw-intelligence-title"
    >
      <button
        type="button"
        className="absolute inset-0"
        style={{ backgroundColor: 'rgba(2,6,14,0.55)', backdropFilter: 'blur(6px)' }}
        aria-label="Close"
        onClick={onClose}
      />
      <div
        className="relative w-full max-w-md rounded-2xl overflow-hidden flex flex-col max-h-[90vh]"
        style={{
          backgroundColor: 'rgba(12,16,28,0.96)',
          border: `1px solid ${border}`,
          boxShadow: '0 24px 80px rgba(0,0,0,0.55)',
        }}
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4" style={{ borderBottom: `1px solid ${border}` }}>
          <div className="flex items-start gap-3 min-w-0">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{ backgroundColor: well, border: `1px solid ${border}` }}
            >
              <Sparkles className="w-5 h-5" strokeWidth={1.75} style={{ color: tokens.accent }} />
            </div>
            <div className="min-w-0">
              <h2 id="fw-intelligence-title" className="text-sm font-semibold tracking-tight" style={{ color: tokens.textPrimary }}>
                Intelligence
              </h2>
              <p className="text-[11px] leading-snug mt-1" style={{ color: tokens.textMuted }}>
                Local insight is the default. Cloud model help is entirely optional.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg transition-colors shrink-0"
            style={{ color: tokens.textGhost }}
            aria-label="Close"
          >
            <X className="w-4 h-4" strokeWidth={2} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-5 overflow-y-auto">
          <section>
            <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: tokens.textGhost }}>
              Local intelligence
            </p>
            <p className="text-[13px] leading-relaxed" style={{ color: tokens.textMuted }}>
              Core study workflows run on this device: no API key, no account, and no remote model required for the
              features below.
            </p>
            <ul className="mt-2.5 space-y-1.5 text-[12px] leading-snug list-disc pl-4" style={{ color: tokens.textMuted }}>
              {localBullets.map(line => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </section>

          <p
            className="text-[12px] leading-relaxed rounded-xl px-3 py-2.5"
            style={{ color: tokens.textMuted, backgroundColor: well, border: `1px solid ${border}` }}
          >
            Cloud AI is optional. Focus works fully without it.
          </p>

          <section>
            <p className="text-[12px] leading-relaxed" style={{ color: tokens.textMuted }}>
              Optional cloud model help uses <span style={{ color: tokens.textPrimary }}>your</span> provider. Usage and
              billing follow <span style={{ color: tokens.textPrimary }}>that provider</span> — not a Focus Workspace subscription.
            </p>
          </section>

          <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${border}` }}>
            <button
              type="button"
              onClick={() => setAdvancedOpen(o => !o)}
              className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left transition-colors"
              style={{ backgroundColor: advancedOpen ? `${tokens.accent}0c` : well }}
              aria-expanded={advancedOpen}
            >
              <span className="text-[12px] font-medium" style={{ color: tokens.textPrimary }}>
                Advanced — optional cloud model
              </span>
              {advancedOpen ? (
                <ChevronDown className="w-4 h-4 shrink-0" style={{ color: tokens.textGhost }} strokeWidth={2} />
              ) : (
                <ChevronRight className="w-4 h-4 shrink-0" style={{ color: tokens.textGhost }} strokeWidth={2} />
              )}
            </button>
            {advancedOpen && (
              <div className="px-3 pb-3 pt-1 space-y-3" style={{ borderTop: `1px solid ${border}` }}>
                <p className="text-[11px] leading-snug pt-2" style={{ color: tokens.textMuted }}>
                  Optional: connect your own AI provider (OpenAI-compatible). Keys stay in this browser only; nothing is sent
                  until you run a cloud action from the command palette.
                </p>

                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="rounded border-slate-600"
                    checked={draft.enabled}
                    onChange={e => setDraft(d => ({ ...d, enabled: e.target.checked }))}
                  />
                  <span className="text-sm" style={{ color: tokens.textPrimary }}>
                    Allow cloud model help
                  </span>
                </label>

                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: tokens.textGhost }}>
                    Provider
                  </p>
                  <div className="space-y-1.5">
                    {PROVIDERS.map(p => (
                      <label
                        key={p.id}
                        className="flex gap-2.5 p-2.5 rounded-xl cursor-pointer transition-colors"
                        style={{
                          border: `1px solid ${draft.providerId === p.id ? `${tokens.accent}44` : border}`,
                          backgroundColor: draft.providerId === p.id ? `${tokens.accent}10` : 'transparent',
                        }}
                      >
                        <input
                          type="radio"
                          name="fw-intelligence-provider"
                          className="mt-0.5"
                          checked={draft.providerId === p.id}
                          onChange={() =>
                            setDraft(d => ({
                              ...d,
                              providerId: p.id,
                              model: d.model.trim() ? d.model : defaultModelForProvider(p.id),
                            }))
                          }
                        />
                        <span className="min-w-0">
                          <span className="text-[13px] font-medium block" style={{ color: tokens.textPrimary }}>
                            {p.label}
                          </span>
                          <span className="text-[11px] leading-snug" style={{ color: tokens.textMuted }}>
                            {p.hint}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                {draft.providerId === 'custom' && (
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest block mb-1.5" style={{ color: tokens.textGhost }}>
                      Base URL
                    </label>
                    <input
                      type="url"
                      className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                      style={{
                        backgroundColor: well,
                        border: `1px solid ${border}`,
                        color: tokens.textPrimary,
                      }}
                      placeholder="https://example.com/v1"
                      value={draft.baseUrl}
                      onChange={e => setDraft(d => ({ ...d, baseUrl: e.target.value }))}
                    />
                  </div>
                )}

                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest block mb-1.5" style={{ color: tokens.textGhost }}>
                    API key
                  </label>
                  <input
                    type="password"
                    autoComplete="off"
                    className="w-full rounded-xl px-3 py-2.5 text-sm outline-none font-mono"
                    style={{
                      backgroundColor: well,
                      border: `1px solid ${border}`,
                      color: tokens.textPrimary,
                    }}
                    placeholder={draft.providerId === 'openrouter' ? 'sk-or-…' : 'sk-…'}
                    value={draft.apiKey}
                    onChange={e => setDraft(d => ({ ...d, apiKey: e.target.value }))}
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest block mb-1.5" style={{ color: tokens.textGhost }}>
                    Model (optional)
                  </label>
                  <input
                    type="text"
                    className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                    style={{
                      backgroundColor: well,
                      border: `1px solid ${border}`,
                      color: tokens.textPrimary,
                    }}
                    placeholder={defaultModelForProvider(draft.providerId)}
                    value={draft.model}
                    onChange={e => setDraft(d => ({ ...d, model: e.target.value }))}
                  />
                </div>

                {testMsg && (
                  <p className="text-xs leading-relaxed rounded-lg px-3 py-2" style={{ color: tokens.textMuted, backgroundColor: well }}>
                    {testMsg}
                  </p>
                )}

                <p className="text-[10px] leading-relaxed" style={{ color: tokens.textGhost }}>
                  Requests go from this browser to your provider. No Focus Workspace server stores your key or canvas content.
                </p>

                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={onTest}
                    disabled={testing || !draft.apiKey.trim()}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-opacity disabled:opacity-35"
                    style={{
                      backgroundColor: well,
                      border: `1px solid ${border}`,
                      color: tokens.textPrimary,
                    }}
                  >
                    {testing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    Test connection
                  </button>
                  <button
                    type="button"
                    onClick={onSave}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold"
                    style={{
                      backgroundColor: `${tokens.accent}22`,
                      border: `1px solid ${tokens.accent}55`,
                      color: tokens.accent,
                    }}
                  >
                    Save locally
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 px-5 py-4" style={{ borderTop: `1px solid ${border}` }}>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-medium ml-auto"
            style={{ color: tokens.textMuted }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
