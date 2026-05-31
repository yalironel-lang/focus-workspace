import { useMemo, useState } from 'react';
import type { AtmosphereTokens } from '../../../hooks/useAtmosphere';
import type { DeskFormulaItem } from '../../../lib/mathDesk/types';
import { deskFormulaUid } from '../../../lib/mathDesk/types';
import { renderKatexHtml } from '../../../lib/notebookMath';

interface Props {
  tokens: AtmosphereTokens;
  formulas: DeskFormulaItem[];
  onChange: (next: DeskFormulaItem[]) => void;
  compact?: boolean;
}

type Draft = {
  topic: string;
  formula: string;
  meaning: string;
  whenToUse: string;
  remember: string;
};

const emptyDraft = (): Draft => ({
  topic: '',
  formula: '',
  meaning: '',
  whenToUse: '',
  remember: '',
});

function FormulaPreview({ tex }: { tex: string }) {
  const html = useMemo(() => {
    const t = tex.trim();
    if (!t) return null;
    const r = renderKatexHtml(t, false);
    return r.error ? null : r.html;
  }, [tex]);
  if (!html) return null;
  return <div style={{ fontSize: 10, marginTop: 2, opacity: 0.85 }} dangerouslySetInnerHTML={{ __html: html }} />;
}

export function DeskFormulaMemory({ tokens, formulas, onChange, compact }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(formulas.length === 0);
  const [showMore, setShowMore] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editId, setEditId] = useState<string | null>(null);

  const fieldStyle = {
    width: '100%',
    border: 'none',
    borderBottom: `1px solid ${tokens.cardBorder}`,
    background: 'transparent',
    color: tokens.textPrimary,
    fontSize: 11,
    padding: '5px 2px',
    boxSizing: 'border-box' as const,
    outline: 'none',
  };

  const saveDraft = () => {
    const topic = draft.topic.trim();
    const formula = draft.formula.trim();
    if (!topic || !formula) return;
    const now = Date.now();
    if (editId) {
      onChange(
        formulas.map(f =>
          f.id === editId
            ? {
                ...f,
                topic,
                formula,
                meaning: draft.meaning.trim() || undefined,
                whenToUse: draft.whenToUse.trim() || undefined,
                remember: draft.remember.trim() || undefined,
                updatedAt: now,
              }
            : f,
        ),
      );
    } else {
      onChange([
        ...formulas,
        {
          id: deskFormulaUid(),
          topic,
          formula,
          meaning: draft.meaning.trim() || undefined,
          whenToUse: draft.whenToUse.trim() || undefined,
          remember: draft.remember.trim() || undefined,
          createdAt: now,
          updatedAt: now,
        },
      ]);
    }
    setDraft(emptyDraft());
    setAdding(false);
    setEditId(null);
    setShowMore(false);
  };

  const startEdit = (f: DeskFormulaItem) => {
    setEditId(f.id);
    setAdding(true);
    setShowMore(Boolean(f.meaning || f.whenToUse || f.remember));
    setDraft({
      topic: f.topic,
      formula: f.formula,
      meaning: f.meaning ?? '',
      whenToUse: f.whenToUse ?? '',
      remember: f.remember ?? '',
    });
    setExpandedId(f.id);
  };

  const formBlock = adding ? (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 6 }}>
      <input
        placeholder="Topic"
        value={draft.topic}
        onChange={e => setDraft(d => ({ ...d, topic: e.target.value }))}
        style={fieldStyle}
      />
      <input
        placeholder="Formula"
        value={draft.formula}
        onChange={e => setDraft(d => ({ ...d, formula: e.target.value }))}
        style={{ ...fieldStyle, fontFamily: 'ui-monospace, monospace' }}
      />
      <FormulaPreview tex={draft.formula} />
      {showMore ? (
        <>
          <input placeholder="Meaning" value={draft.meaning} onChange={e => setDraft(d => ({ ...d, meaning: e.target.value }))} style={fieldStyle} />
          <input placeholder="When to use" value={draft.whenToUse} onChange={e => setDraft(d => ({ ...d, whenToUse: e.target.value }))} style={fieldStyle} />
          <input placeholder="Remember" value={draft.remember} onChange={e => setDraft(d => ({ ...d, remember: e.target.value }))} style={fieldStyle} />
        </>
      ) : (
        <button
          type="button"
          onClick={() => setShowMore(true)}
          style={{ fontSize: 10, color: tokens.textGhost, background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' }}
        >
          + more fields
        </button>
      )}
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          type="button"
          onClick={saveDraft}
          style={{
            fontSize: 10,
            padding: '4px 10px',
            borderRadius: 4,
            border: 'none',
            background: tokens.accent,
            color: '#fff',
            cursor: 'pointer',
          }}
        >
          Save
        </button>
        {formulas.length > 0 || editId ? (
          <button
            type="button"
            onClick={() => {
              setAdding(false);
              setEditId(null);
              setDraft(emptyDraft());
              setShowMore(false);
            }}
            style={{ fontSize: 10, color: tokens.textGhost, background: 'none', border: 'none', cursor: 'pointer' }}
          >
            Cancel
          </button>
        ) : null}
      </div>
    </div>
  ) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, maxHeight: compact ? 220 : undefined }}>
      {!compact ? (
        <div style={{ fontSize: 9, color: tokens.textGhost, marginBottom: 6, letterSpacing: '0.08em' }}>REFERENCES</div>
      ) : null}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {formulas.length === 0 && !adding ? (
          <p style={{ fontSize: 10, color: tokens.textGhost, lineHeight: 1.4, margin: '0 0 6px' }}>
            Pin a formula for this problem.
          </p>
        ) : null}
        {formBlock}
        {formulas.map(f => {
          const open = expandedId === f.id;
          return (
            <div key={f.id} style={{ marginBottom: 4, borderBottom: `1px solid ${tokens.cardBorder}44` }}>
              <button
                type="button"
                onClick={() => setExpandedId(open ? null : f.id)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '5px 0',
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontSize: 10, fontWeight: 600, color: tokens.textPrimary }}>{f.topic}</div>
                <div style={{ fontSize: 9, fontFamily: 'ui-monospace, monospace', color: tokens.textMuted, marginTop: 1 }}>
                  {f.formula}
                </div>
              </button>
              {open ? (
                <div style={{ paddingBottom: 6, fontSize: 10, color: tokens.textMuted, lineHeight: 1.4 }}>
                  <FormulaPreview tex={f.formula} />
                  {f.meaning ? <div style={{ marginTop: 4 }}>{f.meaning}</div> : null}
                  {f.whenToUse ? <div style={{ marginTop: 2, opacity: 0.9 }}>{f.whenToUse}</div> : null}
                  {f.remember ? <div style={{ marginTop: 2, fontStyle: 'italic' }}>{f.remember}</div> : null}
                  <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                    <button type="button" onClick={() => startEdit(f)} style={{ fontSize: 9, color: tokens.accent, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onChange(formulas.filter(x => x.id !== f.id));
                        if (expandedId === f.id) setExpandedId(null);
                      }}
                      style={{ fontSize: 9, color: tokens.textGhost, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      {!adding && formulas.length > 0 ? (
        <button
          type="button"
          onClick={() => {
            setAdding(true);
            setEditId(null);
            setDraft(emptyDraft());
            setShowMore(false);
          }}
          style={{
            marginTop: 4,
            fontSize: 10,
            color: tokens.accent,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            textAlign: 'left',
          }}
        >
          + add
        </button>
      ) : null}
    </div>
  );
}
