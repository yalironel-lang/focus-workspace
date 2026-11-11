// Private operator display only. Importing this module never reads private files.
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeSync } from 'node:fs';
import { loadPrivateRecoveryManifests } from './recovery-operator.mjs';
import { validateRecoveryScopes } from './recovery-verify.mjs';
import { privatePrompt, requirePrivacyAttestation } from './operator.mjs';

export const REVEAL_PHRASE = 'REVEAL G2.85 ORIGINAL ACCOUNT IDS PRIVATELY';
const unavailable = () => Error('IDENTITY_UNAVAILABLE');

export function originalAccountPair(manifests) {
  try {
    if (!Array.isArray(manifests) || manifests.length !== 5
      || !Array.isArray(manifests[0]?.users)) throw unavailable();
    const pair = [...manifests[0].users];
    // Includes full digest, staging, hierarchy, scope and cross-run checks.
    validateRecoveryScopes(manifests, pair);
    return Object.freeze(pair);
  } catch { throw unavailable(); }
}

export async function revealOriginalAccounts({ attest, confirm, load, write }) {
  try {
    requirePrivacyAttestation(await attest());
    if (await confirm() !== REVEAL_PHRASE) throw unavailable();
    const pair = originalAccountPair(load());
    // The sole identifier output: an explicitly approved, private Terminal display.
    write(`Account A: ${pair[0]}\nAccount B: ${pair[1]}\n`);
  } catch { throw unavailable(); }
}

async function main() {
  try {
    if (process.argv.length !== 2 || !process.stdin.isTTY || !process.stdout.isTTY
      || process.execArgv.length !== 0 || ['NODE_OPTIONS', 'NODE_DEBUG', 'NODE_DEBUG_NATIVE',
        'SSLKEYLOGFILE'].some(k => process.env[k])) throw unavailable();
    writeSync(1, 'Private display only. No AI execution, recording, screen sharing, debugger or terminal logging. TTY checks provide procedural privacy only.\n');
    await revealOriginalAccounts({
      attest: () => privatePrompt('Type I ACCEPT PROCEDURAL PRIVACY'),
      confirm: () => privatePrompt(`Type ${REVEAL_PHRASE}`),
      load: () => loadPrivateRecoveryManifests(join(homedir(), '.zikuk-g285-private')),
      write: value => writeSync(1, value),
    });
  } catch {
    try { writeSync(1, 'IDENTITY_UNAVAILABLE\n'); } catch {}
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { process.exitCode = 1; });
}
