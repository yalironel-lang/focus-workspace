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
