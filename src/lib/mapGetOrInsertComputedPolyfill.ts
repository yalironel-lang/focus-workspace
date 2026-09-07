/**
 * Compatibility shim for Map/WeakMap.prototype.getOrInsertComputed (ES2025).
 * Used by modern pdfjs-dist on runtimes that lack the native method (Tauri WKWebView).
 * Semantics match PDF.js legacy / TC39: compute once on miss, canonicalize Map -0 → +0.
 */

type GetOrInsertComputedFn = (key: unknown, callbackfn: (key: unknown) => unknown) => unknown;

function installOnMap(): void {
  const proto = Map.prototype as Map<unknown, unknown> & {
    getOrInsertComputed?: GetOrInsertComputedFn;
  };
  if (typeof proto.getOrInsertComputed === 'function') return;

  Object.defineProperty(proto, 'getOrInsertComputed', {
    configurable: true,
    writable: true,
    value: function getOrInsertComputed(
      this: Map<unknown, unknown>,
      key: unknown,
      callbackfn: (key: unknown) => unknown,
    ): unknown {
      if (typeof callbackfn !== 'function') {
        throw new TypeError('Map.prototype.getOrInsertComputed callback must be a function');
      }
      if (this.has(key)) {
        return this.get(key);
      }
      // CanonicalizeKeyedCollectionKey: -0 → +0
      let storeKey = key;
      if (key === 0 && 1 / (key as number) === -Infinity) {
        storeKey = 0;
      }
      const value = callbackfn(storeKey);
      this.set(storeKey, value);
      return value;
    },
  });
}

function installOnWeakMap(): void {
  const proto = WeakMap.prototype as WeakMap<object, unknown> & {
    getOrInsertComputed?: GetOrInsertComputedFn;
  };
  if (typeof proto.getOrInsertComputed === 'function') return;

  Object.defineProperty(proto, 'getOrInsertComputed', {
    configurable: true,
    writable: true,
    value: function getOrInsertComputed(
      this: WeakMap<object, unknown>,
      key: object,
      callbackfn: (key: object) => unknown,
    ): unknown {
      if (typeof callbackfn !== 'function') {
        throw new TypeError('WeakMap.prototype.getOrInsertComputed callback must be a function');
      }
      // Native WeakMap.has throws TypeError for non-object keys — preserve that.
      if (this.has(key)) {
        return this.get(key);
      }
      const value = callbackfn(key);
      this.set(key, value);
      return value;
    },
  });
}

/** Install Map/WeakMap getOrInsertComputed only where missing. Idempotent. */
export function installMapGetOrInsertComputedPolyfill(): void {
  installOnMap();
  installOnWeakMap();
}
