export type AISelectionKind = 'none' | 'note' | 'notebook' | 'mistake' | 'other';

/** Optional AI actions on the current workspace Free Space selection (registered by SectionPage). */
export type AIWorkspaceHandlers = {
  getSelectionKind: () => AISelectionKind;
  summarizeSelection: () => Promise<void>;
  explainMistakeSelection: () => Promise<void>;
  practiceQuestionsSelection: () => Promise<void>;
  rephraseSelection: () => Promise<void>;
  suggestRelatedMistakesSelection: () => Promise<void>;
};
