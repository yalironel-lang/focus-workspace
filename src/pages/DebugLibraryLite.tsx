import { useAuth } from '../hooks/useAuth';
import { useSections } from '../hooks/useSections';

/** Isolation: auth + list hook only — not WorkspaceLibrary. */
export function DebugLibraryLite() {
  const { user, loading: authLoading } = useAuth();
  const { sections, loading: sectionsLoading, error } = useSections();

  if (authLoading) return <p>Auth loading…</p>;
  if (!user) return <p>Not signed in — open <a href="/">/</a> to sign in.</p>;

  return (
    <div style={{ padding: 24, fontFamily: 'system-ui' }}>
      <p>Debug library lite</p>
      {sectionsLoading && <p>Sections loading…</p>}
      {error && <p style={{ color: 'crimson' }}>Error: {error}</p>}
      <ul>
        {sections.map(s => (
          <li key={s.id}>
            {s.title}{' '}
            <a href={`/section/${s.id}`}>Open</a>
          </li>
        ))}
      </ul>
    </div>
  );
}
