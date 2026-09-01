import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { isSupabaseConfigured } from '../lib/supabase';
import { Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { ZikukLogo } from './ZikukLogo';

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

/** Approved 3D ribbon artwork — single background system */
function ZikukAuthBackground() {
  return (
    <div
      className="pointer-events-none absolute inset-0 z-[1] overflow-hidden motion-reduce:[&_*]:!animate-none"
      aria-hidden
    >
      <div className="auth-bg-drift-wrap animate-[auth-bg-reveal_0.45s_ease-out_both] motion-reduce:animate-none">
        <div className="auth-bg-drift-motion">
          <picture className="absolute inset-0 block">
            <source srcSet="/branding/zikuk-auth-ribbons.avif" type="image/avif" />
            <source srcSet="/branding/zikuk-auth-ribbons.webp" type="image/webp" />
            <img
              src="/branding/zikuk-auth-ribbons.png"
              alt=""
              fetchPriority="high"
              decoding="sync"
              className="auth-bg-image absolute inset-0 h-full w-full"
            />
          </picture>
        </div>
      </div>

      {/* Opposing ambient depth — static blur, transform-only motion */}
      <div className="auth-bg-ambient-light motion-reduce:hidden" />

      {/* Subtle edge vignette — preserves image lighting */}
      <div className="auth-bg-vignette-edge absolute inset-0" />

      {/* Mobile-only center readability boost */}
      <div className="auth-bg-vignette-mobile absolute inset-0 md:hidden" />
    </div>
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
      className="relative min-h-dvh overflow-hidden"
      style={{ backgroundColor: '#000119' }}
    >
      <ZikukAuthBackground />

      <main className="relative z-10 flex min-h-dvh items-center justify-center px-5 py-10 sm:px-6 sm:py-12">
        <div
          className="w-full max-w-[400px] animate-[auth-enter_0.55s_cubic-bezier(0.22,1,0.36,1)_both] motion-reduce:animate-none"
          style={{ animationDelay: '350ms' }}
        >
          {/* Brand anchor */}
          <header className="mb-7 text-center sm:mb-8">
            <div className="relative mx-auto mb-5 w-fit sm:mb-5">
              <div
                className="pointer-events-none absolute inset-0 -m-4 rounded-[28px] blur-2xl"
                aria-hidden
                style={{
                  background:
                    'radial-gradient(circle, rgba(236,72,153,0.1) 0%, rgba(99,102,241,0.06) 42%, transparent 72%)',
                }}
              />
              <ZikukLogo size={72} className="relative" />
            </div>
            <h1
              className="mb-2 text-[2rem] font-semibold tracking-[0.07em] sm:text-[2.125rem]"
              style={{
                color: 'rgba(248,250,252,0.96)',
                fontFamily: "'Plus Jakarta Sans', sans-serif",
              }}
            >
              ZIKUK
            </h1>
            <p
              className="mx-auto max-w-[18rem] text-[15px] leading-relaxed tracking-[-0.01em] sm:text-base"
              style={{ color: 'rgba(148,163,184,0.88)' }}
            >
              Your workspace, refined around you.
            </p>
          </header>

          {/* Sign-in panel */}
          <div
            className="rounded-2xl border px-6 py-5 sm:px-6 sm:py-5"
            style={{
              backgroundColor: 'rgba(10,14,28,0.72)',
              borderColor: 'rgba(255,255,255,0.08)',
              boxShadow: `
                0 24px 80px rgba(0,0,0,0.45),
                inset 0 1px 0 rgba(255,255,255,0.06),
                inset -1px 0 0 rgba(26,114,255,0.07),
                inset 1px 0 0 rgba(255,32,189,0.05)
              `,
              backdropFilter: 'blur(18px)',
              WebkitBackdropFilter: 'blur(18px)',
            }}
          >
            {!isSupabaseConfigured ? (
              <div
                className="rounded-xl p-4 text-sm leading-relaxed"
                style={{
                  backgroundColor: 'rgba(239,68,68,0.08)',
                  border: '1px solid rgba(239,68,68,0.28)',
                  color: '#fca5a5',
                }}
              >
                <p className="font-semibold mb-2">App configuration error</p>
                <p style={{ color: '#94a3b8' }}>
                  This deployment is missing Supabase environment variables. Add{' '}
                  <code className="text-xs">VITE_SUPABASE_URL</code> and{' '}
                  <code className="text-xs">VITE_SUPABASE_ANON_KEY</code> in Vercel, then redeploy.
                </p>
              </div>
            ) : (
              <>
                <p
                  className="mb-4 text-center text-[10px] font-semibold uppercase"
                  style={{
                    fontFamily: "'Space Grotesk', sans-serif",
                    letterSpacing: '0.2em',
                    color: 'rgba(148,163,184,0.55)',
                  }}
                >
                  Enter ZIKUK
                </p>

                <button
                  type="button"
                  onClick={handleGoogle}
                  disabled={loading}
                  className="flex w-full items-center justify-center gap-3 rounded-xl py-3.5 text-sm font-semibold transition-all disabled:opacity-50"
                  style={{
                    backgroundColor: '#fff',
                    color: '#1a1a1a',
                    border: '1px solid rgba(226,232,240,0.9)',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.12)',
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
              </>
            )}
          </div>
        </div>
      </main>

      <style>{`
        .auth-bg-drift-wrap {
          position: absolute;
          inset: 0;
        }
        .auth-bg-drift-motion {
          position: absolute;
          inset: -5%;
          width: 110%;
          height: 110%;
          will-change: transform;
          animation: auth-bg-drift 17s ease-in-out infinite alternate;
        }
        .auth-bg-image {
          object-fit: cover;
          object-position: center 47%;
        }
        .auth-bg-ambient-light {
          position: absolute;
          inset: -8%;
          opacity: 0.28;
          will-change: transform;
          animation: auth-bg-ambient 17s ease-in-out infinite alternate-reverse;
          background:
            radial-gradient(ellipse 42% 36% at 18% 78%, rgba(26, 114, 255, 0.14) 0%, transparent 72%),
            radial-gradient(ellipse 38% 32% at 50% 46%, rgba(123, 77, 255, 0.08) 0%, transparent 70%),
            radial-gradient(ellipse 40% 34% at 82% 22%, rgba(255, 32, 189, 0.12) 0%, transparent 72%);
          filter: blur(48px);
        }
        @media (min-width: 768px) and (max-width: 1023px) {
          .auth-bg-image {
            object-position: center 46%;
          }
        }
        @media (min-width: 1024px) {
          .auth-bg-image {
            object-position: center 48%;
          }
        }
        @media (max-width: 767px) {
          .auth-bg-drift-motion {
            inset: -4%;
            width: 108%;
            height: 108%;
            animation: auth-bg-drift-mobile 17s ease-in-out infinite alternate;
          }
          .auth-bg-image {
            object-position: center 44%;
          }
          .auth-bg-ambient-light {
            opacity: 0.18;
            animation: auth-bg-ambient-mobile 17s ease-in-out infinite alternate-reverse;
          }
        }
        .auth-bg-vignette-edge {
          background: radial-gradient(
            ellipse 115% 95% at 50% 48%,
            transparent 52%,
            rgba(0, 1, 25, 0.22) 100%
          );
        }
        .auth-bg-vignette-mobile {
          background: radial-gradient(
            ellipse 72% 58% at 50% 46%,
            rgba(0, 1, 25, 0.38) 0%,
            rgba(0, 1, 25, 0.12) 55%,
            transparent 78%
          );
        }
        @keyframes auth-bg-drift {
          from {
            transform: translate3d(-14px, -9px, 0) scale(1.035);
          }
          to {
            transform: translate3d(14px, 9px, 0) scale(1.065);
          }
        }
        @keyframes auth-bg-drift-mobile {
          from {
            transform: translate3d(-4px, -2px, 0) scale(1.084);
          }
          to {
            transform: translate3d(4px, 2px, 0) scale(1.092);
          }
        }
        @keyframes auth-bg-ambient {
          from {
            transform: translate3d(8px, 5px, 0) scale(1);
          }
          to {
            transform: translate3d(-8px, -5px, 0) scale(1.008);
          }
        }
        @keyframes auth-bg-ambient-mobile {
          from {
            transform: translate3d(2px, 1px, 0) scale(1);
          }
          to {
            transform: translate3d(-2px, -1px, 0) scale(1.002);
          }
        }
        @keyframes auth-bg-reveal {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes auth-enter {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .auth-bg-drift-wrap {
            animation: none !important;
            opacity: 1 !important;
          }
          .auth-bg-drift-motion {
            animation: none !important;
            transform: translate3d(0, 0, 0) scale(1.035) !important;
          }
          .auth-bg-ambient-light {
            display: none !important;
          }
          @media (max-width: 767px) {
            .auth-bg-drift-motion {
              transform: translate3d(0, 0, 0) scale(1.084) !important;
            }
          }
        }
      `}</style>
    </div>
  );
}
