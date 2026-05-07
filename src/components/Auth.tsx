import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Mail, ArrowRight, Loader2, BookOpenCheck, CheckCircle } from 'lucide-react';
import toast from 'react-hot-toast';

export function Auth() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const { signInWithEmail } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    try {
      await signInWithEmail(email);
      setSent(true);
    } catch {
      toast.error('Failed to send magic link');
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div
        className="min-h-screen flex items-center justify-center px-6"
        style={{ backgroundColor: '#070b14' }}
      >
        <div className="max-w-sm w-full text-center">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-6"
            style={{ backgroundColor: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.2)' }}
          >
            <CheckCircle className="w-7 h-7" style={{ color: '#34d399' }} />
          </div>
          <h2 className="text-xl font-bold mb-2" style={{ color: '#f1f5f9' }}>
            Check your inbox
          </h2>
          <p className="text-sm mb-1" style={{ color: '#475569' }}>
            Magic link sent to
          </p>
          <p className="font-semibold text-sm mb-6 truncate" style={{ color: '#94a3b8' }}>
            {email}
          </p>
          <p className="text-xs mb-7" style={{ color: '#334155' }}>
            Click the link in the email to sign in. No password needed.
          </p>
          <button
            onClick={() => setSent(false)}
            className="text-sm font-semibold transition-colors"
            style={{ color: '#f59e0b' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#fbbf24')}
            onMouseLeave={e => (e.currentTarget.style.color = '#f59e0b')}
          >
            Use a different email →
          </button>
        </div>
      </div>
    );
  }

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
          style={{
            backgroundColor: '#0d1424',
            border: '1px solid #1a2638',
          }}
        >
          <p
            className="text-[10px] font-bold uppercase tracking-widest mb-5"
            style={{ color: '#334155' }}
          >
            Get started
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                className="block text-xs font-semibold uppercase tracking-wider mb-2"
                style={{ color: '#334155' }}
              >
                Email address
              </label>
              <div className="relative">
                <Mail
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
                  style={{ color: '#2a3a54' }}
                />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full pl-10 pr-4 py-3 rounded-xl text-sm transition-all focus:outline-none"
                  style={{
                    backgroundColor: '#070b14',
                    border: '1px solid #1a2638',
                    color: '#f1f5f9',
                  }}
                  onFocus={e => (e.currentTarget.style.borderColor = '#f59e0b')}
                  onBlur={e => (e.currentTarget.style.borderColor = '#1a2638')}
                  required
                  autoFocus
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !email.trim()}
              className="w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-30"
              style={{ backgroundColor: '#f59e0b', color: '#000' }}
              onMouseEnter={e => { if (!loading && email.trim()) e.currentTarget.style.backgroundColor = '#fbbf24'; }}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#f59e0b')}
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  Continue with email
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <p
            className="text-center text-xs mt-5 leading-relaxed"
            style={{ color: '#2a3a50' }}
          >
            We'll email you a secure sign-in link.<br />No password required.
          </p>
        </div>

        {/* Feature hints */}
        <div className="mt-8 grid grid-cols-3 gap-3 text-center">
          {[
            { label: 'Workspaces', sub: 'per course or project' },
            { label: 'Focus sessions', sub: 'one task at a time' },
            { label: 'Deadlines', sub: 'never miss a date' },
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
