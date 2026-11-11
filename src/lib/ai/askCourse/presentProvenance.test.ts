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

  it('keeps the PDF page text marker for native-page provenance', () => {
    const shown = presentAnswerTextForProvenance(
      'The Mean Value Theorem guarantees a point c. [PDF page text] [3]',
      'pdf_page_native',
    );
    expect(shown).toContain('[PDF page text]');
    expect(shown).not.toMatch(/\[\d+\]/);
  });

  it('strips PDF page text markers from general academic answers', () => {
    const shown = presentAnswerTextForProvenance(
      'A Taylor series is a local polynomial. [PDF page text]',
      'general_academic',
    );
    expect(shown).not.toMatch(/PDF page text/i);
  });

  it('keeps the visual selection marker for pdf_selection_visual', () => {
    const shown = presentAnswerTextForProvenance(
      'The integrand is continuous. [PDF visual selection] [4]',
      'pdf_selection_visual',
    );
    expect(shown).toContain('[PDF visual selection]');
    expect(shown).not.toMatch(/\[\d+\]/);
  });

  it('strips visual selection markers from general academic answers', () => {
    const shown = presentAnswerTextForProvenance(
      'Integration by parts applies. [PDF visual selection]',
      'general_academic',
    );
    expect(shown).not.toMatch(/PDF visual selection/i);
  });

  it('leaves course-material citations in place', () => {
    expect(presentAnswerTextForProvenance('See the notes [1].', 'course_material')).toContain('[1]');
  });
});