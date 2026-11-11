import test from 'node:test';
import assert from 'node:assert/strict';
import { X509Certificate } from 'node:crypto';
import { constants } from 'node:fs';
import { validateRecoveryCA, recoveryCABytes, loadRecoveryCA } from './recovery-ca.mjs';
import { recoveryConnectionConfig, RECOVERY_ENDPOINT } from './recovery-operator.mjs';
import { REF } from './adapter.mjs';
import { syntheticCA, syntheticProvenance } from './test-ca-fixture.mjs';
const pem = syntheticCA(), proof = syntheticProvenance(pem), cert = new X509Certificate(pem);
const reject = f => assert.throws(f, /^Error: TRUSTED_CA_UNAVAILABLE$/);

test('valid synthetic self-signed CA is constrained to one client without exposing its bytes in handle', () => {
  const handle = validateRecoveryCA(pem, proof);
  assert.equal(JSON.stringify(handle), '{"validated":true}');
  const config = recoveryConnectionConfig('synthetic', REF, RECOVERY_ENDPOINT, handle);
  assert.equal(config.ssl.ca, pem); assert.equal(config.ssl.rejectUnauthorized, true);
  assert.equal(config.host, 'aws-0-eu-west-1.pooler.supabase.com');
});
test('absent or forged validation handle cannot configure a connection', () => {
  for (const handle of [undefined, null, {}, { validated: true }]) {
    reject(() => recoveryConnectionConfig('synthetic', REF, RECOVERY_ENDPOINT, handle));
  }
});
test('fingerprint alone is insufficient without explicit staging Dashboard provenance', () => {
  for (const p of [{ sha256: proof.sha256 }, { ...proof, source: 'database TLS connection' },
    { ...proof, projectRef: 'wrong' }, { ...proof, operatorAttestation: '' }, { ...proof, extra: true },
    { ...proof, sha256: '0'.repeat(64) }]) reject(() => validateRecoveryCA(pem, p));
});
test('malformed PEM, extra certificates, key material and trailing data fail closed', () => {
  for (const p of ['', 'PRIVATE_SENTINEL', pem + pem, pem + '\nPRIVATE_SENTINEL',
    pem.replace('CERTIFICATE', 'PRIVATE KEY')]) reject(() => validateRecoveryCA(p, proof));
});
test('non-CA certificate, future and expired validity are rejected', () => {
  const leaf = syntheticCA(false); reject(() => validateRecoveryCA(leaf, syntheticProvenance(leaf)));
  reject(() => validateRecoveryCA(pem, proof, Date.parse(cert.validFrom) - 1));
  reject(() => validateRecoveryCA(pem, proof, Date.parse(cert.validTo)));
  reject(() => validateRecoveryCA(pem, proof, NaN));
});
test('wrong CA bytes and modified signatures cannot reuse provenance', () => {
  const other = syntheticCA(); reject(() => validateRecoveryCA(other, proof));
  const raw = Buffer.from(cert.raw); raw[raw.length - 1] ^= 1;
  const modified = '-----BEGIN CERTIFICATE-----\n' + raw.toString('base64').match(/.{1,64}/g).join('\n') + '\n-----END CERTIFICATE-----\n';
  reject(() => validateRecoveryCA(modified, syntheticProvenance(modified)));
});
test('validation errors never expose PEM or provenance fields', () => {
  try { validateRecoveryCA('PRIVATE_SENTINEL', { source: 'PRIVATE_SENTINEL' }); }
  catch (error) { assert.equal(error.message, 'TRUSTED_CA_UNAVAILABLE'); assert(!JSON.stringify(error).includes('PRIVATE_SENTINEL')); }
  reject(() => recoveryCABytes({}));
});

function fileIO(options = {}) {
  const files = [Buffer.from(pem), Buffer.from(JSON.stringify(proof))];
  let opened = 0, closed = 0;
  const io = {
    lstatSync: () => ({ isDirectory: () => true, isSymbolicLink: () => !!options.symlinkDir,
      uid: process.getuid(), mode: options.writableDir ? 0o777 : 0o755 }),
    openSync(path, flags) {
      assert(flags & constants.O_NOFOLLOW); assert(flags & constants.O_NONBLOCK);
      assert.equal(flags & (constants.O_WRONLY | constants.O_RDWR | constants.O_CREAT | constants.O_TRUNC), 0);
      if (options.missing) throw Error('PRIVATE_SENTINEL');
      assert(path.endsWith(opened === 0 ? '/trust/staging-ca.pem' : '/trust/staging-ca-provenance.json'));
      return opened++;
    },
    fstatSync: fd => ({ isFile: () => !options.nonregular, uid: options.foreign ? -1 : process.getuid(),
      mode: options.writableFile ? 0o666 : 0o644, size: options.oversize ? 100000 : files[fd].length }),
    readSync(fd, buffer, offset, length, position) {
      const source = options.malformedProof && fd === 1 ? Buffer.from('PRIVATE_SENTINEL') : files[fd];
      return source.copy(buffer, offset, position, position + length);
    },
    closeSync() { closed++; },
  };
  return { io, stats: () => ({ opened, closed }) };
}
test('fixed local public-file loader validates provenance and uses bounded read-only no-follow descriptors', () => {
  const f = fileIO(); assert.equal(recoveryCABytes(loadRecoveryCA(f.io)), pem);
  assert.deepEqual(f.stats(), { opened: 2, closed: 2 });
});
test('missing, malformed, unsafe or oversized local CA inputs cannot produce a trust handle', () => {
  for (const options of [{ missing: true }, { symlinkDir: true }, { writableDir: true },
    { writableFile: true }, { foreign: true }, { oversize: true }, { nonregular: true }, { malformedProof: true }]) {
    const f = fileIO(options); reject(() => loadRecoveryCA(f.io));
    assert.equal(f.stats().opened, f.stats().closed);
  }
});
