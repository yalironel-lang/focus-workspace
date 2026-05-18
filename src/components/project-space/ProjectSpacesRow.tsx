import { useState, useRef, useEffect } from 'react';
import type { FreeSpaceBoard } from '../../hooks/useSectionFreeSpaceBoards';

interface Props {
  boards: FreeSpaceBoard[];
  activeBoardId: string;
  onSelect: (id: string) => void;
  onCreate: (name: string) => void;
}

export function ProjectSpacesRow({ boards, activeBoardId, onSelect, onCreate }: Props) {
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (creating) inputRef.current?.focus();
  }, [creating]);

  const commit = () => {
    const name = draft.trim();
    if (name) onCreate(name);
    setCreating(false);
    setDraft('');
  };

  const cancel = () => { setCreating(false); setDraft(''); };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '0 0 10px',
        flexWrap: 'wrap',
      }}
    >
      <span style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginRight: 2 }}>
        Spaces
      </span>

      {boards.map(board => (
        <SpacePill
          key={board.id}
          label={board.name}
          active={board.id === activeBoardId}
          onClick={() => onSelect(board.id)}
        />
      ))}

      {creating ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input
            ref={inputRef}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') commit();
              if (e.key === 'Escape') cancel();
            }}
            onBlur={commit}
            placeholder="Space name…"
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: '#1e293b',
              border: '1.5px solid #6366f1',
              borderRadius: 20,
              padding: '3px 12px',
              outline: 'none',
              background: '#fff',
              width: 120,
            }}
          />
        </div>
      ) : (
        <button
          onClick={() => setCreating(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '3px 10px 3px 8px',
            border: '1.5px dashed #cbd5e1',
            borderRadius: 20,
            background: 'transparent',
            cursor: 'pointer',
            fontSize: 11,
            fontWeight: 600,
            color: '#94a3b8',
            transition: 'border-color 0.1s, color 0.1s',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = '#6366f1';
            e.currentTarget.style.color = '#6366f1';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = '#cbd5e1';
            e.currentTarget.style.color = '#94a3b8';
          }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M5 2v6M2 5h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          New Space
        </button>
      )}
    </div>
  );
}

function SpacePill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '3px 12px',
        borderRadius: 20,
        border: active ? '1.5px solid #6366f1' : '1.5px solid transparent',
        background: active ? '#eef2ff' : 'rgba(0,0,0,0.04)',
        color: active ? '#4338ca' : '#475569',
        fontSize: 12,
        fontWeight: active ? 700 : 500,
        cursor: 'pointer',
        transition: 'all 0.1s',
        whiteSpace: 'nowrap',
      }}
      onMouseEnter={e => {
        if (!active) e.currentTarget.style.background = 'rgba(0,0,0,0.07)';
      }}
      onMouseLeave={e => {
        if (!active) e.currentTarget.style.background = 'rgba(0,0,0,0.04)';
      }}
    >
      {label}
    </button>
  );
}
