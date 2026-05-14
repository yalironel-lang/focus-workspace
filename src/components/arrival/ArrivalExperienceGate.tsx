import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useCommandPalette } from '../../command/CommandPaletteContext';
import { useAuth } from '../../hooks/useAuth';
import { hasSeenArrivalExperience, markArrivalExperienceSeen } from '../../lib/arrivalExperience';
import { ArrivalExperienceLayer, type ArrivalExperienceAction } from './ArrivalExperienceLayer';

function isEligibleAutoRoute(pathname: string): boolean {
  return pathname === '/dashboard' || pathname === '/desk' || pathname.startsWith('/section/');
}

export function ArrivalExperienceGate() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { tokens, arrivalExperienceOpen, closeArrivalExperience } = useCommandPalette();
  const [seen, setSeen] = useState<boolean>(() => hasSeenArrivalExperience());
  const [autoOpen, setAutoOpen] = useState(false);

  useEffect(() => {
    if (!user) {
      setAutoOpen(false);
      return;
    }
    setSeen(hasSeenArrivalExperience());
  }, [user]);

  useEffect(() => {
    if (loading || !user || seen || arrivalExperienceOpen) return;
    if (!isEligibleAutoRoute(location.pathname)) return;
    setAutoOpen(true);
  }, [arrivalExperienceOpen, loading, location.pathname, seen, user]);

  const open = useMemo(
    () => !loading && !!user && location.pathname !== '/' && (arrivalExperienceOpen || autoOpen),
    [arrivalExperienceOpen, autoOpen, loading, location.pathname, user],
  );

  const closeAndPersist = useCallback(() => {
    markArrivalExperienceSeen();
    setSeen(true);
    setAutoOpen(false);
    closeArrivalExperience();
  }, [closeArrivalExperience]);

  const handleAction = useCallback(
    (action: ArrivalExperienceAction) => {
      if (action === 'library') {
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
