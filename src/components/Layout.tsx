import { ReactNode } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { BookOpenCheck } from 'lucide-react';
import toast from 'react-hot-toast';

export function Layout({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const handleSignOut = async () => {
    try {
      await signOut();
      toast.success('Signed out');
      navigate('/');
    } catch {
      toast.error('Failed to sign out');
    }
  };

  return (
    <div className="min-h-screen bg-[#080c14] text-slate-100">

      <nav className="sticky top-0 z-50 bg-[#080c14]/95 backdrop-blur-sm border-b border-white/[0.06]">
        <div className="max-w-4xl mx-auto px-6">
          <div className="flex items-center justify-between h-12">

            <Link to="/dashboard" className="flex items-center gap-2.5 group">
              <div className="w-6 h-6 bg-amber-500 rounded-md flex items-center justify-center group-hover:bg-amber-400 transition-colors">
                <BookOpenCheck className="w-3.5 h-3.5 text-black" strokeWidth={2.5} />
              </div>
              <span className="font-bold text-white text-sm tracking-tight">Focus</span>
            </Link>

            {user && (
              <div className="flex items-center gap-0.5">
                <Link
                  to="/dashboard"
                  className={`text-sm px-3 py-1.5 rounded-lg transition-colors ${
                    pathname === '/dashboard'
                      ? 'text-white'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  Dashboard
                </Link>
                <Link
                  to="/schedule"
                  className={`text-sm px-3 py-1.5 rounded-lg transition-colors ${
                    pathname === '/schedule'
                      ? 'text-white'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  Schedule
                </Link>
                <span className="w-px h-3.5 bg-white/10 mx-2" />
                <button
                  onClick={handleSignOut}
                  className="text-sm text-slate-600 hover:text-slate-400 px-2 py-1.5 transition-colors"
                >
                  Sign out
                </button>
              </div>
            )}

          </div>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-6 py-10">
        {children}
      </main>

    </div>
  );
}
