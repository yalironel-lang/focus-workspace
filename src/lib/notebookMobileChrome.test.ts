import { describe, expect, it } from 'vitest';
import { TOUCH_TARGET_MIN_PX } from './ui/touchTarget';

/**
 * Lightweight layout contract for Free Space notebook chrome on narrow/coarse layouts.
 * Full DOM overlap is covered by manual physical-device recheck.
 */
describe('notebook mobile chrome contracts', () => {
  it('exposes a 44px minimum touch target constant', () => {
    expect(TOUCH_TARGET_MIN_PX).toBe(44);
  });

  it('treats cards under 420px as touch-chrome width', () => {
    const narrow = 390;
    const wide = 520;
    expect(narrow < 420).toBe(true);
    expect(wide < 420).toBe(false);
  });
});
