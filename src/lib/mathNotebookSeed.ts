/**
 * Math Zone — problem anchor card body.
 * Seeded into the small problem-definition card at the top of the three-zone layout.
 * No heading: position already communicates "this is the problem."
 * One placeholder line only — a clean label, not a document.
 */
export const MATH_ZONE_SEED_BODY = `Write the question here.
`;

/**
 * Math Zone — solution/derivation zone body.
 * One empty step block: signals the pattern without prescribing a cognitive process.
 * The numbered counter "1" shows the cursor is here and ready.
 * The workspace receives thought — it does not narrate thinking.
 */
export const MATH_ZONE_SOLUTION_SEED = `=>
`;

/** Cinematic starter body for math notebooks — stored as plain notebook lines. */
export const MATH_CALCULUS_NOTEBOOK_SEED = `# Calculus

lim x->0 (sin x)/x = 1

int 0 to 1 x^2 dx

d/dx x^3 = 3x^2

P(Q)=200-30Q-Q^2

MC=2Q
`;

export function isEmptyMathStarterBody(body: string): boolean {
  const t = (body ?? '').trim();
  return t === '' || t === '#\n\n' || /^#\s*Untitled\s*$/i.test(t);
}
