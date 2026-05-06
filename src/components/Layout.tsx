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
    <div className="min-h-screen" style={{ backgroundColor: '#05070b', color: '#f8fafc' }}>

      <nav style={{ backgroundColor: '#080b12', borderBottom: '1px solid #263043' }}
           className="sticky top-0 z-50 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-6">
          <div className="flex items-center justify-between h-12">

            <Link to="/dashboard" className="flex items-center gap-2.5 group">
              <div className="w-6 h-6 rounded-md flex items-center justify-center transition-colors"
                   style={{ backgroundColor: '#f59e0b' }}>
                <BookOpenCheck className="w-3.5 h-3.5 text-black" strokeWidth={2.5} />
              </div>
              <span className="font-bold text-white text-sm tracking-tight">Focus</span>
            </Link>

            {user && (
              <div className="flex items-center gap-0.5">
                <Link
                  to="/dashboard"
                  className="text-sm px-3 py-1.5 rounded-lg transition-colors"
                  style={pathname === '/dashboard'
                    ? { backgroundColor: '#111827', color: '#f8fafc' }
                    : { color: '#94a3b8' }}
                >
                  Dashboard
                </Link>
                <Link
                  to="/schedule"
                  className="text-sm px-3 py-1.5 rounded-lg transition-colors"
                  style={pathname === '/schedule'
                    ? { backgroundColor: '#111827', color: '#f8fafc' }
                    : { color: '#94a3b8' }}
                >
                  Schedule
                </Link>
                <span className="w-px h-3.5 mx-2" style={{ backgroundColor: '#263043' }} />
                <button
                  onClick={handleSignOut}
                  className="text-sm px-2 py-1.5 transition-colors"
                  style={{ color: '#94a3b8' }}
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
