// Public CA artifacts only. No network, private journals or global trust changes.
import { constants, openSync, fstatSync, readSync, closeSync, lstatSync } from 'node:fs';
import { X509Certificate, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { REF } from './adapter.mjs';

export const CA_SOURCE = 'Supabase staging Dashboard > Database Settings > SSL Configuration > Download Certificate';
const fail = () => Error('TRUSTED_CA_UNAVAILABLE');
const validated = new WeakMap();
export function validateRecoveryCA(pem, provenance, now = Date.now()) {
  try {
    if (typeof pem !== 'string' || pem.length > 32768 || !Number.isFinite(now)) throw fail();
    // Exactly one public certificate; no keys, extra certificates or trailing data.
    if (!/^\s*-----BEGIN CERTIFICATE-----\r?\n[A-Za-z0-9+/=\r\n]+\r?\n-----END CERTIFICATE-----\s*$/.test(pem)) throw fail();
    const cert = new X509Certificate(pem);
    const fingerprint = createHash('sha256').update(cert.raw).digest('hex');
    if (!cert.ca || !cert.checkIssued(cert) || !cert.verify(cert.publicKey)
      || !(Date.parse(cert.validFrom) <= now && now < Date.parse(cert.validTo))) throw fail();
    if (!provenance || Object.keys(provenance).sort().join(',') !== 'operatorAttestation,projectRef,sha256,source'
      || provenance.projectRef !== REF || provenance.source !== CA_SOURCE
      || provenance.operatorAttestation !== 'Downloaded from the authenticated staging Dashboard; not from a database TLS connection'
      || typeof provenance.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(provenance.sha256)
      || provenance.sha256 !== fingerprint) throw fail();
    // Freeze the outward handle; keep certificate bytes out of logs/serialization.
    const handle = Object.freeze({ validated: true });
    validated.set(handle, cert.toString());
    return handle;
  } catch { throw fail(); }
}
export function recoveryCABytes(handle) {
  const pem = validated.get(handle);
  if (!pem) throw fail();
  return pem;
}
function boundedPublicFile(path, max, io) {
  let fd;
  try {
    fd = io.openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const stat = io.fstatSync(fd);
    if (!stat.isFile() || stat.uid !== process.getuid() || (stat.mode & 0o022) !== 0 || stat.size > max) throw fail();
    const buffer = Buffer.alloc(max + 1); let used = 0;
    while (used < buffer.length) {
      const n = io.readSync(fd, buffer, used, buffer.length - used, used);
      if (!n) break; used += n;
    }
    if (!used || used > max) throw fail();
    return buffer.subarray(0, used).toString('utf8');
  } catch { throw fail(); }
  finally { if (fd !== undefined) io.closeSync(fd); }
}
export function loadRecoveryCA(io = { openSync, fstatSync, readSync, closeSync, lstatSync }) {
  try {
    const dir = io.lstatSync(fileURLToPath(new URL('./trust', import.meta.url)));
    if (!dir.isDirectory() || dir.isSymbolicLink() || dir.uid !== process.getuid() || (dir.mode & 0o022) !== 0) throw fail();
    const pem = boundedPublicFile(fileURLToPath(new URL('./trust/staging-ca.pem', import.meta.url)), 32768, io);
    const provenance = JSON.parse(boundedPublicFile(fileURLToPath(new URL('./trust/staging-ca-provenance.json', import.meta.url)), 2048, io));
    return validateRecoveryCA(pem, provenance);
  } catch { throw fail(); }
}
