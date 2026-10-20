import { describe, expect, it } from 'vitest';
import { presentAnswerTextForProvenance } from './presentProvenance';

describe('presentAnswerTextForProvenance', () => {
  it('hides numbered and PDF markers on general academic answers', () => {
    const shown = presentAnswerTextForProvenance(
      'The divergence theorem equates flux to a volume integral. [1] [PDF selection]',
      'general_academic',
    );
    expect(shown).not.toMatch(/\[\d+\]/);
    expect(shown).not.toMatch(/PDF selection/i);
    expect(shown).toContain('divergence theorem');
  });

  it('keeps the PDF selection marker when the answer is attributed to the selection', () => {
    const shown = presentAnswerTextForProvenance(
      'Detrimental reliance may substitute for consideration. [PDF selection] [2]',
      'pdf_selection',
    );
    expect(shown).toContain('[PDF selection]');
    expect(shown).not.toMatch(/\[\d+\]/);
  });

  it('leaves course-material citations in place', () => {
    expect(presentAnswerTextForProvenance('See the notes [1].', 'course_material')).toContain('[1]');
  });
});