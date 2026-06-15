/// <reference types="vite/client" />

declare const __APP_BUILD_ID__: string;
declare const __GIT_COMMIT__: string;

interface ImportMetaEnv {
  readonly VITE_NOTEBOOK_V1_PAGES?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  __fwBuildInfo?: () => import('./lib/appBuildInfo').FwBuildInfo;
}
