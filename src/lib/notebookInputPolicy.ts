/**
 * Ink-first input policy — P0: Apple Pencil must never enter the text pipeline.
 * Future explicit handwriting→text conversion is out of scope here.
 */

const PEN_TEXT_BLOCK_MS = 450;

let lastPointerType: string | null = null;
let penTextBlockUntil = 0;

export function isPenPointer(e: Pick<PointerEvent, 'pointerType'>): boolean {
  return e.pointerType === 'pen';
}

/** Call on notebook pointerdown (capture) to track the active pointer kind. */
export function noteNotebookPointerDown(e: Pick<PointerEvent, 'pointerType'>): void {
  lastPointerType = e.pointerType;
  if (e.pointerType === 'pen') {
    penTextBlockUntil = Date.now() + PEN_TEXT_BLOCK_MS;
  }
}

/** Extend pen-text block window after pen up (iOS Scribble can fire after lift). */
export function noteNotebookPointerUp(e: Pick<PointerEvent, 'pointerType'>): void {
  if (e.pointerType === 'pen') {
    penTextBlockUntil = Math.max(penTextBlockUntil, Date.now() + PEN_TEXT_BLOCK_MS);
  }
}

/** Keyboard typing clears pen-origin so typed keys are not blocked after Pencil use. */
export function noteNotebookKeyboardTyping(): void {
  if (lastPointerType === 'pen') lastPointerType = 'keyboard';
  penTextBlockUntil = 0;
}

export function wasLastPointerPen(): boolean {
  return lastPointerType === 'pen';
}

export function isPenTextBlockActive(): boolean {
  return wasLastPointerPen() || Date.now() < penTextBlockUntil;
}

const PEN_TEXT_INPUT_TYPES = new Set([
  'insertText',
  'insertCompositionText',
  'insertFromComposition',
  'insertFromHandwriting',
  'insertReplacementText',
  'insertLineBreak',
  'insertParagraph',
]);

export function isPenOriginatedTextInputType(inputType: string | undefined | null): boolean {
  if (!inputType) return false;
  return PEN_TEXT_INPUT_TYPES.has(inputType);
}

/** True when beforeinput must be prevented on notebook text surfaces. */
export function shouldRejectPenTextBeforeInput(ie: Pick<InputEvent, 'inputType'>): boolean {
  const t = ie.inputType;
  if (!isPenOriginatedTextInputType(t)) return false;
  if (t === 'insertFromHandwriting') return true;
  return isPenTextBlockActive();
}

/** Pen must not focus contenteditable text lines. */
export function shouldBlockPenFocusOnText(): boolean {
  return isPenTextBlockActive();
}

/** Local debug only — inkPenTrace HUD. */
export function getNotebookInputPolicyDebugState(): {
  lastPointerType: string | null;
  penTextBlockUntil: number;
  penBlockActive: boolean;
} {
  return {
    lastPointerType,
    penTextBlockUntil,
    penBlockActive: isPenTextBlockActive(),
  };
}

/** Reset for tests. */
export function resetNotebookInputPolicyForTests(): void {
  lastPointerType = null;
  penTextBlockUntil = 0;
}
