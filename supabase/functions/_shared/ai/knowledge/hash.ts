/**
 * Deterministic SHA-256 hex of PDF bytes (Web Crypto).
 */

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  // Copy first — digest may detach the caller's ArrayBuffer.
  const copy = bytes.slice();
  const digest = await crypto.subtle.digest('SHA-256', copy);
  const view = new Uint8Array(digest);
  let out = '';
  for (let i = 0; i < view.length; i++) {
    out += view[i]!.toString(16).padStart(2, '0');
  }
  return out;
}
