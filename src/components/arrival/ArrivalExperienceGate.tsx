import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { LIBRARY_OPEN_CREATE_FLAG } from '../../command/constants';
import { useCommandPalette } from '../../command/CommandPaletteContext';
import { useAuth } from '../../hooks/useAuth';
import { useSections } from '../../hooks/useSections';
import { hasSeenArrivalExperience, markArrivalExperienceSeen } from '../../lib/arrivalExperience';
import { navDebugLog } from '../../lib/navigationDebug';
import { ArrivalExperienceLayer, type ArrivalExperienceAction } from './ArrivalExperienceLayer';

function isEligibleAutoRoute(pathname: string): boolean {
  return pathname === '/dashboard';
}

export function ArrivalExperienceGate() {
  const { user, loading } = useAuth();
  const { sections, loading: sectionsLoading, error: sectionsError } = useSections();
  const location = useLocation();
  const navigate = useNavigate();
  const { tokens, arrivalExperienceOpen, closeArrivalExperience } = useCommandPalette();
  const [seen, setSeen] = useState<boolean>(() => hasSeenArrivalExperience());
  const [autoOpen, setAutoOpen] = useState(false);
  const prevPathRef = useRef(location.pathname);
  const suppressAutoOpenRef = useRef(false);

  useEffect(() => {
    if (!user) {
      setAutoOpen(false);
      return;
    }
    setSeen(hasSeenArrivalExperience());
  }, [user]);

  useEffect(() => {
    const prev = prevPathRef.current;
    if (prev !== location.pathname) {
      if (autoOpen || arrivalExperienceOpen) suppressAutoOpenRef.current = true;
      navDebugLog('arrival-route-reset', { from: prev, to: location.pathname });
      setAutoOpen(false);
      closeArrivalExperience();
    }
    prevPathRef.current = location.pathname;
  }, [location.pathname, autoOpen, arrivalExperienceOpen, closeArrivalExperience]);

  useEffect(() => {
    if (suppressAutoOpenRef.current) return;
    if (loading || sectionsLoading || !user || seen || arrivalExperienceOpen || sectionsError) return;
    if (!isEligibleAutoRoute(location.pathname)) return;
    if (sections.length > 0) return;
    setAutoOpen(true);
  }, [
    arrivalExperienceOpen,
    loading,
    location.pathname,
    seen,
    sections.length,
    sectionsError,
    sectionsLoading,
    user,
  ]);

  const open = useMemo(() => {
    if (loading || !user || location.pathname === '/') return false;
    if (arrivalExperienceOpen) return true;
    return autoOpen && isEligibleAutoRoute(location.pathname);
  }, [arrivalExperienceOpen, autoOpen, loading, location.pathname, user]);

  const closeAndPersist = useCallback(() => {
    markArrivalExperienceSeen();
    setSeen(true);
    setAutoOpen(false);
    closeArrivalExperience();
  }, [closeArrivalExperience]);

  const handleAction = useCallback(
    (action: ArrivalExperienceAction) => {
      if (action === 'library' || action === 'start') {
        if (action === 'start') {
          try {
            sessionStorage.setItem(LIBRARY_OPEN_CREATE_FLAG, '1');
          } catch {
            /* ignore */
          }
        }
        navigate('/dashboard');
      }
      closeAndPersist();
    },
    [closeAndPersist, navigate],
  );

  if (!open) return null;

  return (
    <ArrivalExperienceLayer
      tokens={tokens}
      reopened={!autoOpen}
      onAction={handleAction}
    />
  );
}
