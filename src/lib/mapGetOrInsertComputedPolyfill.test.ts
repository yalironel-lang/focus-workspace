import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installMapGetOrInsertComputedPolyfill } from './mapGetOrInsertComputedPolyfill';

type ProtoWithMethod = {
  getOrInsertComputed?: (key: unknown, callbackfn: (key: unknown) => unknown) => unknown;
};

const mapProto = Map.prototype as Map<unknown, unknown> & ProtoWithMethod;
const weakMapProto = WeakMap.prototype as WeakMap<object, unknown> & ProtoWithMethod;

let mapOriginal: ProtoWithMethod['getOrInsertComputed'];
let weakMapOriginal: ProtoWithMethod['getOrInsertComputed'];
let mapOwn: boolean;
let weakMapOwn: boolean;

beforeEach(() => {
  mapOwn = Object.prototype.hasOwnProperty.call(mapProto, 'getOrInsertComputed');
  weakMapOwn = Object.prototype.hasOwnProperty.call(weakMapProto, 'getOrInsertComputed');
  mapOriginal = mapProto.getOrInsertComputed;
  weakMapOriginal = weakMapProto.getOrInsertComputed;
});

afterEach(() => {
  if (mapOwn) {
    Object.defineProperty(mapProto, 'getOrInsertComputed', {
      configurable: true,
      writable: true,
      value: mapOriginal,
    });
  } else {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete mapProto.getOrInsertComputed;
  }
  if (weakMapOwn) {
    Object.defineProperty(weakMapProto, 'getOrInsertComputed', {
      configurable: true,
      writable: true,
      value: weakMapOriginal,
    });
  } else {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete weakMapProto.getOrInsertComputed;
  }
});

function stripMapMethod(): void {
  // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
  delete mapProto.getOrInsertComputed;
}

function stripWeakMapMethod(): void {
  // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
  delete weakMapProto.getOrInsertComputed;
}

describe('installMapGetOrInsertComputedPolyfill — Map', () => {
  it('installs when missing', () => {
    stripMapMethod();
    expect(typeof mapProto.getOrInsertComputed).not.toBe('function');
    installMapGetOrInsertComputedPolyfill();
    expect(typeof mapProto.getOrInsertComputed).toBe('function');
  });

  it('does not overwrite existing implementation', () => {
    const sentinel = vi.fn(function (this: Map<unknown, unknown>, key: unknown, cb: (k: unknown) => unknown) {
      return cb(key);
    });
    Object.defineProperty(mapProto, 'getOrInsertComputed', {
      configurable: true,
      writable: true,
      value: sentinel,
    });
    installMapGetOrInsertComputedPolyfill();
    expect(mapProto.getOrInsertComputed).toBe(sentinel);
  });

  it('existing key returns existing value without calling callback', () => {
    stripMapMethod();
    installMapGetOrInsertComputedPolyfill();
    const m = new Map<unknown, unknown>([['a', 1]]);
    const cb = vi.fn(() => 99);
    expect(m.getOrInsertComputed!('a', cb)).toBe(1);
    expect(cb).not.toHaveBeenCalled();
  });

  it('callback called only for missing key and inserts computed value', () => {
    stripMapMethod();
    installMapGetOrInsertComputedPolyfill();
    const m = new Map<unknown, unknown>();
    const cb = vi.fn((key: unknown) => `v-${String(key)}`);
    expect(m.getOrInsertComputed!('x', cb)).toBe('v-x');
    expect(cb).toHaveBeenCalledTimes(1);
    expect(m.get('x')).toBe('v-x');
    expect(m.getOrInsertComputed!('x', cb)).toBe('v-x');
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('canonicalizes -0 to +0', () => {
    stripMapMethod();
    installMapGetOrInsertComputedPolyfill();
    const m = new Map<unknown, unknown>();
    const negZero = -0;
    const cb = vi.fn((key: unknown) => {
      expect(Object.is(key, 0)).toBe(true);
      expect(Object.is(key, -0)).toBe(false);
      return 'zero';
    });
    expect(m.getOrInsertComputed!(negZero, cb)).toBe('zero');
    expect(m.has(0)).toBe(true);
    expect(m.has(-0)).toBe(true); // Map treats -0 and +0 as same key
    expect(m.get(0)).toBe('zero');
    expect(cb).toHaveBeenCalledTimes(1);
    // lookup via +0 hits existing entry without recompute
    expect(m.getOrInsertComputed!(0, () => 'other')).toBe('zero');
  });

  it('throws TypeError when callback is not a function', () => {
    stripMapMethod();
    installMapGetOrInsertComputedPolyfill();
    const m = new Map();
    expect(() => m.getOrInsertComputed!('k', null as unknown as (k: unknown) => unknown)).toThrow(TypeError);
  });
});

describe('installMapGetOrInsertComputedPolyfill — WeakMap', () => {
  it('installs when missing', () => {
    stripWeakMapMethod();
    expect(typeof weakMapProto.getOrInsertComputed).not.toBe('function');
    installMapGetOrInsertComputedPolyfill();
    expect(typeof weakMapProto.getOrInsertComputed).toBe('function');
  });

  it('does not overwrite native implementation', () => {
    const sentinel = vi.fn(function (
      this: WeakMap<object, unknown>,
      key: object,
      cb: (k: object) => unknown,
    ) {
      return cb(key);
    });
    Object.defineProperty(weakMapProto, 'getOrInsertComputed', {
      configurable: true,
      writable: true,
      value: sentinel,
    });
    installMapGetOrInsertComputedPolyfill();
    expect(weakMapProto.getOrInsertComputed).toBe(sentinel);
  });

  it('existing key returns existing value', () => {
    stripWeakMapMethod();
    installMapGetOrInsertComputedPolyfill();
    const k = {};
    const wm = new WeakMap<object, unknown>([[k, 7]]);
    const cb = vi.fn(() => 99);
    expect(wm.getOrInsertComputed!(k, cb)).toBe(7);
    expect(cb).not.toHaveBeenCalled();
  });

  it('computed insert for missing key', () => {
    stripWeakMapMethod();
    installMapGetOrInsertComputedPolyfill();
    const k = {};
    const wm = new WeakMap<object, unknown>();
    const cb = vi.fn(() => 'ins');
    expect(wm.getOrInsertComputed!(k, cb)).toBe('ins');
    expect(wm.get(k)).toBe('ins');
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('invalid key behavior matches native WeakMap', () => {
    stripWeakMapMethod();
    installMapGetOrInsertComputedPolyfill();
    const wm = new WeakMap<object, unknown>();
    expect(() =>
      wm.getOrInsertComputed!(null as unknown as object, () => 1),
    ).toThrow(TypeError);
  });

  it('throws TypeError when callback is not a function', () => {
    stripWeakMapMethod();
    installMapGetOrInsertComputedPolyfill();
    const wm = new WeakMap<object, unknown>();
    const k = {};
    expect(() => wm.getOrInsertComputed!(k, 1 as unknown as (key: object) => unknown)).toThrow(
      TypeError,
    );
  });
});
