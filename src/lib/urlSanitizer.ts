/**
 * URL Sanitizer for Notebook link mark.
 * Allows safe protocols: http, https, mailto, tel, and relative paths (/path, #anchor).
 * Strips whitespace and control characters.
 * Safely rejects dangerous schemes: javascript:, data:, vbscript:, file:, and protocol-relative (//).
 */

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);

export function sanitizeUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  // Strip all control characters (\u0000-\u001f\u007f\s) and all whitespace
  const cleaned = raw.replace(/[\u0000-\u001f\u007f\s]/g, '');
  if (!cleaned) return null;

  // Reject protocol-relative URLs (e.g. //evil.example)
  if (cleaned.startsWith('//')) return null;

  // Allowed relative paths:
  // Root-relative (starts with single '/') or anchor (starts with '#')
  if (cleaned.startsWith('/') || cleaned.startsWith('#')) {
    return cleaned;
  }

  // Check if it already has a scheme (e.g. proto:...)
  const colonIdx = cleaned.indexOf(':');
  const slashIdx = cleaned.indexOf('/');
  const hasScheme = colonIdx !== -1 && (slashIdx === -1 || colonIdx < slashIdx);

  if (hasScheme) {
    const scheme = cleaned.slice(0, colonIdx + 1).toLowerCase();
    // Strict rejection of dangerous schemes
    if (
      scheme === 'javascript:' ||
      scheme === 'data:' ||
      scheme === 'vbscript:' ||
      scheme === 'file:'
    ) {
      return null;
    }
    if (!ALLOWED_PROTOCOLS.has(scheme)) {
      return null;
    }
    if (scheme === 'http:' || scheme === 'https:') {
      try {
        const u = new URL(cleaned);
        if (!u.hostname) return null;
      } catch {
        return null;
      }
    }
    if (scheme === 'mailto:' || scheme === 'tel:') {
      const rest = cleaned.slice(colonIdx + 1);
      if (!rest) return null;
    }
    return cleaned;
  }

  // Plain domain without scheme (e.g. example.com or www.example.com/path)
  if (/^[a-zA-Z0-9][-a-zA-Z0-9.]*\.[a-zA-Z]{2,}(\/.*)?$/.test(cleaned) || cleaned.startsWith('localhost')) {
    return `https://${cleaned}`;
  }

  return null;
}

/**
 * Checks if a URL is already safe and canonical (no normalization needed).
 * Used at the canonical persistence boundary (codec / storage).
 */
export function isCanonicalUrl(raw: unknown): boolean {
  if (typeof raw !== 'string') return false;
  const sanitized = sanitizeUrl(raw);
  return sanitized !== null && sanitized === raw;
}
