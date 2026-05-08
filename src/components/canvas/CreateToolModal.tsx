/**
 * CreateToolModal — full-screen modal for building a custom formula tool.
 *
 * Flow:
 *   1. Name + description + emoji
 *   2. Add inputs (name → ID auto-generated)
 *   3. Write formula (live preview)
 *   4. Output label + precision
 *   5. Create → closes modal, places tool on canvas
 *
 * The formula preview evaluates in real-time using all inputs at their
 * default values so the user can verify before creating.
 */

import { useState, useMemo } from 'react';
import { X, Plus, Trash2, Wand2, ChevronDown, ChevronUp } from 'lucide-react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import type { CustomTool, ToolInput } from '../../hooks/useCustomTools';
import { TOOL_PRESETS } from '../../hooks/useCustomTools';
import { evaluateFormula, validateFormula } from '../../utils/formulaEvaluator';

interface Props {
  tokens:   AtmosphereTokens;
  onCreate: (spec: Omit<CustomTool, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onClose:  () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'x';
}

function uid(): string {
  return Math.random().toString(36).slice(2, 7);
}

const makeInput = (label = '', def = 0): ToolInput => ({
  id:           slugify(label) || `input_${uid()}`,
  label:        label || 'Input',
  defaultValue: def,
});

const EMOJI_OPTIONS = ['🧮','🎓','📊','💰','📚','📐','🍽','📏','⚡','🔢','📈','🎯'];

// ── Label style ───────────────────────────────────────────────────────────────

const cap = (color: string): React.CSSProperties => ({
  fontFamily:    "'Space Grotesk', sans-serif",
  fontSize:      '9px',
  fontWeight:    700,
  letterSpacing: '0.12em',
  textTransform: 'uppercase' as const,
  color,
  display:       'block',
  marginBottom:  '5px',
});

function Field({
  label, children, tokens,
}: { label: string; children: React.ReactNode; tokens: AtmosphereTokens }) {
  return (
    <div>
      <span style={cap(tokens.textGhost)}>{label}</span>
      {children}
    </div>
  );
}

function TextInput({
  value, placeholder, onChange, tokens, mono = false,
}: {
  value: string; placeholder?: string;
  onChange: (v: string) => void;
  tokens: AtmosphereTokens; mono?: boolean;
}) {
  return (
    <input
      value={value}
      placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
      style={{
        width:           '100%',
        padding:         '8px 11px',
        borderRadius:    '10px',
        border:          `1px solid ${tokens.cardBorder}`,
        backgroundColor: tokens.wellBg,
        color:           tokens.textPrimary,
        fontSize:        '13px',
        fontFamily:      mono ? "'Space Grotesk', monospace" : 'inherit',
        outline:         'none',
        boxSizing:       'border-box' as const,
        transition:      'border-color 0.15s ease',
      }}
      onFocus={e => ((e.currentTarget as HTMLInputElement).style.borderColor = tokens.focusBorder)}
      onBlur={e  => ((e.currentTarget as HTMLInputElement).style.borderColor = tokens.cardBorder)}
    />
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function CreateToolModal({ tokens, onCreate, onClose }: Props) {
  const [name,        setName]        = useState('');
  const [description, setDescription] = useState('');
  const [emoji,       setEmoji]       = useState('🧮');
  const [inputs,      setInputs]      = useState<ToolInput[]>([
    makeInput('Input A', 0),
    makeInput('Input B', 0),
  ]);
  const [formula,     setFormula]     = useState('');
  const [outputLabel, setOutputLabel] = useState('Result');
  const [precision,   setPrecision]   = useState(2);
  const [showPresets, setShowPresets] = useState(true);
  const [emojiOpen,   setEmojiOpen]   = useState(false);

  // Live formula validation / preview
  const formulaError = useMemo(() => {
    if (!formula.trim()) return null;
    return validateFormula(formula, inputs.map(i => i.id));
  }, [formula, inputs]);

  const formulaPreview = useMemo(() => {
    if (!formula.trim() || formulaError) return null;
    const vars: Record<string, number> = {};
    for (const inp of inputs) vars[inp.id] = inp.defaultValue;
    return evaluateFormula(formula, vars);
  }, [formula, formulaError, inputs]);

  const canCreate =
    name.trim().length > 0 &&
    formula.trim().length > 0 &&
    !formulaError &&
    inputs.length > 0;

  // ── Input management ────────────────────────────────────────────────────────

  const addInput = () =>
    setInputs(prev => [...prev, makeInput('', 0)]);

  const removeInput = (idx: number) =>
    setInputs(prev => prev.filter((_, i) => i !== idx));

  const updateInput = (idx: number, patch: Partial<ToolInput>) =>
    setInputs(prev => {
      const next = [...prev];
      const updated = { ...next[idx], ...patch };
      // Auto-update ID when label changes (unless user manually set it)
      if ('label' in patch && !('id' in patch)) {
        updated.id = slugify(patch.label as string) || `input_${uid()}`;
      }
      next[idx] = updated;
      return next;
    });

  // ── Load preset ─────────────────────────────────────────────────────────────

  const loadPreset = (preset: (typeof TOOL_PRESETS)[number]) => {
    setName(preset.name);
    setDescription(preset.description);
    setEmoji(preset.emoji);
    setInputs(preset.inputs.map(i => ({ ...i })));
    setFormula(preset.formula);
    setOutputLabel(preset.outputLabel);
    setPrecision(preset.precision);
    setShowPresets(false);
  };

  // ── Submit ───────────────────────────────────────────────────────────────────

  const handleCreate = () => {
    if (!canCreate) return;
    onCreate({ name: name.trim(), description: description.trim(), emoji, inputs, formula: formula.trim(), outputLabel: outputLabel.trim() || 'Result', precision });
  };

  // ── Styles ───────────────────────────────────────────────────────────────────

  const inputRow: React.CSSProperties = {
    display:         'grid',
    gridTemplateColumns: '1fr auto auto',
    gap:             '6px',
    alignItems:      'start',
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        position:        'fixed',
        inset:           0,
        zIndex:          60,
        display:         'flex',
        alignItems:      'center',
        justifyContent:  'center',
        backgroundColor: 'rgba(0,0,0,0.55)',
        backdropFilter:  'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          width:           '540px',
          maxWidth:        'calc(100vw - 32px)',
          maxHeight:       'calc(100vh - 48px)',
          overflowY:       'auto',
          backgroundColor: tokens.cardBg,
          border:          `1px solid ${tokens.cardBorder}`,
          borderRadius:    '20px',
          boxShadow:       `0 24px 80px rgba(0,0,0,0.6), 0 0 0 1px ${tokens.accent}15`,
          display:         'flex',
          flexDirection:   'column',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          display:      'flex',
          alignItems:   'center',
          gap:          '10px',
          padding:      '18px 20px 16px',
          borderBottom: `1px solid ${tokens.divider}`,
          flexShrink:   0,
        }}>
          <div style={{
            width:           '30px',
            height:          '30px',
            borderRadius:    '9px',
            backgroundColor: `${tokens.accent}20`,
            border:          `1px solid ${tokens.accent}30`,
            display:         'flex',
            alignItems:      'center',
            justifyContent:  'center',
          }}>
            <Wand2 style={{ width: '14px', height: '14px', color: tokens.accent }} />
          </div>
          <div>
            <p style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: '14px', fontWeight: 700, color: tokens.textPrimary, margin: 0 }}>
              Create Tool
            </p>
            <p style={{ fontSize: '11px', color: tokens.textGhost, margin: 0 }}>
              Build a personal calculator without code
            </p>
          </div>
          <button
            onClick={onClose}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer',
              color: tokens.textGhost, padding: '4px', borderRadius: '7px' }}
            onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = tokens.textMuted}
            onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = tokens.textGhost}
          >
            <X style={{ width: '16px', height: '16px' }} />
          </button>
        </div>

        <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '18px', flex: 1 }}>

          {/* Presets */}
          <div>
            <button
              onClick={() => setShowPresets(s => !s)}
              style={{
                display:        'flex',
                alignItems:     'center',
                gap:            '6px',
                background:     'none',
                border:         'none',
                cursor:         'pointer',
                padding:        0,
                marginBottom:   showPresets ? '10px' : 0,
              }}
            >
              <span style={cap(tokens.textGhost)}>Start from a preset</span>
              {showPresets
                ? <ChevronUp  style={{ width: '11px', height: '11px', color: tokens.textGhost }} />
                : <ChevronDown style={{ width: '11px', height: '11px', color: tokens.textGhost }} />
              }
            </button>

            {showPresets && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {TOOL_PRESETS.map((p, i) => (
                  <button
                    key={i}
                    onClick={() => loadPreset(p)}
                    style={{
                      display:         'flex',
                      alignItems:      'center',
                      gap:             '5px',
                      padding:         '5px 10px',
                      borderRadius:    '8px',
                      border:          `1px solid ${tokens.cardBorder}`,
                      backgroundColor: tokens.wellBg,
                      color:           tokens.textSecondary,
                      fontSize:        '11px',
                      fontWeight:      500,
                      cursor:          'pointer',
                      transition:      'all 0.12s ease',
                    }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLButtonElement).style.borderColor = tokens.accent;
                      (e.currentTarget as HTMLButtonElement).style.color = tokens.accent;
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLButtonElement).style.borderColor = tokens.cardBorder;
                      (e.currentTarget as HTMLButtonElement).style.color = tokens.textSecondary;
                    }}
                  >
                    <span style={{ fontSize: '13px' }}>{p.emoji}</span>
                    {p.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Divider */}
          <div style={{ height: '1px', backgroundColor: tokens.divider }} />

          {/* Emoji + Name */}
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '10px', alignItems: 'start' }}>
            {/* Emoji picker */}
            <div style={{ position: 'relative' }}>
              <span style={cap(tokens.textGhost)}>Icon</span>
              <button
                onClick={() => setEmojiOpen(o => !o)}
                style={{
                  width:           '40px',
                  height:          '40px',
                  borderRadius:    '10px',
                  border:          `1px solid ${emojiOpen ? tokens.accent : tokens.cardBorder}`,
                  backgroundColor: tokens.wellBg,
                  cursor:          'pointer',
                  fontSize:        '20px',
                  display:         'flex',
                  alignItems:      'center',
                  justifyContent:  'center',
                  transition:      'border-color 0.15s',
                }}
              >
                {emoji}
              </button>
              {emojiOpen && (
                <>
                  <div style={{ position: 'fixed', inset: 0, zIndex: 10 }} onClick={() => setEmojiOpen(false)} />
                  <div style={{
                    position:        'absolute',
                    top:             '100%',
                    left:            0,
                    zIndex:          20,
                    marginTop:       '4px',
                    backgroundColor: tokens.cardBg,
                    border:          `1px solid ${tokens.cardBorder}`,
                    borderRadius:    '12px',
                    padding:         '8px',
                    display:         'flex',
                    flexWrap:        'wrap',
                    gap:             '4px',
                    width:           '180px',
                    boxShadow:       tokens.shadowLg,
                  }}>
                    {EMOJI_OPTIONS.map(e => (
                      <button
                        key={e}
                        onClick={() => { setEmoji(e); setEmojiOpen(false); }}
                        style={{
                          width: '32px', height: '32px', borderRadius: '7px', fontSize: '18px',
                          border: `1px solid ${e === emoji ? tokens.accent : 'transparent'}`,
                          backgroundColor: e === emoji ? `${tokens.accent}15` : 'transparent',
                          cursor: 'pointer',
                        }}
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            <Field label="Tool Name" tokens={tokens}>
              <TextInput
                value={name} placeholder="e.g. Grade Calculator"
                onChange={setName} tokens={tokens}
              />
            </Field>
          </div>

          <Field label="Description (optional)" tokens={tokens}>
            <TextInput
              value={description} placeholder="What does this tool calculate?"
              onChange={setDescription} tokens={tokens}
            />
          </Field>

          {/* Inputs */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={cap(tokens.textGhost)}>Inputs</span>
              <button
                onClick={addInput}
                disabled={inputs.length >= 8}
                style={{
                  display:         'flex',
                  alignItems:      'center',
                  gap:             '4px',
                  padding:         '3px 8px',
                  borderRadius:    '7px',
                  border:          `1px solid ${tokens.cardBorder}`,
                  backgroundColor: 'transparent',
                  color:           inputs.length >= 8 ? tokens.textGhost : tokens.accent,
                  fontSize:        '10px',
                  fontWeight:      700,
                  cursor:          inputs.length >= 8 ? 'not-allowed' : 'pointer',
                  transition:      'all 0.12s',
                }}
              >
                <Plus style={{ width: '10px', height: '10px' }} /> Add
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {inputs.map((inp, idx) => (
                <div key={idx} style={inputRow}>
                  {/* Label + ID preview */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <input
                      value={inp.label}
                      placeholder={`Input ${idx + 1}`}
                      onChange={e => updateInput(idx, { label: e.target.value })}
                      style={{
                        padding:         '6px 9px',
                        borderRadius:    '8px',
                        border:          `1px solid ${tokens.cardBorder}`,
                        backgroundColor: tokens.wellBg,
                        color:           tokens.textPrimary,
                        fontSize:        '12px',
                        outline:         'none',
                        width:           '100%',
                        boxSizing:       'border-box' as const,
                      }}
                      onFocus={e => ((e.currentTarget as HTMLInputElement).style.borderColor = tokens.focusBorder)}
                      onBlur={e  => ((e.currentTarget as HTMLInputElement).style.borderColor = tokens.cardBorder)}
                    />
                    <span style={{ fontSize: '9px', color: tokens.textGhost, paddingLeft: '2px' }}>
                      variable: <code style={{ color: tokens.accent }}>{inp.id}</code>
                    </span>
                  </div>
                  {/* Default value */}
                  <input
                    type="number"
                    value={inp.defaultValue}
                    step="any"
                    onChange={e => {
                      const v = parseFloat(e.target.value);
                      if (!isNaN(v)) updateInput(idx, { defaultValue: v });
                    }}
                    title="Default value"
                    style={{
                      padding:         '6px 8px',
                      borderRadius:    '8px',
                      border:          `1px solid ${tokens.cardBorder}`,
                      backgroundColor: tokens.wellBg,
                      color:           tokens.textPrimary,
                      fontSize:        '12px',
                      outline:         'none',
                      width:           '72px',
                      textAlign:       'right' as const,
                    }}
                    onFocus={e => ((e.currentTarget as HTMLInputElement).style.borderColor = tokens.focusBorder)}
                    onBlur={e  => ((e.currentTarget as HTMLInputElement).style.borderColor = tokens.cardBorder)}
                  />
                  <button
                    onClick={() => removeInput(idx)}
                    disabled={inputs.length <= 1}
                    style={{
                      width:           '30px',
                      height:          '30px',
                      borderRadius:    '8px',
                      border:          'none',
                      background:      'transparent',
                      cursor:          inputs.length <= 1 ? 'not-allowed' : 'pointer',
                      color:           inputs.length <= 1 ? tokens.textGhost : tokens.textMuted,
                      display:         'flex',
                      alignItems:      'center',
                      justifyContent:  'center',
                      transition:      'all 0.12s',
                    }}
                    onMouseEnter={e => { if (inputs.length > 1) (e.currentTarget as HTMLButtonElement).style.color = '#f87171'; }}
                    onMouseLeave={e => { if (inputs.length > 1) (e.currentTarget as HTMLButtonElement).style.color = tokens.textMuted; }}
                  >
                    <Trash2 style={{ width: '12px', height: '12px' }} />
                  </button>
                </div>
              ))}
            </div>

            <p style={{ fontSize: '10px', color: tokens.textGhost, marginTop: '6px' }}>
              Use the variable names in your formula below.
            </p>
          </div>

          {/* Formula */}
          <div>
            <span style={cap(tokens.textGhost)}>Formula</span>
            <textarea
              value={formula}
              placeholder={`e.g.  ${inputs.map(i => i.id).join(' * 0.5 + ')} * 0.5`}
              onChange={e => setFormula(e.target.value)}
              rows={2}
              style={{
                width:           '100%',
                padding:         '9px 11px',
                borderRadius:    '10px',
                border:          `1px solid ${formulaError ? '#ef444460' : tokens.cardBorder}`,
                backgroundColor: tokens.wellBg,
                color:           tokens.textPrimary,
                fontSize:        '13px',
                fontFamily:      "'Space Grotesk', monospace",
                outline:         'none',
                resize:          'none',
                boxSizing:       'border-box' as const,
                transition:      'border-color 0.15s ease',
                lineHeight:      1.5,
              }}
              onFocus={e => ((e.currentTarget as HTMLTextAreaElement).style.borderColor = formulaError ? '#ef444480' : tokens.focusBorder)}
              onBlur={e  => ((e.currentTarget as HTMLTextAreaElement).style.borderColor = formulaError ? '#ef444460' : tokens.cardBorder)}
            />

            {/* Variable hints */}
            <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginTop: '5px' }}>
              {inputs.map(inp => (
                <span
                  key={inp.id}
                  onClick={() => setFormula(f => f + (f && !f.endsWith(' ') ? ' ' : '') + inp.id)}
                  style={{
                    padding:         '2px 7px',
                    borderRadius:    '5px',
                    border:          `1px solid ${tokens.accent}30`,
                    backgroundColor: `${tokens.accent}08`,
                    color:           tokens.accent,
                    fontSize:        '10px',
                    fontFamily:      "'Space Grotesk', monospace",
                    cursor:          'pointer',
                    userSelect:      'none' as const,
                  }}
                >
                  {inp.id}
                </span>
              ))}
            </div>

            {/* Formula error */}
            {formulaError && (
              <p style={{ fontSize: '11px', color: '#f87171', marginTop: '5px' }}>
                ⚠ {formulaError}
              </p>
            )}

            {/* Formula preview */}
            {formulaPreview && formulaPreview.ok && (
              <p style={{ fontSize: '11px', color: '#34d399', marginTop: '5px' }}>
                ✓ Preview with defaults: <strong>{formulaPreview.value.toFixed(precision)}</strong>
              </p>
            )}
          </div>

          {/* Output */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '10px', alignItems: 'start' }}>
            <Field label="Output Label" tokens={tokens}>
              <TextInput
                value={outputLabel} placeholder="e.g. Final Grade"
                onChange={setOutputLabel} tokens={tokens}
              />
            </Field>
            <div>
              <span style={cap(tokens.textGhost)}>Decimal places</span>
              <select
                value={precision}
                onChange={e => setPrecision(Number(e.target.value))}
                style={{
                  padding:         '8px 10px',
                  borderRadius:    '10px',
                  border:          `1px solid ${tokens.cardBorder}`,
                  backgroundColor: tokens.wellBg,
                  color:           tokens.textPrimary,
                  fontSize:        '13px',
                  outline:         'none',
                  cursor:          'pointer',
                  width:           '80px',
                }}
              >
                {[0, 1, 2, 3].map(n => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          display:      'flex',
          alignItems:   'center',
          justifyContent: 'flex-end',
          gap:          '8px',
          padding:      '14px 20px',
          borderTop:    `1px solid ${tokens.divider}`,
          flexShrink:   0,
        }}>
          <button
            onClick={onClose}
            style={{
              padding:         '8px 16px',
              borderRadius:    '10px',
              border:          `1px solid ${tokens.cardBorder}`,
              backgroundColor: 'transparent',
              color:           tokens.textMuted,
              fontSize:        '12px',
              fontWeight:      600,
              cursor:          'pointer',
              transition:      'all 0.12s',
            }}
            onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.backgroundColor = tokens.cardBorder}
            onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'}
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!canCreate}
            style={{
              padding:         '8px 18px',
              borderRadius:    '10px',
              border:          'none',
              backgroundColor: canCreate ? tokens.accent : tokens.cardBorder,
              color:           canCreate ? '#000' : tokens.textGhost,
              fontSize:        '12px',
              fontWeight:      700,
              cursor:          canCreate ? 'pointer' : 'not-allowed',
              transition:      'all 0.15s',
              display:         'flex',
              alignItems:      'center',
              gap:             '5px',
            }}
            onMouseEnter={e => { if (canCreate) (e.currentTarget as HTMLButtonElement).style.backgroundColor = tokens.accentHover; }}
            onMouseLeave={e => { if (canCreate) (e.currentTarget as HTMLButtonElement).style.backgroundColor = tokens.accent; }}
          >
            <Wand2 style={{ width: '12px', height: '12px' }} />
            Create Tool
          </button>
        </div>
      </div>
    </div>
  );
}
