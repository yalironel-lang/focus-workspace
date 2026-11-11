/**
 * Node 22+/26 may expose a global `localStorage` that is undefined without
 * `--localstorage-file`, which shadows happy-dom's Storage. Provide a usable
 * in-memory implementation when clear/setItem are missing.
 */
export function ensureTestLocalStorage(): void {
  const existing = globalThis.localStorage;
  if (existing && typeof existing.clear === 'function' && typeof existing.setItem === 'function') {
    return;
  }
  const map = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    key(index: number) {
      return [...map.keys()][index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(String(key), String(value));
    },
  };
  Object.defineProperty(globalThis, 'localStorage', {
    value: storage,
    configurable: true,
    writable: true,
  });
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'localStorage', {
      value: storage,
      configurable: true,
      writable: true,
    });
  }
}

type StorageMethodName = 'getItem' | 'setItem' | 'removeItem' | 'clear' | 'key';

/**
 * happy-dom Storage is a Proxy whose `set` trap silently ignores assignment to
 * existing methods (`storage.setItem = …` is a no-op). Use defineProperty so
 * exception-path tests can actually intercept reads/writes.
 */
export function patchStorageMethod<K extends StorageMethodName>(
  storage: Storage,
  method: K,
  implementation: Storage[K],
): () => void {
  const previous = storage[method].bind(storage) as Storage[K];
  Object.defineProperty(storage, method, {
    configurable: true,
    writable: true,
    value: implementation,
  });
  return () => {
    Object.defineProperty(storage, method, {
      configurable: true,
      writable: true,
      value: previous,
    });
  };
}

export function withPatchedStorageMethod<K extends StorageMethodName, T>(
  storage: Storage,
  method: K,
  implementation: Storage[K],
  run: () => T,
): T {
  const restore = patchStorageMethod(storage, method, implementation);
  try {
    return run();
  } finally {
    restore();
  }
}
