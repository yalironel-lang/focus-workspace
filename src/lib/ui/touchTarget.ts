export const TOUCH_TARGET_MIN_PX = 44;

export function touchMinSizeStyle(): { minWidth: number; minHeight: number } {
  return { minWidth: TOUCH_TARGET_MIN_PX, minHeight: TOUCH_TARGET_MIN_PX };
}
