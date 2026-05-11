/**
 * Returns true when Cmd/Ctrl+K should NOT open the command palette
 * (typing in editors, form fields, etc.).
 */
export function isCommandPaletteBlockedTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;

  const el = target;

  /** Palette’s own fields should not block ⌘K (toggle closed). */
  if (el.closest('[data-fw-command-palette-root="1"]')) return false;

  /** Notebook / custom editor hosts (covers contenteditable descendants). */
  if (el.closest('[data-fw-cmd-ignore="1"]')) return true;

  if (el.isContentEditable) return true;
  if (el.closest('[contenteditable="true"]')) return true;

  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
    const input = el as HTMLInputElement;
    if (tag === 'INPUT' && (input.type === 'button' || input.type === 'submit' || input.type === 'checkbox' || input.type === 'radio')) {
      return false;
    }
    return true;
  }

  return false;
}
