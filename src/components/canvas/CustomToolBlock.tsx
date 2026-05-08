/**
 * CustomToolBlock — renders a custom formula tool as a self-contained card.
 *
 * Users enter numeric values for each input; the result is computed live
 * using the safe formula evaluator. No external requests, no eval.
 */

import { useState, useMemo } from 'react';
import { Calculator, RefreshCw } from 'lucide-react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import type { CustomTool } from '../../hooks/useCustomTools';
import { evaluateFormula } from '../../utils/formulaEvaluator';

interface Props {
  tool:   CustomTool;
  tokens: AtmosphereTokens;
}

export function CustomToolBlock({ tool, tokens }: Props) {
  // Live input values keyed by input.id
  const [values, setValues] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    for (const inp of tool.inputs) init[inp.id] = inp.defaultValue;
    return init;
  });

  const result = useMemo(() => {
    return evaluateFormula(tool.formula, values);
  }, [tool.formula, values]);

  const handleReset = () => {
    const init: Record<string, number> = {};
    for (const inp of tool.inputs) init[inp.id] = inp.defaultValue;
    setValues(init);
  };

  const fmt = (n: number) =>
    tool.precision === 0
      ? String(Math.round(n))
      : n.toFixed(tool.precision);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '18px', lineHeight: 1 }}>{tool.emoji}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            fontFamily:   "'Plus Jakarta Sans', sans-serif",
            fontSize:     '13px',
            fontWeight:   700,
            color:        tokens.textPrimary,
            margin:       0,
            letterSpacing: '-0.01em',
            overflow:     'hidden',
            textOverflow: 'ellipsis',
            whiteSpace:   'nowrap',
          }}>
            {tool.name}
          </p>
          {tool.description && (
            <p style={{ fontSize: '10px', color: tokens.textGhost, margin: 0, marginTop: '1px' }}>
              {tool.description}
            </p>
          )}
        </div>
        <button
          onClick={handleReset}
          title="Reset to defaults"
          style={{
            width:           '24px',
            height:          '24px',
            borderRadius:    '7px',
            border:          'none',
            background:      'transparent',
            cursor:          'pointer',
            display:         'flex',
            alignItems:      'center',
            justifyContent:  'center',
            color:           tokens.textGhost,
            flexShrink:      0,
            transition:      'all 0.12s ease',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.background = tokens.cardBorder;
            (e.currentTarget as HTMLButtonElement).style.color = tokens.textMuted;
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
            (e.currentTarget as HTMLButtonElement).style.color = tokens.textGhost;
          }}
        >
          <RefreshCw style={{ width: '11px', height: '11px' }} />
        </button>
      </div>

      {/* Inputs */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {tool.inputs.map(inp => (
          <div key={inp.id}>
            <label style={{
              fontFamily:    "'Space Grotesk', sans-serif",
              fontSize:      '9px',
              fontWeight:    700,
              letterSpacing: '0.1em',
              textTransform: 'uppercase' as const,
              color:         tokens.textGhost,
              display:       'block',
              marginBottom:  '4px',
            }}>
              {inp.label}
            </label>
            <input
              type="number"
              value={values[inp.id] ?? inp.defaultValue}
              min={inp.min}
              max={inp.max}
              step="any"
              onChange={e => {
                const v = parseFloat(e.target.value);
                if (!isNaN(v)) setValues(prev => ({ ...prev, [inp.id]: v }));
              }}
              style={{
                width:           '100%',
                padding:         '7px 10px',
                borderRadius:    '9px',
                border:          `1px solid ${tokens.cardBorder}`,
                backgroundColor: tokens.wellBg,
                color:           tokens.textPrimary,
                fontSize:        '13px',
                fontWeight:      500,
                outline:         'none',
                boxSizing:       'border-box' as const,
                transition:      'border-color 0.15s ease',
                fontFamily:      "'Space Grotesk', monospace",
              }}
              onFocus={e => ((e.currentTarget as HTMLInputElement).style.borderColor = tokens.focusBorder)}
              onBlur={e  => ((e.currentTarget as HTMLInputElement).style.borderColor = tokens.cardBorder)}
            />
          </div>
        ))}
      </div>

      {/* Divider */}
      <div style={{ height: '1px', backgroundColor: tokens.divider }} />

      {/* Result */}
      <div
        style={{
          padding:         '12px 14px',
          borderRadius:    '12px',
          backgroundColor: result.ok ? `${tokens.accent}10` : '#ef444410',
          border:          `1px solid ${result.ok ? tokens.accent + '25' : '#ef444430'}`,
          display:         'flex',
          alignItems:      'center',
          gap:             '10px',
        }}
      >
        <Calculator
          style={{
            width:     '14px',
            height:    '14px',
            color:     result.ok ? tokens.accent : '#f87171',
            flexShrink: 0,
          }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            fontFamily:    "'Space Grotesk', sans-serif",
            fontSize:      '9px',
            fontWeight:    700,
            letterSpacing: '0.1em',
            textTransform: 'uppercase' as const,
            color:         result.ok ? tokens.accent : '#f87171',
            margin:        0,
            marginBottom:  '2px',
            opacity:       0.7,
          }}>
            {tool.outputLabel}
          </p>
          {result.ok ? (
            <p style={{
              fontFamily:    "'Space Grotesk', monospace",
              fontSize:      '22px',
              fontWeight:    700,
              color:         tokens.accent,
              margin:        0,
              letterSpacing: '-0.02em',
              lineHeight:    1,
            }}>
              {fmt(result.value)}
            </p>
          ) : (
            <p style={{ fontSize: '11px', color: '#f87171', margin: 0 }}>
              {result.error}
            </p>
          )}
        </div>
      </div>

    </div>
  );
}
