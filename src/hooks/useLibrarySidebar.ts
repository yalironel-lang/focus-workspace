import { useCallback, useEffect, useState } from 'react';
import { librarySidebarSlotWidthPx, useLibraryBreakpoint } from './useLibraryBreakpoint';

const STORAGE_KEY = 'fw_library_sidebar_collapsed_v1';

function readCollapsed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function useLibrarySidebar() {
  const breakpoint = useLibraryBreakpoint();
  const isMobile = breakpoint === 'mobile';
  const isTablet = breakpoint === 'tablet';
  const isDesktop = breakpoint === 'desktop';

  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!isMobile) setMobileOpen(false);
  }, [isMobile]);

  const toggleCollapsed = useCallback(() => {
    setCollapsed(prev => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      } catch {
        /* quota */
      }
      return next;
    });
  }, []);

  const openMobile = useCallback(() => setMobileOpen(true), []);
  const closeMobile = useCallback(() => setMobileOpen(false), []);

  const railCollapsed = !isMobile && collapsed;
  const slotWidthPx = librarySidebarSlotWidthPx(railCollapsed, isMobile);

  return {
    breakpoint,
    isMobile,
    isTablet,
    isDesktop,
    collapsed,
    railCollapsed,
    slotWidthPx,
    mobileOpen,
    toggleCollapsed,
    openMobile,
    closeMobile,
  };
}
