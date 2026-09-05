import { useEffect, useState } from 'react';
import { isNativePlatform } from '../lib/nativeOAuthDeepLink';
import {
  readPresentationProfileFromWindow,
  type WorkspacePresentationProfile,
} from '../lib/workspacePresentationProfile';

/**
 * Live presentation profile (resize + pointer media). Defaults to desktop
 * during SSR / first paint without window.
 */
export function useWorkspacePresentationProfile(): WorkspacePresentationProfile {
  const [profile, setProfile] = useState<WorkspacePresentationProfile>(() => {
    if (typeof window === 'undefined') return 'desktop';
    return readPresentationProfileFromWindow(window, isNativePlatform());
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const update = () => {
      setProfile(readPresentationProfileFromWindow(window, isNativePlatform()));
    };

    update();
    window.addEventListener('resize', update);
    const mq = window.matchMedia('(pointer: coarse)');
    const onMq = () => update();
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', onMq);
    } else {
      mq.addListener(onMq);
    }
    return () => {
      window.removeEventListener('resize', update);
      if (typeof mq.removeEventListener === 'function') {
        mq.removeEventListener('change', onMq);
      } else {
        mq.removeListener(onMq);
      }
    };
  }, []);

  return profile;
}
