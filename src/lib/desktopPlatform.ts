/**
 * Minimal desktop platform probe for Tauri.
 * Capacitor.isNativePlatform() remains false here — do not treat Tauri as Cap iOS.
 */
export type ZikukRuntimePlatform = 'web' | 'capacitor_ios' | 'tauri_desktop';

export function isTauriDesktop(): boolean {
  if (typeof window === 'undefined') return false;
  return '__TAURI_INTERNALS__' in window || '__TAURI__' in window;
}

export function getZikukRuntimePlatform(isCapacitorNative: boolean): ZikukRuntimePlatform {
  if (isTauriDesktop()) return 'tauri_desktop';
  if (isCapacitorNative) return 'capacitor_ios';
  return 'web';
}
