import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { LIBRARY_OPEN_CREATE_FLAG } from '../../command/constants';
import { useCommandPalette } from '../../command/CommandPaletteContext';
import { useAuth } from '../../hooks/useAuth';
import { useSections } from '../../hooks/useSections';
import { hasSeenArrivalExperience, markArrivalExperienceSeen } from '../../lib/arrivalExperience';
import { isStabilityFeatureDisabled } from '../../lib/stabilityBaseline';
import { navDebugLog } from '../../lib/navigationDebug';
import { ArrivalExperienceLayer, type ArrivalExperienceAction } from './ArrivalExperienceLayer';

export function ArrivalExperienceGate() {
  const { user, loading } = useAuth();
  const { sections: _sections, loading: sectionsLoading, error: sectionsError } = useSections();
  const location = useLocation();
  const navigate = useNavigate();
  const { tokens, arrivalExperienceOpen, closeArrivalExperience } = useCommandPalette();
  const [seen, setSeen] = useState<boolean>(() => hasSeenArrivalExperience());
  const prevPathRef = useRef(location.pathname);

  useEffect(() => {
    if (!user) return;
    setSeen(hasSeenArrivalExperience());
  }, [user]);

  useEffect(() => {
    const prev = prevPathRef.current;
    if (prev !== location.pathname) {
      navDebugLog('arrival-route-reset', { from: prev, to: location.pathname });
      if (arrivalExperienceOpen) closeArrivalExperience();
    }
    prevPathRef.current = location.pathname;
  }, [location.pathname, arrivalExperienceOpen, closeArrivalExperience]);

  // Auto-open on first visit removed: IntroExperience + the library empty state
  // already orient new users. The arrival experience remains accessible via
  // command palette (arrivalExperienceOpen).
  const open = useMemo(() => {
    if (loading || sectionsLoading || sectionsError || !user || seen || location.pathname === '/') return false;
    return arrivalExperienceOpen;
  }, [arrivalExperienceOpen, loading, sectionsLoading, sectionsError, location.pathname, seen, user]);

  const closeAndPersist = useCallback(() => {
    markArrivalExperienceSeen();
    setSeen(true);
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

  if (isStabilityFeatureDisabled('disableArrivalExperienceGate') || !open) return null;

  return (
    <ArrivalExperienceLayer
      tokens={tokens}
      reopened={true}
      onAction={handleAction}
    />
  );
}
