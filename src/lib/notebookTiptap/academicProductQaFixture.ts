/**
 * DEV / test-only Academic Block visual QA body.
 * Never auto-loaded into production notebooks.
 */

import { PRODUCT_ACADEMIC_TONES } from './candidateBlockCommands';
import { calloutLabel } from './visualTokens';

/** Stacked academic blocks + EN/HE + math + marks for visual inspection. */
export const ACADEMIC_PRODUCT_QA_BODY = [
  'Normal paragraph before academic blocks.',
  ...PRODUCT_ACADEMIC_TONES.map(tone => {
    const label = calloutLabel(tone);
    return `!${tone} ${label} — English sample. Important idea with $E=mc^2$.`;
  }),
  '!definition האינפלציה היא עלייה מתמשכת ברמת המחירים הכללית.',
  '!concept מושג מפתח: ביקוש אפקטיבי.',
  'Normal paragraph after stacked academic blocks.',
].join('\n');
