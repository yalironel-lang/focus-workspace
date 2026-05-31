import type { CourseTrapPrototype } from './courseTrapPrototypeLibrary';

const MAX_CHOICE_LEN = 56;

function truncate(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trim()}…`;
}

function capitalizeFirst(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Two-line hook above impulse choices. */
export function impulseHookLines(trap: CourseTrapPrototype): [string, string] {
  const titleHead = trap.title.split('—')[0]?.trim() ?? trap.title;
  const line1 = truncate(titleHead, 32);
  const fork = trap.forkPhrase.trim();
  const line2 = fork
    ? capitalizeFirst(truncate(fork.endsWith('.') ? fork : `${fork}.`, 48))
    : truncate(trap.topic, 48);
  return [line1, line2];
}

export function impulseChoiceA(trap: CourseTrapPrototype): string {
  return truncate(trap.pathA, MAX_CHOICE_LEN);
}

export function impulseChoiceB(trap: CourseTrapPrototype): string {
  return truncate(trap.pathB, MAX_CHOICE_LEN);
}

export function impulseSnapMessage(hitTrap: boolean): string {
  return hitTrap ? 'Trap.' : 'Good catch.';
}

/** Summary sting line, e.g. "The income increase got you." */
export function impulseStingLine(trap: CourseTrapPrototype): string {
  const head = trap.title.split('—')[0]?.trim().toLowerCase() ?? trap.topic.toLowerCase();
  return `The ${head} got you.`;
}
