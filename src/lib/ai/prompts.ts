import type { ChatMessage } from './types';

const SYSTEM_STUDY = `You are a calm study helper for optional cloud model features in Focus Workspace. Be concise, accurate, and plain. No hype. No markdown unless the user content is technical and needs short bullets. Never invent facts about the user's files beyond what they gave you.`;

export function promptSummarizeNote(noteTitle: string, noteBody: string): ChatMessage[] {
  return [
    { role: 'system', content: SYSTEM_STUDY },
    {
      role: 'user',
      content: `Summarize this note in 3–6 short bullets or one tight paragraph. Title: "${noteTitle}"\n\n---\n${noteBody}`,
    },
  ];
}

export function promptExplainMistakeSimple(mistakeText: string, context?: string): ChatMessage[] {
  return [
    { role: 'system', content: SYSTEM_STUDY },
    {
      role: 'user',
      content: `Explain this mistake in simple terms for a learner. What went wrong and the correct idea (2–5 sentences).\n\nMistake: ${mistakeText}${context ? `\n\nContext: ${context}` : ''}`,
    },
  ];
}

export function promptPracticeQuestions(topic: string, sourceText: string): ChatMessage[] {
  return [
    { role: 'system', content: SYSTEM_STUDY },
    {
      role: 'user',
      content: `Topic: ${topic}\n\nGenerate 5 short practice questions (mix recall + one applied). Number them. Base only on:\n\n${sourceText}`,
    },
  ];
}

export function promptRephraseConcept(concept: string): ChatMessage[] {
  return [
    { role: 'system', content: SYSTEM_STUDY },
    {
      role: 'user',
      content: `Rephrase this concept in a fresh way for studying (same meaning, clearer wording). One paragraph.\n\n${concept}`,
    },
  ];
}

export function promptSuggestRelatedMistakes(mistakeText: string, otherMistakes: string[]): ChatMessage[] {
  const list = otherMistakes.length
    ? otherMistakes.map((m, i) => `${i + 1}. ${m}`).join('\n')
    : '(none listed)';
  return [
    { role: 'system', content: SYSTEM_STUDY },
    {
      role: 'user',
      content: `Current mistake: ${mistakeText}\n\nOther mistakes on this canvas:\n${list}\n\nSuggest up to 3 related mistakes the learner should review next (by number or quote). One line each with why it's related.`,
    },
  ];
}

export function promptTestConnection(): ChatMessage[] {
  return [
    { role: 'system', content: 'Reply with the single word OK and nothing else.' },
    { role: 'user', content: 'Ping.' },
  ];
}
