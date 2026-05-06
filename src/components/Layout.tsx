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
    <div style={{ minHeight: '100vh', backgroundColor: '#070b14', color: '#f1f5f9' }}>

      <nav
        className="sticky top-0 z-50"
        style={{
          backgroundColor: 'rgba(7,11,20,0.92)',
          borderBottom: '1px solid #131d2e',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        }}
      >
        <div className="max-w-4xl mx-auto px-6">
          <div className="flex items-center justify-between h-12">

            <Link to="/dashboard" className="flex items-center gap-2.5 group">
              <div
                className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: '#f59e0b' }}
              >
                <BookOpenCheck className="w-3.5 h-3.5 text-black" strokeWidth={2.5} />
              </div>
              <span className="font-bold text-white text-sm tracking-tight">Focus</span>
            </Link>

            {user && (
              <div className="flex items-center gap-1">
                {[
                  { to: '/dashboard', label: 'Dashboard' },
                  { to: '/schedule',  label: 'Schedule'  },
                ].map(({ to, label }) => {
                  const active = pathname === to;
                  return (
                    <Link
                      key={to}
                      to={to}
                      className="text-xs px-3 py-1.5 rounded-lg font-medium transition-all"
                      style={active
                        ? { color: '#f1f5f9', backgroundColor: '#1a2638' }
                        : { color: '#4b5563' }
                      }
                      onMouseEnter={e => { if (!active) { e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.backgroundColor = '#0f1826'; } }}
                      onMouseLeave={e => { if (!active) { e.currentTarget.style.color = '#4b5563'; e.currentTarget.style.backgroundColor = 'transparent'; } }}
                    >
                      {label}
                    </Link>
                  );
                })}

                <span className="w-px h-3.5 mx-2" style={{ backgroundColor: '#131d2e' }} />

                <button
                  onClick={handleSignOut}
                  className="text-xs px-2.5 py-1.5 rounded-lg font-medium transition-all"
                  style={{ color: '#4b5563' }}
                  onMouseEnter={e => { e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.backgroundColor = '#0f1826'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = '#4b5563'; e.currentTarget.style.backgroundColor = 'transparent'; }}
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
