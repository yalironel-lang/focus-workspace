import { describe, expect, it } from 'vitest';
import {
  PDF_RECOVERY_DIAG_STORAGE_KEY,
  persistOwnerPdfRecoveryDiagOptInFromSearch,
  readOwnerPdfRecoveryDiagOptIn,
} from './ownerPdfRecoveryDiagOptIn';

describe('ownerPdfRecoveryDiagOptIn', () => {
  it('reads opt-in from query param', () => {
    expect(
      readOwnerPdfRecoveryDiagOptIn({
        search: '?pdfRecoveryDiag=1',
        storage: { getItem: () => null },
      }),
    ).toBe(true);
  });

  it('reads opt-in from storage when query absent', () => {
    expect(
      readOwnerPdfRecoveryDiagOptIn({
        search: '',
        storage: {
          getItem: (k) => (k === PDF_RECOVERY_DIAG_STORAGE_KEY ? '1' : null),
        },
      }),
    ).toBe(true);
  });

  it('is off without query or storage', () => {
    expect(
      readOwnerPdfRecoveryDiagOptIn({
        search: '?other=1',
        storage: { getItem: () => null },
      }),
    ).toBe(false);
  });

  it('persists opt-in from query into storage', () => {
    const store = new Map<string, string>();
    expect(
      persistOwnerPdfRecoveryDiagOptInFromSearch('?pdfRecoveryDiag=1', {
        setItem: (k, v) => {
          store.set(k, v);
        },
      }),
    ).toBe(true);
    expect(store.get(PDF_RECOVERY_DIAG_STORAGE_KEY)).toBe('1');
  });

  it('does not persist when query absent', () => {
    let wrote = false;
    expect(
      persistOwnerPdfRecoveryDiagOptInFromSearch('', {
        setItem: () => {
          wrote = true;
        },
      }),
    ).toBe(false);
    expect(wrote).toBe(false);
  });
});
