/**
 * Section ownership for ask_course — JWT uid is authoritative.
 * Call BEFORE embedding / search / generation.
 */

export type SectionAuthResult =
  | { ok: true }
  | { ok: false; code: 'not_found' };

export type LoadSectionOwner = (sectionId: string) => Promise<{ userId: string } | null>;

/**
 * Missing and foreign sections both map to not_found (no cross-user leak).
 */
export async function authorizeAskCourseSection(input: {
  authUserId: string;
  sectionId: string;
  loadSectionOwner: LoadSectionOwner;
}): Promise<SectionAuthResult> {
  const row = await input.loadSectionOwner(input.sectionId);
  if (!row || row.userId !== input.authUserId) {
    return { ok: false, code: 'not_found' };
  }
  return { ok: true };
}
