import { useState, useEffect } from 'react';
import { AtmosphereTokens } from '../../hooks/useAtmosphere';

interface Props {
  tokens: AtmosphereTokens;
}

const STORAGE_KEY = 'fw_daily_intention_v1';

function todayKey(): string {
  return new Date().toISOString().split('T')[0];
}

function yesterdayKey(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

interface IntentionRecord {
  date: string;
  text: string;
}

function loadRecord(): IntentionRecord | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as IntentionRecord) : null;
  } catch {
    return null;
  }
}

function loadToday(): string {
  const record = loadRecord();
  if (!record) return '';
  return record.date === todayKey() ? (record.text ?? '') : '';
}

function loadYesterday(): string {
  const record = loadRecord();
  if (!record) return '';
  return record.date === yesterdayKey() ? (record.text ?? '') : '';
}

function save(text: string) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ date: todayKey(), text }));
}

const PLACEHOLDERS = [
  'What matters most today?',
  'One word to carry into today…',
  'Today I commit to…',
  'The single most important thing is…',
  'I want to feel _______ by the end of today.',
];

const placeholder = PLACEHOLDERS[new Date().getDay() % PLACEHOLDERS.length];

export function DailyIntention({ tokens }: Props) {
  const [text,      setText]      = useState(loadToday);
  const [yesterday, setYesterday] = useState(loadYesterday);
  const [editing,   setEditing]   = useState(false);
  const [draft,     setDraft]     = useState('');

  const isEmpty = !text.trim();

  const startEdit = () => {
    setDraft(text);
    setEditing(true);
  };

  const confirm = () => {
    const val = draft.trim();
    setText(val);
    save(val);
    setEditing(false);
  };

  const cancel = () => setEditing(false);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); confirm(); }
    if (e.key === 'Escape') cancel();
  };

  // Reset at midnight / on mount
  useEffect(() => {
    setText(loadToday());
    setYesterday(loadYesterday());
  }, []);

  return (
    <div className="flex flex-col gap-0">
      {/* Yesterday's ghost — only when today is empty and yesterday had something */}
      {isEmpty && yesterday && (
        <div
          className="px-6 pb-1.5 flex items-center gap-4"
          style={{ opacity: 0.28 }}
        >
          <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: tokens.textGhost }} />
          <p
            className="text-sm italic"
            style={{ color: tokens.textGhost, textDecoration: 'line-through', textDecorationColor: `${tokens.textGhost}40` }}
          >
            {yesterday}
          </p>
        </div>
      )}

      {/* Today */}
      <div
        className="rounded-2xl px-6 py-4 flex items-center gap-4 cursor-pointer group transition-all"
        style={{
          backgroundColor: tokens.cardBg,
          border:     `1px solid ${tokens.cardBorder}`,
          boxShadow:  editing ? `0 0 0 1px ${tokens.accentSubtle}` : 'none',
        }}
        onClick={() => !editing && startEdit()}
      >
        {/* Accent dot */}
        <div
          className="w-1.5 h-1.5 rounded-full flex-shrink-0 transition-all"
          style={{
            backgroundColor: isEmpty ? tokens.cardBorder : tokens.accent,
            boxShadow: isEmpty ? 'none' : `0 0 8px ${tokens.accentGlow}`,
          }}
        />

        {editing ? (
          <input
            autoFocus
            type="text"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={confirm}
            onKeyDown={handleKey}
            placeholder={placeholder}
            className="flex-1 bg-transparent focus:outline-none text-sm font-medium"
            style={{ color: tokens.textPrimary }}
          />
        ) : (
          <p
            className="flex-1 text-sm font-medium select-none transition-colors"
            style={{ color: isEmpty ? tokens.textGhost : tokens.textPrimary }}
          >
            {isEmpty ? placeholder : text}
          </p>
        )}

        {/* Edit hint */}
        {!editing && (
          <span
            className="text-[10px] opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
            style={{
              fontFamily:    "'Space Grotesk', sans-serif",
              letterSpacing: '0.1em',
              color:         tokens.textGhost,
            }}
          >
            {isEmpty ? 'SET INTENTION' : 'EDIT'}
          </span>
        )}
      </div>
    </div>
  );
}
