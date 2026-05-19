import { useEffect, useState } from 'react';

export type LibraryBreakpoint = 'mobile' | 'tablet' | 'desktop';

const QUERIES: Record<LibraryBreakpoint, string> = {
  mobile: '(max-width: 767px)',
  tablet: '(min-width: 768px) and (max-width: 1023px)',
  desktop: '(min-width: 1024px)',
};

function readBreakpoint(): LibraryBreakpoint {
  if (typeof window === 'undefined') return 'desktop';
  if (window.matchMedia(QUERIES.mobile).matches) return 'mobile';
  if (window.matchMedia(QUERIES.tablet).matches) return 'tablet';
  return 'desktop';
}

export function useLibraryBreakpoint(): LibraryBreakpoint {
  const [bp, setBp] = useState<LibraryBreakpoint>(readBreakpoint);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mMobile = window.matchMedia(QUERIES.mobile);
    const mTablet = window.matchMedia(QUERIES.tablet);
    const mDesktop = window.matchMedia(QUERIES.desktop);
    const update = () => setBp(readBreakpoint());
    mMobile.addEventListener('change', update);
    mTablet.addEventListener('change', update);
    mDesktop.addEventListener('change', update);
    update();
    return () => {
      mMobile.removeEventListener('change', update);
      mTablet.removeEventListener('change', update);
      mDesktop.removeEventListener('change', update);
    };
  }, []);

  return bp;
}

export const LIBRARY_SIDEBAR_EXPANDED_PX = 210;
export const LIBRARY_SIDEBAR_COLLAPSED_PX = 58;
export const LIBRARY_SIDEBAR_MARGIN_PX = 12;

/** Total horizontal flex footprint for the sidebar slot (rail + left margin). */
export function librarySidebarSlotWidthPx(collapsed: boolean, isMobile: boolean): number {
  if (isMobile) return 0;
  const rail = collapsed ? LIBRARY_SIDEBAR_COLLAPSED_PX : LIBRARY_SIDEBAR_EXPANDED_PX;
  return rail + LIBRARY_SIDEBAR_MARGIN_PX;
}
