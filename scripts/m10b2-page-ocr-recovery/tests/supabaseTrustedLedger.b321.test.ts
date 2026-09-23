/**
 * @vitest-environment node
 *
 * M1.0B B3.2.1 — Supabase trusted ledger adapter guards (no remote I/O).
 */

import { describe, expect, it, vi } from 'vitest';
import {
  createSupabaseTrustedLedger,
  type SupabaseRpcClient,
} from '../src/supabaseTrustedLedger.ts';

function fakeClient(overrides?: Partial<SupabaseRpcClient>): SupabaseRpcClient {
  return {
    rpc: vi.fn(async () => ({ data: { ok: true, job: null }, error: null })),
    storage: {
      from: () => ({
        download: vi.fn(async () => ({ data: null, error: { message: 'no' } })),
      }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: function eq2() {
            return this;
          },
          maybeSingle: async () => ({ data: null, error: null }),
          single: async () => ({ data: null, error: null }),
        }),
      }),
    }),
    ...overrides,
  };
}

describe('createSupabaseTrustedLedger staging guards', () => {
  it('refuses Production project ref', () => {
    expect(() =>
      createSupabaseTrustedLedger(fakeClient(), {
        projectRef: 'comxmviofnotfwzbupxg',
      }),
    ).toThrow(/refuses_production_ref/);
  });

  it('requires staging ref lmgrhmyurhjlwwdedojk', () => {
    expect(() =>
      createSupabaseTrustedLedger(fakeClient(), {
        projectRef: 'cmfpjffwghfdhvgptoxd',
      }),
    ).toThrow(/requires_staging_ref/);
  });

  it('accepts staging and maps empty claim', async () => {
    const ledger = createSupabaseTrustedLedger(fakeClient(), {
      projectRef: 'lmgrhmyurhjlwwdedojk',
    });
    const claim = await ledger.claimJob();
    expect(claim).toEqual({ ok: true, job: null });
  });

  it('rejects URL/path injection on download', async () => {
    const download = vi.fn(async () => ({ data: null, error: null }));
    const from = vi.fn(() => ({ download }));
    const ledger = createSupabaseTrustedLedger(
      {
        ...fakeClient(),
        storage: { from },
      },
      { projectRef: 'lmgrhmyurhjlwwdedojk' },
    );
    expect(await ledger.downloadPdfByStoragePath('https://evil.example/a.pdf')).toBeNull();
    expect(await ledger.downloadPdfByStoragePath('../etc/passwd')).toBeNull();
    expect(await ledger.downloadPdfByStoragePath('/abs/path')).toBeNull();
    expect(download).not.toHaveBeenCalled();
  });

  it('defaults Storage bucket to user-content', async () => {
    const download = vi.fn(async () => ({
      data: new Blob([new Uint8Array([1, 2, 3])]),
      error: null,
    }));
    const from = vi.fn(() => ({ download }));
    const ledger = createSupabaseTrustedLedger(
      {
        ...fakeClient(),
        storage: { from },
      },
      { projectRef: 'lmgrhmyurhjlwwdedojk' },
    );
    const bytes = await ledger.downloadPdfByStoragePath(
      '11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/obj/pdf/obj',
    );
    expect(from).toHaveBeenCalledWith('user-content');
    expect(bytes?.byteLength).toBe(3);
  });

  it('maps claim job payload from RPC snake_case', async () => {
    const ledger = createSupabaseTrustedLedger(
      {
        ...fakeClient(),
        rpc: vi.fn(async () => ({
          data: {
            ok: true,
            job: {
              id: 'j1',
              user_id: 'u1',
              section_id: 's1',
              source_id: 'src1',
              source_version: 2,
              page_number: 3,
              extraction_version: 'pdf-extract-v2-metrics',
              recovery_version: 'page-ocr-v1',
              status: 'claimed',
              attempt_count: 1,
              detector_reasons: ['SHELL_WITH_MISSING_CONTENT'],
              claim_token: 'tok',
              lease_expires_at: '2099-01-01T00:00:00Z',
            },
          },
          error: null,
        })),
      },
      { projectRef: 'lmgrhmyurhjlwwdedojk' },
    );
    const claim = await ledger.claimJob();
    expect(claim.ok).toBe(true);
    if (!claim.ok || !claim.job) throw new Error('expected job');
    expect(claim.job.sourceVersion).toBe(2);
    expect(claim.job.pageNumber).toBe(3);
    expect(claim.job.claimToken).toBe('tok');
  });
});
