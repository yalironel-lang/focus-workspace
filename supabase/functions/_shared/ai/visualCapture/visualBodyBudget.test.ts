import { describe, expect, it } from 'vitest';
import { allowVisualSizedGatewayBody } from './visualSelectionContract.ts';

describe('visual body allowance', () => {
  it('rejects visual markers outside an actual visual capture', () => {
    for (const body of [
      { capability: 'explain_selection', attachmentType: 'visual_selection' },
      { capability: 'ask_course', version: 3, sectionId: 's', recentTurns: [{ attachmentType: 'visual_selection' }] },
      { capability: 'ask_course', version: 3, sectionId: 's', capture: { attachmentType: 'visual_selection', textKind: 'visual_selection' } },
    ]) expect(allowVisualSizedGatewayBody(JSON.stringify(body))).toBe(false);
  });
  it('rejects malformed JSON', () => {
    expect(allowVisualSizedGatewayBody('{"attachmentType":"visual_selection"')).toBe(false);
  });
});
