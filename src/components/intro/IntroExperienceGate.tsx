/**
 * Mounts cinematic intro over dashboard on first visit; seamless dissolve into library.
 */

import { motion } from 'framer-motion';
import { useCallback, useEffect, useState } from 'react';
import {
  hasSeenIntroExperience,
  introQueryOverride,
  markIntroExperienceSeen,
} from '../../lib/introExperience';
import { IntroExperience } from './IntroExperience';

interface Props {
  children: React.ReactNode;
}

export function IntroExperienceGate({ children }: Props) {
  const [showIntro, setShowIntro] = useState(() => !hasSeenIntroExperience());
  const [revealed, setRevealed] = useState(() => hasSeenIntroExperience());

  useEffect(() => {
    const q = introQueryOverride();
    if (q === 'replay') {
      setShowIntro(true);
      setRevealed(false);
    }
  }, []);

  const handleComplete = useCallback(() => {
    markIntroExperienceSeen();
    setShowIntro(false);
    setRevealed(true);
  }, []);

  const handleSkip = useCallback(() => {
    markIntroExperienceSeen();
  }, []);

  return (
    <div className="relative min-h-screen">
      <motion.div
        className="min-h-screen"
        initial={false}
        animate={{
          opacity: revealed || !showIntro ? 1 : 0,
          filter: revealed || !showIntro ? 'blur(0px)' : 'blur(10px)',
        }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: showIntro ? 0.15 : 0 }}
        style={{ pointerEvents: showIntro ? 'none' : 'auto' }}
      >
        {children}
      </motion.div>
      {showIntro && (
        <IntroExperience onComplete={handleComplete} onSkip={handleSkip} />
      )}
    </div>
  );
}
