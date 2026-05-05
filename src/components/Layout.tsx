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
    <div className="min-h-screen bg-[#070b14] text-slate-100">
      {/* Nav */}
      <nav className="bg-[#070b14]/95 border-b border-[#1a2236] sticky top-0 z-50 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="flex justify-between h-14 items-center">

            {/* Logo */}
            <Link to="/dashboard" className="flex items-center gap-2 group flex-shrink-0">
              <div className="w-7 h-7 bg-emerald-500 rounded-lg flex items-center justify-center shadow-sm group-hover:bg-emerald-400 transition-colors">
                <BookOpenCheck className="w-4 h-4 text-black" strokeWidth={2.5} />
              </div>
              <span className="font-extrabold text-white text-[15px] tracking-tight">Focus</span>
            </Link>

            {/* Nav links + user */}
            {user && (
              <div className="flex items-center gap-0.5">

                <Link
                  to="/dashboard"
                  className={`flex items-center gap-1.5 text-sm px-2.5 py-1.5 rounded-lg transition-colors font-medium ${
                    pathname === '/dashboard'
                      ? 'bg-[#1a2236] text-white'
                      : 'text-slate-500 hover:text-slate-200 hover:bg-[#1a2236]'
                  }`}
                >
                  <LayoutDashboard className="w-4 h-4" />
                  <span className="hidden sm:inline">Dashboard</span>
                </Link>

                <Link
                  to="/schedule"
                  className={`flex items-center gap-1.5 text-sm px-2.5 py-1.5 rounded-lg transition-colors font-medium ${
                    pathname === '/schedule'
                      ? 'bg-[#1a2236] text-white'
                      : 'text-slate-500 hover:text-slate-200 hover:bg-[#1a2236]'
                  }`}
                >
                  <CalendarDays className="w-4 h-4" />
                  <span className="hidden sm:inline">Schedule</span>
                </Link>

                {/* Divider */}
                <span className="hidden sm:block w-px h-4 bg-[#1a2236] mx-1.5" />

                <span className="hidden sm:block text-xs text-slate-600 font-medium px-1 truncate max-w-[160px]">
                  {user.email}
                </span>

                <button
                  onClick={handleSignOut}
                  title="Sign out"
                  className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-200 px-2.5 py-1.5 rounded-lg hover:bg-[#1a2236] transition-colors"
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
