// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  APP_CHROME_SAFE_PAD_TOP_CSS_VAR,
  APP_CONNECTIVITY_INSET_CSS_VAR,
  clearAppConnectivityInset,
  setAppConnectivityInsetPx,
} from './appConnectivityInset';

const props = new Map<string, string>();

beforeEach(() => {
  props.clear();
  (globalThis as unknown as { document: Document }).document = {
    documentElement: {
      style: {
        setProperty: (key: string, value: string) => {
          props.set(key, value);
        },
        removeProperty: (key: string) => {
          props.delete(key);
        },
        getPropertyValue: (key: string) => props.get(key) ?? '',
      },
    },
  } as unknown as Document;
});

afterEach(() => {
  clearAppConnectivityInset();
  props.clear();
});

describe('appConnectivityInset', () => {
  it('publishes measured inset for fixed chrome offset', () => {
    setAppConnectivityInsetPx(64.4);
    expect(props.get(APP_CONNECTIVITY_INSET_CSS_VAR)).toBe('64px');
    expect(props.get(APP_CHROME_SAFE_PAD_TOP_CSS_VAR)).toBe('8px');
  });

  it('clears inset and safe-pad when banner is gone', () => {
    setAppConnectivityInsetPx(40);
    clearAppConnectivityInset();
    expect(props.get(APP_CONNECTIVITY_INSET_CSS_VAR)).toBe('0px');
    expect(props.has(APP_CHROME_SAFE_PAD_TOP_CSS_VAR)).toBe(false);
  });
});
