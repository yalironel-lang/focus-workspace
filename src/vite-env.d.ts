/// <reference types="vite/client" />

declare const __APP_BUILD_ID__: string;
declare const __GIT_COMMIT__: string;
declare const __FW_FEATURE_FLAGS__: string;

interface ImportMetaEnv {
  readonly VITE_NOTEBOOK_V1_PAGES?: string;
  readonly VITE_PENCILKIT_SPIKE_BOOT?: string;
  readonly VITE_PENCILKIT_INK_PAGE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  __fwBuildInfo?: () => import('./lib/appBuildInfo').FwBuildInfo;
  __fwInkDraftMode?: () => import('./lib/handwritingInkDraftMode').FwInkDraftModeDiag;
  __fwHwPaintProfile?: () => import('./lib/handwritingPaintProfile').HwPaintProfileSnapshot;
  __fwHwPaintProfileClear?: () => void;
  __fwIdbEnv?: () => import('./lib/indexedDbEnvironment').IndexedDbEnvironmentReport;
  __fwPdfDiag?: () => import('./lib/pdfUploadDiag').PdfUploadDiagEntry[];
  __fwPdfDiagClear?: () => void;
  __fwSaveDiag?: () => Promise<import('./lib/saveDiagnostics').SaveDiagSnapshot>;
  __fwCloudDiag?: () => Promise<import('./lib/saveDiagnostics').CloudDiagSnapshot>;
}
