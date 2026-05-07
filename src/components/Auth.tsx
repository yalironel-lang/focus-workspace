import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Loader2, BookOpenCheck } from 'lucide-react';
import toast from 'react-hot-toast';

/** Google "G" SVG — inline so there's no external icon dependency */
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"
        fill="#34A853"
      />
      <path
        d="M3.964 10.706A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.038l3.007-2.332z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58z"
        fill="#EA4335"
      />
    </svg>
  );
}

export function Auth() {
  const [loading, setLoading] = useState(false);
  const { signInWithGoogle } = useAuth();

  const handleGoogle = async () => {
    setLoading(true);
    try {
      await signInWithGoogle();
      // Browser will redirect to Google — no further action needed here.
    } catch {
      toast.error('Failed to start Google sign-in');
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-6"
      style={{ backgroundColor: '#070b14' }}
    >
      <div className="max-w-sm w-full">

        {/* Logo + headline */}
        <div className="text-center mb-10">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-5"
            style={{ backgroundColor: '#f59e0b' }}
          >
            <BookOpenCheck className="w-6 h-6 text-black" strokeWidth={2.5} />
          </div>
          <h1
            className="text-3xl font-bold tracking-tight mb-3"
            style={{ color: '#f1f5f9' }}
          >
            Focus
          </h1>
          <p
            className="text-sm leading-relaxed"
            style={{ color: '#475569' }}
          >
            Build a workspace that matches<br />how you actually think.
          </p>
        </div>

        {/* Sign-in card */}
        <div
          className="rounded-2xl p-7"
          style={{ backgroundColor: '#0d1424', border: '1px solid #1a2638' }}
        >
          <p
            className="text-[10px] font-bold uppercase tracking-widest mb-5"
            style={{
              fontFamily: "'Space Grotesk', sans-serif",
              letterSpacing: '0.14em',
              color: '#334155',
            }}
          >
            Get started
          </p>

          <button
            type="button"
            onClick={handleGoogle}
            disabled={loading}
            className="w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-3 transition-all disabled:opacity-50"
            style={{
              backgroundColor: '#fff',
              color: '#1a1a1a',
              border: '1px solid #e2e8f0',
            }}
            onMouseEnter={e => {
              if (!loading) (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#f8fafc';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#fff';
            }}
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" style={{ color: '#334155' }} />
            ) : (
              <GoogleIcon />
            )}
            Continue with Google
          </button>
        </div>

        {/* Feature hints */}
        <div className="mt-8 grid grid-cols-3 gap-3 text-center">
          {[
            { label: 'Workspaces',     sub: 'per course or project' },
            { label: 'Focus sessions', sub: 'one task at a time'    },
            { label: 'Deadlines',      sub: 'never miss a date'     },
          ].map(({ label, sub }) => (
            <div key={label}>
              <p className="text-xs font-semibold mb-0.5" style={{ color: '#334155' }}>{label}</p>
              <p className="text-[10px]" style={{ color: '#1e2d40' }}>{sub}</p>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}
