import { describe, expect, it } from 'vitest';
import {
  CAPTURE_REGION_DIAG_QUERY,
  CAPTURE_REGION_DIAG_STORAGE_KEY,
  persistCaptureRegionDiagOptInFromSearch,
  readCaptureRegionDiagOptIn,
} from './captureRegionDiagOptIn';

describe('captureRegionDiagOptIn', () => {
  it('reads opt-in from query or session storage only', () => {
    const storage = {
      store: {} as Record<string, string>,
      getItem(key: string) {
        return this.store[key] ?? null;
      },
      setItem(key: string, value: string) {
        this.store[key] = value;
      },
    };

    expect(readCaptureRegionDiagOptIn({ search: '', storage })).toBe(false);
    expect(readCaptureRegionDiagOptIn({ search: `?${CAPTURE_REGION_DIAG_QUERY}=1`, storage })).toBe(
      true,
    );

    expect(persistCaptureRegionDiagOptInFromSearch(`?${CAPTURE_REGION_DIAG_QUERY}=1`, storage)).toBe(
      true,
    );
    expect(storage.store[CAPTURE_REGION_DIAG_STORAGE_KEY]).toBe('1');
    expect(readCaptureRegionDiagOptIn({ search: '', storage })).toBe(true);
  });
});
