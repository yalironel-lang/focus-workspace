/**
 * M1.0B B2 — isolated page OCR recovery worker bounds (prototype).
 * Not wired to production Edge/ingest.
 */

/** Recovery contract version — bump when result semantics change. */
export const PAGE_OCR_RECOVERY_VERSION = 'page-ocr-recovery-v1' as const;

/** Default render DPI proven by M1.0B0 (~220). */
export const PAGE_OCR_DEFAULT_DPI = 220;

/** Hard ceiling for render DPI in this prototype. */
export const PAGE_OCR_MAX_DPI = 300;

/** Soft minimum (avoid uselessly tiny rasters). */
export const PAGE_OCR_MIN_DPI = 120;

/** Max wall-clock for one recovery operation (ms). */
export const PAGE_OCR_TIMEOUT_MS = 60_000;

/** Max recovered UTF-16 code units retained in result. */
export const PAGE_OCR_MAX_OUTPUT_CHARS = 50_000;

/** Subprocess kill grace after timeout (ms). */
export const PAGE_OCR_SUBPROCESS_KILL_GRACE_MS = 2_000;

/** Default Tesseract language (local tessdata only). */
export const PAGE_OCR_TESSERACT_LANG = 'eng';

/** Temp directory name prefix under os.tmpdir(). */
export const PAGE_OCR_TEMP_PREFIX = 'zikuk-m10b2-ocr-';
