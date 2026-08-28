/**
 * Collect notebook inline image keys from editor blocks / serialized body / pages.
 */

const IMG_REF_RE = /^::img::([a-z0-9-]+)::/;

export function referencedNotebookImageKeys(body: string): string[] {
  const keys = new Set<string>();
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    const m = trimmed.match(IMG_REF_RE);
    if (m?.[1]) keys.add(m[1]);
  }
  return [...keys];
}

export function collectNotebookImageKeys(input: {
  blockKeys?: readonly string[];
  body?: string;
}): string[] {
  const keys = new Set<string>();
  for (const k of input.blockKeys ?? []) {
    if (k) keys.add(k);
  }
  for (const k of referencedNotebookImageKeys(input.body ?? '')) {
    keys.add(k);
  }
  return [...keys];
}
