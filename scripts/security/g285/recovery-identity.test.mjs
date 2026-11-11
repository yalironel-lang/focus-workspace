import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { plan } from './core.mjs';
import { serializePlan } from './scope.mjs';
import { originalAccountPair, revealOriginalAccounts, REVEAL_PHRASE } from './recovery-identity.mjs';

const fixtures = () => {
  const ids = [randomUUID(), randomUUID()];
  return { ids, manifests: Array.from({ length: 5 }, () => serializePlan(plan(ids.map(id => ({ id }))))) };
};
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

test('five fully validated synthetic scopes preserve original A/B order', () => {
  const f = fixtures();
  assert(same(originalAccountPair(f.manifests), f.ids));
});
test('missing, extra and malformed batches fail without identity output', async () => {
  const f = fixtures();
  for (const batch of [null, [], f.manifests.slice(0, 4), [...f.manifests, f.manifests[0]], [null, ...f.manifests.slice(1)]]) {
    let writes = 0;
    await assert.rejects(revealOriginalAccounts({ attest: async () => 'I ACCEPT PROCEDURAL PRIVACY',
      confirm: async () => REVEAL_PHRASE, load: () => batch, write: () => writes++ }), /^Error: IDENTITY_UNAVAILABLE$/);
    assert.equal(writes, 0);
  }
});
test('different, swapped and duplicate pairs fail full scope validation', () => {
  for (const kind of ['different', 'swapped', 'duplicate']) {
    const f = fixtures();
    const ids = kind === 'different' ? [randomUUID(), randomUUID()] : kind === 'swapped' ? [...f.ids].reverse() : [f.ids[0], f.ids[0]];
    if (kind === 'duplicate') f.manifests[4].users = ids;
    else f.manifests[4] = serializePlan(plan(ids.map(id => ({ id }))));
    assert.throws(() => originalAccountPair(f.manifests), /^Error: IDENTITY_UNAVAILABLE$/);
  }
});
test('fifth-manifest digest, project, hierarchy and cross-run corruption prevent any reveal', async () => {
  for (const corrupt of [f => { f.manifests[4].digest = 'bad'; },
    f => { f.manifests[4].ref = 'wrong'; },
    f => { f.manifests[4].rows = []; },
    f => { f.manifests[4] = f.manifests[0]; }]) {
    const f = fixtures(); corrupt(f); let writes = 0;
    await assert.rejects(revealOriginalAccounts({ attest: async () => 'I ACCEPT PROCEDURAL PRIVACY',
      confirm: async () => REVEAL_PHRASE, load: () => f.manifests, write: () => writes++ }), /^Error: IDENTITY_UNAVAILABLE$/);
    assert.equal(writes, 0);
  }
});
test('privacy and reveal gates precede even loading the private inventory', async () => {
  for (const [attestation, phrase] of [['no', REVEAL_PHRASE], ['I ACCEPT PROCEDURAL PRIVACY', 'no']]) {
    let loads = 0, writes = 0;
    await assert.rejects(revealOriginalAccounts({ attest: async () => attestation, confirm: async () => phrase,
      load: () => { loads++; }, write: () => writes++ }), /^Error: IDENTITY_UNAVAILABLE$/);
    assert.equal(loads, 0); assert.equal(writes, 0);
  }
});
test('approved valid reveal is one private write; synthetic identifiers never reach test output', async () => {
  const f = fixtures(); let writes = 0;
  await revealOriginalAccounts({ attest: async () => 'I ACCEPT PROCEDURAL PRIVACY', confirm: async () => REVEAL_PHRASE,
    load: () => f.manifests, write: value => {
      writes++; assert(value === `Account A: ${f.ids[0]}\nAccount B: ${f.ids[1]}\n`);
    } });
  assert.equal(writes, 1);
});
test('loader and output exceptions expose fixed errors only', async () => {
  const f = fixtures();
  for (const location of ['load', 'write']) {
    await assert.rejects(revealOriginalAccounts({ attest: async () => 'I ACCEPT PROCEDURAL PRIVACY', confirm: async () => REVEAL_PHRASE,
      load: () => { if (location === 'load') throw Error('PRIVATE_SENTINEL'); return f.manifests; },
      write: () => { throw Error('PRIVATE_SENTINEL'); } }), /^Error: IDENTITY_UNAVAILABLE$/);
  }
});
