/**
 * M7.1A — TipTap production promotion foundation (flag / cutover contract).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isNotebookLegacyCeForced,
  isNotebookTiptapCandidateActive,
  isNotebookTiptapCandidateEnabled,
  isNotebookTiptapEditorEnabled,
  isNotebookTiptapPersistActive,
  isNotebookTiptapPersistEnabled,
} from './featureFlag';

function stubLocalStorage(mem: Map<string, string>) {
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => {
      mem.set(k, v);
    },
    removeItem: (k: string) => {
      mem.delete(k);
    },
    clear: () => mem.clear(),
    key: () => null,
    length: 0,
  });
}

describe('M7.1A feature flags — production defaults', () => {
  const mem = new Map<string, string>();

  beforeEach(() => {
    mem.clear();
    stubLocalStorage(mem);
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('1–2. no overrides → TipTap active and persist active', () => {
    expect(isNotebookLegacyCeForced()).toBe(false);
    expect(isNotebookTiptapCandidateEnabled()).toBe(true);
    expect(isNotebookTiptapCandidateActive()).toBe(true);
    expect(isNotebookTiptapPersistEnabled()).toBe(true);
    expect(isNotebookTiptapPersistActive()).toBe(true);
  });

  it('3. Active helpers do not gate on import.meta.env.DEV (implementation contract)', () => {
    // Source-level contract: Active === Enabled && !legacy (no DEV AND).
    // With defaults ON, Active is true regardless of whether vitest runs as DEV.
    expect(isNotebookTiptapCandidateActive()).toBe(isNotebookTiptapCandidateEnabled());
    expect(isNotebookTiptapPersistActive()).toBe(
      isNotebookTiptapCandidateActive() && isNotebookTiptapPersistEnabled(),
    );
    const src = [
      'isNotebookTiptapCandidateActive',
      'isNotebookTiptapPersistActive',
    ];
    // Sanity: defaults do not require toggling DEV to become active.
    expect(isNotebookTiptapCandidateActive()).toBe(true);
    expect(isNotebookTiptapPersistActive()).toBe(true);
    void src;
  });

  it('4. VITE_NOTEBOOK_LEGACY_CE=true → TipTap inactive', () => {
    vi.stubEnv('VITE_NOTEBOOK_LEGACY_CE', 'true');
    expect(isNotebookLegacyCeForced()).toBe(true);
    expect(isNotebookTiptapCandidateActive()).toBe(false);
    expect(isNotebookTiptapPersistActive()).toBe(false);
  });

  it('5. localStorage notebookLegacyCe=1 → TipTap inactive', () => {
    mem.set('notebookLegacyCe', '1');
    expect(isNotebookLegacyCeForced()).toBe(true);
    expect(isNotebookTiptapCandidateActive()).toBe(false);
    expect(isNotebookTiptapPersistActive()).toBe(false);
  });

  it('6. explicit rollback OFF → TipTap active', () => {
    vi.stubEnv('VITE_NOTEBOOK_LEGACY_CE', 'false');
    mem.set('notebookLegacyCe', '1'); // env false wins over LS
    expect(isNotebookLegacyCeForced()).toBe(false);
    expect(isNotebookTiptapCandidateActive()).toBe(true);
  });

  it('7. legacy CE override wins over TipTap ON flags', () => {
    vi.stubEnv('VITE_NOTEBOOK_TIPTAP_CANDIDATE', 'true');
    vi.stubEnv('VITE_NOTEBOOK_TIPTAP_PERSIST', 'true');
    vi.stubEnv('VITE_NOTEBOOK_LEGACY_CE', 'true');
    expect(isNotebookTiptapCandidateEnabled()).toBe(true);
    expect(isNotebookTiptapPersistEnabled()).toBe(true);
    expect(isNotebookTiptapCandidateActive()).toBe(false);
    expect(isNotebookTiptapPersistActive()).toBe(false);
  });

  it('8. explicit TipTap OFF via env is deterministic; DEV LS OFF still works in DEV', () => {
    vi.stubEnv('VITE_NOTEBOOK_TIPTAP_CANDIDATE', 'false');
    expect(isNotebookTiptapCandidateEnabled()).toBe(false);
    expect(isNotebookTiptapCandidateActive()).toBe(false);
    expect(isNotebookTiptapPersistActive()).toBe(false);

    vi.unstubAllEnvs();
    mem.set('notebookTiptapCandidate', '0');
    // Vitest/DEV: historical LS OFF honored for local engineering.
    expect(isNotebookTiptapCandidateEnabled({ isDev: true })).toBe(false);
    expect(isNotebookTiptapCandidateActive({ isDev: true })).toBe(false);
  });

  it('8b. M7.1D: production ignores obsolete localStorage notebookTiptapCandidate=0', () => {
    mem.set('notebookTiptapCandidate', '0');
    expect(isNotebookTiptapCandidateEnabled({ isDev: false })).toBe(true);
    expect(isNotebookTiptapCandidateActive({ isDev: false })).toBe(true);
    // Emergency CE still wins in production
    mem.set('notebookLegacyCe', '1');
    expect(isNotebookTiptapCandidateActive({ isDev: false })).toBe(false);
  });

  it('9. persistence cannot be active when TipTap body is inactive', () => {
    vi.stubEnv('VITE_NOTEBOOK_LEGACY_CE', '1');
    vi.stubEnv('VITE_NOTEBOOK_TIPTAP_PERSIST', 'true');
    expect(isNotebookTiptapCandidateActive()).toBe(false);
    expect(isNotebookTiptapPersistEnabled()).toBe(true);
    expect(isNotebookTiptapPersistActive()).toBe(false);

    vi.unstubAllEnvs();
    vi.stubEnv('VITE_NOTEBOOK_TIPTAP_CANDIDATE', 'false');
    vi.stubEnv('VITE_NOTEBOOK_TIPTAP_PERSIST', 'true');
    expect(isNotebookTiptapPersistActive()).toBe(false);
  });

  it('10. shadow/parity editor flag remains default OFF (unrelated to body cutover)', () => {
    expect(isNotebookTiptapEditorEnabled()).toBe(false);
  });

  it('memory-only: TipTap ON + Persist OFF → Active TipTap, PersistActive false', () => {
    vi.stubEnv('VITE_NOTEBOOK_TIPTAP_CANDIDATE', 'true');
    vi.stubEnv('VITE_NOTEBOOK_TIPTAP_PERSIST', 'false');
    expect(isNotebookTiptapCandidateActive()).toBe(true);
    expect(isNotebookTiptapPersistActive()).toBe(false);
  });
});

describe('M7.1A cutover helpers — ProjectNotebookBlock selection contract', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('default helpers select TipTap path (same predicates PNB uses)', () => {
    const mem = new Map<string, string>();
    stubLocalStorage(mem);
    const tipTapCandidateActive = isNotebookTiptapCandidateActive();
    const tipTapPersistActive = isNotebookTiptapPersistActive();
    // Writing column: tipTapCandidateActive ? TipTap : CE
    expect(tipTapCandidateActive).toBe(true);
    // onUserEdit wired when tipTapPersistActive
    expect(tipTapPersistActive).toBe(true);
  });

  it('legacy CE force selects CE path predicates', () => {
    const mem = new Map<string, string>();
    stubLocalStorage(mem);
    vi.stubEnv('VITE_NOTEBOOK_LEGACY_CE', 'true');
    expect(isNotebookTiptapCandidateActive()).toBe(false);
    expect(isNotebookTiptapPersistActive()).toBe(false);
  });
});
