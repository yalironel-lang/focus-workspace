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
    <div style={{ minHeight: '100vh', backgroundColor: '#05070b', color: '#f8fafc' }}>

      <nav
        className="sticky top-0 z-50"
        style={{ backgroundColor: '#05070b', borderBottom: '1px solid #0f1520' }}
      >
        <div className="max-w-4xl mx-auto px-6">
          <div className="flex items-center justify-between h-11">

            <Link to="/dashboard" className="flex items-center gap-2 group">
              <div
                className="w-5 h-5 rounded flex items-center justify-center"
                style={{ backgroundColor: '#f59e0b' }}
              >
                <BookOpenCheck className="w-3 h-3 text-black" strokeWidth={2.5} />
              </div>
              <span className="font-bold text-white text-sm tracking-tight">Focus</span>
            </Link>

            {user && (
              <div className="flex items-center gap-0.5">
                <Link
                  to="/dashboard"
                  className="text-xs px-2.5 py-1.5 rounded-lg transition-colors"
                  style={pathname === '/dashboard'
                    ? { color: '#f8fafc', backgroundColor: '#0d111a' }
                    : { color: '#4b5563' }}
                  onMouseEnter={e => { if (pathname !== '/dashboard') e.currentTarget.style.color = '#94a3b8'; }}
                  onMouseLeave={e => { if (pathname !== '/dashboard') e.currentTarget.style.color = '#4b5563'; }}
                >
                  Dashboard
                </Link>
                <Link
                  to="/schedule"
                  className="text-xs px-2.5 py-1.5 rounded-lg transition-colors"
                  style={pathname === '/schedule'
                    ? { color: '#f8fafc', backgroundColor: '#0d111a' }
                    : { color: '#4b5563' }}
                  onMouseEnter={e => { if (pathname !== '/schedule') e.currentTarget.style.color = '#94a3b8'; }}
                  onMouseLeave={e => { if (pathname !== '/schedule') e.currentTarget.style.color = '#4b5563'; }}
                >
                  Schedule
                </Link>
                <span className="w-px h-3 mx-2" style={{ backgroundColor: '#0f1520' }} />
                <button
                  onClick={handleSignOut}
                  className="text-xs px-2 py-1.5 transition-colors"
                  style={{ color: '#263043' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#4b5563')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#263043')}
                >
                  Sign out
                </button>
              </div>
            )}

          </div>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-6 py-8">
        {children}
      </main>

    </div>
  );
}
