// Synthetic, offline test certificate. Its disposable key is discarded, never logged.
import { execFileSync } from 'node:child_process';
import { X509Certificate, createHash } from 'node:crypto';
import { REF } from './adapter.mjs';
import { CA_SOURCE } from './recovery-ca.mjs';
export function syntheticCA(ca = true) {
  return execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:P-256',
    '-nodes', '-keyout', '/dev/null', '-subj', '/CN=synthetic-offline-test', '-days', '1',
    '-addext', `basicConstraints=critical,CA:${ca ? 'TRUE' : 'FALSE'}`],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}
export function syntheticProvenance(pem) {
  return { projectRef: REF, source: CA_SOURCE,
    operatorAttestation: 'Downloaded from the authenticated staging Dashboard; not from a database TLS connection',
    sha256: createHash('sha256').update(new X509Certificate(pem).raw).digest('hex') };
}
