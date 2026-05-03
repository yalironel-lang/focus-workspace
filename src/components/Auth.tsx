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
      <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: '#f8f9fc' }}>
        <div className="max-w-sm w-full bg-white rounded-2xl shadow-lg border border-slate-100 p-8 text-center animate-slide-up">
          <div className="w-14 h-14 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-5">
            <CheckCircle className="w-7 h-7 text-emerald-500" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Check your inbox</h2>
          <p className="text-slate-500 text-sm leading-relaxed mb-1">Magic link sent to</p>
          <p className="font-semibold text-slate-800 text-sm mb-6 truncate">{email}</p>
          <p className="text-xs text-slate-400 mb-5">Click the link in the email to sign in instantly.</p>
          <button
            onClick={() => setSent(false)}
            className="text-sm text-primary-600 hover:text-primary-700 font-semibold transition-colors"
          >
            Use a different email →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: '#f8f9fc' }}>
      <div className="max-w-sm w-full animate-fade-in">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-primary-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <BookOpenCheck className="w-7 h-7 text-white" strokeWidth={2.5} />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Focus Workspace</h1>
          <p className="text-slate-400 text-sm mt-1.5">Your personal study command center</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-7 animate-slide-up">
          <h2 className="text-base font-semibold text-slate-800 mb-5">Sign in to your workspace</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                Email address
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
                  required
                  autoFocus
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !email.trim()}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white font-semibold py-2.5 rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed text-sm shadow-sm active:scale-[0.99]"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  Send Magic Link
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <p className="text-center text-xs text-slate-400 mt-5 leading-relaxed">
            No password needed — we'll email you a secure sign-in link.
          </p>
        </div>
      </div>
    </div>
  );
}
