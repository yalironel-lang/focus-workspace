/// <reference types="vite/client" />

declare const __APP_BUILD_ID__: string;

interface ImportMetaEnv {
  readonly VITE_NOTEBOOK_V1_PAGES?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
