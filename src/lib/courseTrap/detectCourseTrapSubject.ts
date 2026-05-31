export type CourseTrapSubject = 'calculus' | 'economics' | 'physics';

const CALCULUS_KEYWORDS = [
  'calc',
  'calculus',
  'derivative',
  'integral',
  'limit',
  'mat13',
  'math13',
  'math 1',
  'math1',
  'lhopital',
  "l'hopital",
  'taylor',
  'riemann',
];

const ECONOMICS_KEYWORDS = [
  'econ',
  'economics',
  'micro',
  'macro',
  'slutsky',
  'consumer',
  'welfare',
  'gdp',
  'monopoly',
  'elasticity',
];

const PHYSICS_KEYWORDS = [
  'phys',
  'physics',
  'mechanics',
  'kinematics',
  'force',
  'torque',
  'newton',
  'momentum',
  'incline',
  'electro',
];

function haystackFrom(fileName: string, title: string): string {
  return `${fileName} ${title}`.toLowerCase();
}

function matchesAny(haystack: string, keywords: string[]): boolean {
  return keywords.some(kw => haystack.includes(kw));
}

export function detectCourseTrapSubject(
  fileName: string,
  title: string,
): CourseTrapSubject | null {
  const hay = haystackFrom(fileName, title);

  if (matchesAny(hay, ['micro', 'macro', 'slutsky', 'monopsony', 'gdp'])) {
    return 'economics';
  }
  if (matchesAny(hay, ECONOMICS_KEYWORDS)) return 'economics';
  if (matchesAny(hay, CALCULUS_KEYWORDS)) return 'calculus';
  if (matchesAny(hay, PHYSICS_KEYWORDS)) return 'physics';

  return null;
}

export function subjectDisplayLabel(subject: CourseTrapSubject): string {
  switch (subject) {
    case 'calculus':
      return 'Calculus';
    case 'economics':
      return 'Economics';
    case 'physics':
      return 'Physics';
  }
}
