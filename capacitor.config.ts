import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Phase 0 iOS spike. Bundle ID is a placeholder, not a published identity.
 * webDir is the Vite outDir. HTTPS localhost origin keeps IndexedDB / secure-context APIs.
 */
const config: CapacitorConfig = {
  appId: 'com.zikuk.app',
  appName: 'ZIKUK',
  webDir: 'dist',
  server: {
    hostname: 'localhost',
    iosScheme: 'https',
  },
};

export default config;
