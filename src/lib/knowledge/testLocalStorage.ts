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
