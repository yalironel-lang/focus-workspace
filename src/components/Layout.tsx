import { ReactNode } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { LogOut, BookOpenCheck, CalendarDays, LayoutDashboard } from 'lucide-react';
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
    <div className="min-h-screen bg-[#f5f6fa]">
      {/* Nav */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-[0_1px_0_rgba(0,0,0,0.06)]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="flex justify-between h-14 items-center">

            {/* Logo */}
            <Link to="/dashboard" className="flex items-center gap-2 group flex-shrink-0">
              <div className="w-7 h-7 bg-primary-600 rounded-lg flex items-center justify-center shadow-sm group-hover:bg-primary-700 transition-colors">
                <BookOpenCheck className="w-4 h-4 text-white" strokeWidth={2.5} />
              </div>
              <span className="font-extrabold text-slate-900 text-[15px] tracking-tight">Focus</span>
            </Link>

            {/* Nav links + user */}
            {user && (
              <div className="flex items-center gap-0.5">

                <Link
                  to="/dashboard"
                  className={`flex items-center gap-1.5 text-sm px-2.5 py-1.5 rounded-lg transition-colors font-medium ${
                    pathname === '/dashboard'
                      ? 'bg-slate-100 text-slate-900'
                      : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <LayoutDashboard className="w-4 h-4" />
                  <span className="hidden sm:inline">Dashboard</span>
                </Link>

                <Link
                  to="/schedule"
                  className={`flex items-center gap-1.5 text-sm px-2.5 py-1.5 rounded-lg transition-colors font-medium ${
                    pathname === '/schedule'
                      ? 'bg-primary-50 text-primary-700'
                      : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <CalendarDays className="w-4 h-4" />
                  <span className="hidden sm:inline">Schedule</span>
                </Link>

                {/* Divider */}
                <span className="hidden sm:block w-px h-4 bg-slate-200 mx-1.5" />

                <span className="hidden sm:block text-xs text-slate-400 font-medium px-1 truncate max-w-[160px]">
                  {user.email}
                </span>

                <button
                  onClick={handleSignOut}
                  title="Sign out"
                  className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="hidden sm:inline font-medium">Sign out</span>
                </button>

              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Main */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {children}
      </main>
    </div>
  );
}
